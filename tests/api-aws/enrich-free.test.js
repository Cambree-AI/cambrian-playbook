#!/usr/bin/env node
/* global process */
// tests/api-aws/enrich-free.test.js — response-parity tests for the AWS port
// of /api/enrich-free (issue #87). Drives the real Lambda handler (adapter
// included) with APIGW v2 events; the live SEC EDGAR + Wikidata APIs are
// mocked via a global fetch stub — no network access.
//
// Parity oracle: the assertions mirror api/enrich-free.js (status codes,
// error strings, EDGAR > Wikidata merge precedence, revenue/HQ/ticker
// formatting). The in-memory cache and rate map were removed in the port
// (platform difference), so there is no `_cached` path to test.
//
// Usage: node tests/api-aws/enrich-free.test.js   (exit 0 = green)

process.env.CAMBREE_ENV = "prod";

// ── Mock EDGAR + Wikidata (mutable per case) ─────────────────────────────
let edgarMode = "hit";   // "hit" | "miss" | "down"
let wikiMode = "hit";    // "hit" | "miss"

const edgarSearch = {
  hits: { hits: [{ _source: { display_names: ["ACME PAYMENTS INC  (ACME)  (CIK 0001234567)"], ciks: ["1234567"] } }] },
};
const edgarSubs = {
  name: "ACME PAYMENTS INC",
  sic: "7372",
  sicDescription: "Prepackaged Software",
  tickers: ["ACME"],
  addresses: { business: { city: "Austin", stateOrCountry: "TX", stateOrCountryDescription: "TX" } },
};
const edgarFactsPayload = {
  facts: {
    dei: { EntityNumberOfEmployees: { units: { pure: [
      { val: 5200, end: "2025-12-31", form: "10-K" },
      { val: 4100, end: "2024-12-31", form: "10-K" },
    ] } } },
    "us-gaap": { Revenues: { units: { USD: [
      { val: 1_500_000_000, end: "2025-12-31", form: "10-K" },
      { val: 900_000_000, end: "2025-09-30", form: "10-Q" },
    ] } } },
  },
};
const wikiBinding = {
  results: { bindings: [{
    employees: { value: "5000" },
    foundedDate: { value: "1999-04-01T00:00:00Z" },
    hqLabel: { value: "Austin, Texas" },
    industryLabel: { value: "financial technology" },
  }] },
};

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith("https://efts.sec.gov/")) {
    if (edgarMode === "down") throw new Error("edgar down");
    return { ok: true, json: async () => (edgarMode === "hit" ? edgarSearch : { hits: { hits: [] } }) };
  }
  if (u.startsWith("https://data.sec.gov/submissions/")) {
    if (edgarMode === "down") throw new Error("edgar down");
    return { ok: true, json: async () => edgarSubs };
  }
  if (u.startsWith("https://data.sec.gov/api/xbrl/")) {
    if (edgarMode === "down") throw new Error("edgar down");
    return { ok: true, json: async () => edgarFactsPayload };
  }
  if (u.startsWith("https://query.wikidata.org/")) {
    return { ok: true, json: async () => (wikiMode === "hit" ? wikiBinding : { results: { bindings: [] } }) };
  }
  throw new Error(`unexpected fetch in enrich-free tests: ${url}`);
};

const { handler } = await import("../../api-aws/enrich-free/index.js");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

function event({ method = "GET", origin = "https://cambree.ai", query = { company: "Acme Payments" } } = {}) {
  return {
    rawPath: "/api/enrich-free",
    headers: origin ? { origin } : {},
    queryStringParameters: query,
    requestContext: { http: { method, sourceIp: "5.5.5.5" } },
    body: null,
  };
}

console.log("\n── guard behavior (parity with api/enrich-free.js) ─────────────");
{
  const out = await handler(event({ method: "OPTIONS" }));
  assert(out.statusCode === 204 && out.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "preflight answered with CORS headers");
}
{
  const out = await handler(event({ method: "POST" }));
  assert(out.statusCode === 405 && JSON.parse(out.body).error === "GET only", "non-GET → 405 (same error string)");
}
{
  const out = await handler(event({ origin: "https://evil.com" }));
  assert(out.statusCode === 403 && JSON.parse(out.body).error === "Forbidden", "disallowed origin → 403 (same error string)");
}
{
  const out = await handler(event({ query: {} }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "company parameter required", "missing company → 400");
}
{
  const out = await handler(event({ query: { company: "   " } }));
  assert(out.statusCode === 400, "whitespace-only company → 400");
}

console.log("\n── EDGAR + Wikidata merge (EDGAR wins) ─────────────────────────");
{
  edgarMode = "hit"; wikiMode = "hit";
  const out = await handler(event());
  const { organization: org } = JSON.parse(out.body);
  assert(out.statusCode === 200 && !!org, "200 with organization");
  assert(org.name === "ACME PAYMENTS INC", "name from EDGAR submissions");
  assert(org.employeeCount === "5200", "latest 10-K employee count beats Wikidata's");
  assert(org.revenue === "$1.5B", "revenue formatted from latest annual filing");
  assert(org.industry === "Prepackaged Software", "sicDescription preferred over SIC map");
  assert(org.headquarters === "Austin, TX", "HQ formatted city, state");
  assert(org.publiclyTraded === "Public (ACME)", "ticker formatted");
  assert(org.founded === "1999", "founding year comes from Wikidata (EDGAR has none)");
  assert(org.source === "sec_edgar+wikidata", "source tags both providers");
}

console.log("\n── fallbacks ───────────────────────────────────────────────────");
{
  edgarMode = "miss"; wikiMode = "hit";
  const out = await handler(event({ query: { company: "Acme Payments" } }));
  const { organization: org } = JSON.parse(out.body);
  assert(out.statusCode === 200 && org.source === "wikidata", "EDGAR miss → Wikidata-only result");
  assert(org.name === "Acme Payments", "name falls back to the query input");
  assert(org.employeeCount === "5000" && org.headquarters === "Austin, Texas" && org.industry === "financial technology", "Wikidata fields fill in");
  assert(org.revenue === "" && org.publiclyTraded === "", "no EDGAR → no revenue/ticker (empty, never invented)");
}
{
  edgarMode = "miss"; wikiMode = "miss";
  const out = await handler(event());
  assert(out.statusCode === 200 && JSON.parse(out.body).organization === null, "both miss → { organization: null } (empty beats wrong)");
}
{
  edgarMode = "down"; wikiMode = "hit";
  const out = await handler(event());
  const { organization: org } = JSON.parse(out.body);
  assert(out.statusCode === 200 && org?.source === "wikidata", "EDGAR outage degrades to Wikidata, not an error");
  edgarMode = "hit";
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
