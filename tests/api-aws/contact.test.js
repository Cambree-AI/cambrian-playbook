#!/usr/bin/env node
/* global process */
// tests/api-aws/contact.test.js — response-parity tests for the pilot AWS
// port of /api/contact (issue #86). Drives the real Lambda handler (adapter
// included) with APIGW v2 events; the Supabase REST API (a live service) is
// mocked via a global fetch stub that records inserts — no network access.
//
// Parity oracle: the assertions mirror api/contact.js line for line (status
// codes, error strings, success message shape, api_usage_log row shape), so
// a drift between the two copies fails here.
//
// Usage: node tests/api-aws/contact.test.js   (exit 0 = green)

process.env.CAMBREE_ENV = "prod";
process.env.SUPABASE_URL = "https://mocked-project.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "mock-service-key";
// SECRETS_ARN deliberately unset: loadSecrets() falls back to plain env vars,
// so no AWS SDK call is attempted.

const inserts = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes("/rest/v1/api_usage_log")) {
    inserts.push({ url: String(url), headers: init.headers, row: JSON.parse(init.body) });
    return { ok: true, status: 201, json: async () => ({}) };
  }
  throw new Error(`unexpected fetch in contact tests: ${url}`);
};

const { handler } = await import("../../api-aws/contact/index.js");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

function event({ method = "POST", origin = "https://cambree.ai", body = null, headers = {} } = {}) {
  return {
    rawPath: "/api/contact",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...headers },
    requestContext: { http: { method, sourceIp: "5.5.5.5" } },
    body: body == null ? null : JSON.stringify(body),
  };
}

const GOOD = { name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", interest: "enterprise", message: "Tell me more." };

console.log("\n── happy path (parity with api/contact.js) ─────────────────────");
{
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200, "200 on valid submission");
  assert(body.ok === true, "ok: true");
  assert(body.message === "Thanks, Ada Lovelace! We've received your inquiry about enterprise pricing for Analytical Engines. We'll be in touch within 1 business day at ada@example.com.",
    "success message byte-identical to the Vercel handler");
  assert(out.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "CORS echo on the POST response");
  assert(inserts.length === 1, "exactly one api_usage_log insert");
  const row = inserts[0].row;
  assert(row.user_id === "contact-form" && row.model === "enterprise-inquiry", "row identity fields match Vercel handler");
  const detail = JSON.parse(row.endpoint);
  assert(detail.name === GOOD.name && detail.company === GOOD.company && detail.interest === "Enterprise pricing", "inquiry detail serialized into endpoint field");
  assert(inserts[0].headers.apikey === "mock-service-key", "insert uses the service key (from env/secret)");
}
{
  inserts.length = 0;
  const out = await handler(event({ body: { ...GOOD, interest: "unlisted-topic" } }));
  const detail = JSON.parse(inserts[0].row.endpoint);
  assert(out.statusCode === 200 && detail.interest === "unlisted-topic", "unknown interest passes through as its own label");
}

console.log("\n── guard behavior ──────────────────────────────────────────────");
{
  const out = await handler(event({ method: "OPTIONS" }));
  assert(out.statusCode === 204 && out.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "preflight answered with CORS headers");
}
{
  const out = await handler(event({ method: "GET" }));
  assert(out.statusCode === 405, "non-POST → 405");
}
{
  const out = await handler(event({ origin: "https://evil.com", body: GOOD }));
  assert(out.statusCode === 403 && JSON.parse(out.body).error === "Origin not allowed", "disallowed origin → 403 (same error string)");
}

console.log("\n── validation (same status + strings as Vercel) ────────────────");
{
  const out = await handler(event({ body: { email: "a@b.co", company: "X" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Name, email, and company are required", "missing name → 400");
}
{
  const out = await handler(event({ body: { ...GOOD, email: "not-an-email" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Invalid email format", "bad email → 400");
}
{
  const out = await handler(event({ body: { ...GOOD, message: "x".repeat(5001) } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Input too long", "oversized message → 400");
}
{
  const out = await handler(event({ body: { ...GOOD, name: "x".repeat(201) } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Input too long", "oversized name → 400");
}
{
  const out = await handler(event({ body: null }));
  assert(out.statusCode === 400, "empty body → 400");
}

console.log("\n── resilience ──────────────────────────────────────────────────");
{
  // Supabase down: inquiry logging fails but the user still gets a response
  // (logUsageRow catches; parity with the Vercel try/catch).
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("supabase down"); };
  const out = await handler(event({ body: GOOD }));
  assert(out.statusCode === 200 && JSON.parse(out.body).ok === true, "Supabase outage does not fail the submission");
  globalThis.fetch = prevFetch;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
