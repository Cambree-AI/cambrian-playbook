// api-aws/enrich-free/index.js
//
// AWS port of api/enrich-free.js (issue #87) — free firmographic enrichment
// via SEC EDGAR + Wikidata. No API keys, no paid calls, no secrets. Logic is
// a line-for-line copy of the Vercel handler wrapped in the shared adapter;
// keep the two in sync until the Vercel copy is removed in the final
// conversion issue. Response parity is asserted by
// tests/api-aws/enrich-free.test.js against mocked EDGAR/Wikidata APIs.
//
// GET /api/enrich-free?company=Apple+Inc&domain=apple.com
//
// Priority: SEC EDGAR (authoritative for public cos) > Wikidata (notable cos) > null
//
// Known caveat that travels intact from the Vercel copy (issue #87 scope
// note): EDGAR matching is by company NAME, not domain — ambiguous names can
// resolve to the wrong filer (the identity-contamination weak spot).
//
// Differences from the Vercel copy (all platform-level, issue #87 AC: no
// in-memory cross-request state in ported handlers):
//   - no per-IP rate Map — API Gateway stage throttling covers it
//   - no 24h in-memory response cache (and therefore no `_cached: true`
//     responses) — Lambda instances don't share the Map, so the hit rate
//     would be near zero anyway; edge caching per docs/aws-migration-plan.md
//     §6 is the replacement if EDGAR/Wikidata latency becomes a problem

import { httpAdapter } from "../shared/adapter.js";
import { applyCors, isAllowedOrigin } from "../shared/guard.js";

const UA = "Cambree info@cambree.ai";

