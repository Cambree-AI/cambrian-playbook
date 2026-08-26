// api/enrich-free.js — Free firmographic enrichment via SEC EDGAR + Wikidata
// No API keys, no paid calls. Provides verified employee count, revenue, HQ,
// industry, ticker, and founding year for public + notable companies.
//
// GET /api/enrich-free?company=Apple+Inc&domain=apple.com
//
// Priority: SEC EDGAR (authoritative for public cos) > Wikidata (notable cos) > null

import { applyCors, isAllowedOrigin } from "./_guard.js";

const UA = "Cambree info@cambree.ai";

// ── In-memory cache (24hr TTL, max 500 entries) ──
const cache = new Map();
const CACHE_TTL = 24 * 3600 * 1000;
const CACHE_MAX = 500;
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ── Rate limiting (simple per-IP) ──
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const window = rateMap.get(ip) || [];
  const recent = window.filter(t => now - t < 60000);
  if (recent.length >= 30) return false;
  recent.push(now);
  rateMap.set(ip, recent);
  return true;
}

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
    const safeCompany = company.replace(/["\\\{\}\;\.\#\|\&\^\$\!\?\*\+\(\)\[\]]/g, "").trim();
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
// Origin check now shared with _guard.js (issue #83) — the local replica had
// drifted (it never learned cambree.ai, silently 403ing in production).
export default async function handler(req, res) {
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  // Origin check — block external callers
  const origin = req.headers.origin || req.headers.referer;
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Forbidden" });

  const ip = req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  if (!checkRate(ip)) return res.status(429).json({ error: "Rate limit exceeded" });

  const company = (req.query.company || "").trim();
  const domain = (req.query.domain || "").trim();
  if (!company) return res.status(400).json({ error: "company parameter required" });

  // Cache check
  const cacheKey = `${company.toLowerCase()}|${domain.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });

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
    const result = { organization: null };
    cacheSet(cacheKey, result);
    return res.json(result);
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

  const result = { organization: org };
  cacheSet(cacheKey, result);
  return res.json(result);
}