// ── SEC EDGAR: search for CIK by company name ──
async function edgarSearchCIK(company) {
  try {
    // Use full-text search on 10-K filings to find the CIK
    const q = encodeURIComponent(`"${company}"`);
    const r = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=10-K&from=0&size=5`,
      { headers: { "User-Agent": UA } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const hits = d.hits?.hits || [];
    if (!hits.length) return null;

    // Find the best match — prefer exact name match in display_names
    const companyLower = company.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const hit of hits) {
      const names = hit._source?.display_names || [];
      for (const name of names) {
        const clean = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (clean.includes(companyLower) || companyLower.includes(clean.split("cik")[0].trim())) {
          return hit._source.ciks?.[0] || null;
        }
      }
    }
    // Fallback: first result
    return hits[0]._source?.ciks?.[0] || null;
  } catch { return null; }
}

// ── SEC EDGAR: get company submissions (name, ticker, SIC, address) ──
async function edgarSubmissions(cik) {
  try {
    const padded = String(cik).replace(/^0+/, "").padStart(10, "0");
    const r = await fetch(
      `https://data.sec.gov/submissions/CIK${padded}.json`,
      { headers: { "User-Agent": UA } }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── SEC EDGAR: get XBRL facts (employee count, revenue) ──
async function edgarFacts(cik) {
  try {
    const padded = String(cik).replace(/^0+/, "").padStart(10, "0");
    const r = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`,
      { headers: { "User-Agent": UA } }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── Extract latest XBRL value for a fact ──
function latestXbrl(factsObj, namespace, ...keys) {
  const ns = factsObj?.facts?.[namespace] || {};
  for (const key of keys) {
    const fact = ns[key];
    if (!fact?.units) continue;
    const unitKey = Object.keys(fact.units)[0];
    const values = fact.units[unitKey];
    if (!Array.isArray(values) || !values.length) continue;
    // Sort by end date descending, prefer 10-K (annual) over 10-Q
    const sorted = values
      .filter(v => v.end && v.val != null)
      .sort((a, b) => {
        const da = new Date(b.end) - new Date(a.end);
        if (da !== 0) return da;
        // Prefer annual filings
        const aAnnual = a.form === "10-K" ? 1 : 0;
        const bAnnual = b.form === "10-K" ? 1 : 0;
        return bAnnual - aAnnual;
      });
    if (sorted.length) return { val: sorted[0].val, end: sorted[0].end, form: sorted[0].form };
  }
  return null;
}

// ── Format revenue ──
function formatRevenue(val) {
  if (!val || isNaN(val)) return "";
  const num = Number(val);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num}`;
}

// ── SIC code to readable industry ──
const SIC_MAP = {
  "6021": "National Commercial Banks", "6022": "State Commercial Banks", "6035": "Savings Institutions",
  "6036": "Savings Institutions", "6020": "Banking", "6099": "Financial Services",
  "7372": "Software", "7371": "Computer Services", "7374": "Data Processing",
  "3674": "Semiconductors", "3672": "Circuit Boards", "5045": "Computer Equipment",
  "5961": "Catalog/Mail-Order", "5912": "Drug Stores", "5411": "Grocery Stores",
  "4813": "Telecommunications", "4812": "Telephone Communications",
  "2834": "Pharmaceuticals", "2836": "Biological Products", "8742": "Management Consulting",
  "6311": "Insurance", "6321": "Accident/Health Insurance", "6331": "Fire/Casualty Insurance",
};
function sicToIndustry(sic, desc) {
  if (desc) return desc;
  return SIC_MAP[sic] || "";
}

// ── Wikidata SPARQL: company lookup ──
async function wikidataLookup(company) {
  try {
    // Sanitize company name for SPARQL — strip characters that could break out of string literal
    // Same character set as the Vercel copy (only lint-redundant escapes dropped)
    const safeCompany = company.replace(/["\\{};.#|&^$!?*+()[\]]/g, "").trim();
    if (!safeCompany) return null;
    const sparql = `SELECT ?item ?itemLabel ?employees ?foundedDate ?hqLabel ?industryLabel WHERE {
  ?item rdfs:label "${safeCompany}"@en .
  ?item wdt:P31/wdt:P279* wd:Q4830453 .
  OPTIONAL { ?item wdt:P1128 ?employees }
  OPTIONAL { ?item wdt:P571 ?foundedDate }
  OPTIONAL { ?item wdt:P159 ?hq . ?hq rdfs:label ?hqLabel . FILTER(LANG(?hqLabel)="en") }
  OPTIONAL { ?item wdt:P452 ?industry . ?industry rdfs:label ?industryLabel . FILTER(LANG(?industryLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 1`;
    const r = await fetch(
      `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
      { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const b = d.results?.bindings?.[0];
    if (!b) return null;
    return {
      employees: b.employees?.value || "",
      founded: b.foundedDate?.value?.slice(0, 4) || "",
      hq: b.hqLabel?.value || "",
      industry: b.industryLabel?.value || "",
    };
  } catch { return null; }
}

// ── Main handler ──
export async function enrichFreeHandler(req, res) {
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  // Origin check — block external callers
  const origin = req.headers.origin || req.headers.referer;
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Forbidden" });

  const company = (req.query.company || "").trim();
  if (!company) return res.status(400).json({ error: "company parameter required" });

  // ── Parallel: EDGAR + Wikidata ──
  const [edgarResult, wikiResult] = await Promise.all([
    (async () => {
      const cik = await edgarSearchCIK(company);
      if (!cik) return null;
      const [subs, facts] = await Promise.all([edgarSubmissions(cik), edgarFacts(cik)]);
      if (!subs) return null;

      const empFact = latestXbrl(facts, "dei", "EntityNumberOfEmployees");
      const revFact = latestXbrl(facts, "us-gaap",
        "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "InterestAndDividendIncomeOperating", "InterestIncomeExpenseNet"
      );

      const addr = subs.addresses?.business || subs.addresses?.mailing || {};
      const tickers = subs.tickers || [];

      return {
        name: subs.name || "",
        cik,
        employeeCount: empFact ? String(empFact.val) : "",
        revenue: revFact ? formatRevenue(revFact.val) : "",
        revenueRaw: revFact?.val || null,
        industry: sicToIndustry(subs.sic, subs.sicDescription),
        sic: subs.sic || "",
        headquarters: addr.city ? `${addr.city}, ${addr.stateOrCountryDescription || addr.stateOrCountry || ""}` : "",
        publiclyTraded: tickers.length ? `Public (${tickers[0]})` : "",
        source: "sec_edgar",
      };
    })(),
    wikidataLookup(company),
  ]);

  // ── Merge: EDGAR > Wikidata > null ──
  if (!edgarResult && !wikiResult) {
    return res.json({ organization: null });
  }

  const org = {
    name: edgarResult?.name || company,
    employeeCount: edgarResult?.employeeCount || wikiResult?.employees || "",
    revenue: edgarResult?.revenue || "",
    industry: edgarResult?.industry || wikiResult?.industry || "",
    headquarters: edgarResult?.headquarters || wikiResult?.hq || "",
    founded: wikiResult?.founded || "",
    publiclyTraded: edgarResult?.publiclyTraded || "",
    sic: edgarResult?.sic || "",
    source: [edgarResult ? "sec_edgar" : "", wikiResult ? "wikidata" : ""].filter(Boolean).join("+"),
  };

  return res.json({ organization: org });
}

export const handler = httpAdapter(enrichFreeHandler);
