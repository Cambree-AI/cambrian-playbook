#!/usr/bin/env node
/* global process */
/* global Buffer */
// tests/api-aws/knowledge.test.js — response-parity tests for the AWS port
// of /api/knowledge (issue #87). Drives the real Lambda handler (adapter
// included) with APIGW v2 events; Supabase (JWT verification is local HS256,
// plan lookup is REST) is mocked via a global fetch stub — no network access.
//
// Parity oracle: the assertions mirror api/knowledge.js (status codes, error
// strings, tier gating: trial gets core frameworks, paid gets vertical
// layers, guests would get stubs — guest mode is prod-disabled so the 401
// path covers it here).
//
// Usage: node tests/api-aws/knowledge.test.js   (exit 0 = green)

import { createHmac } from "crypto";

process.env.CAMBREE_ENV = "prod";
process.env.SUPABASE_URL = "https://mocked-project.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "mock-service-key";
process.env.SUPABASE_JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
// SECRETS_ARN deliberately unset: loadSecrets() falls back to plain env vars.

const b64url = (buf) => Buffer.from(buf).toString("base64url");
function mintHS256({ sub = "11111111-2222-3333-4444-555555555555", exp = Math.floor(Date.now() / 1000) + 3600 } = {}) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub, exp, iss: "supabase" }));
  const sig = createHmac("sha256", process.env.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

// Mock Supabase REST: users → org_id, orgs → plan. Mutable per test case.
let orgPlan = "trial";
let supabaseDown = false;
globalThis.fetch = async (url) => {
  if (supabaseDown) throw new Error("supabase down");
  const u = String(url);
  if (u.includes("/rest/v1/users?")) {
    return { ok: true, json: async () => [{ org_id: "org-1" }] };
  }
  if (u.includes("/rest/v1/orgs?")) {
    return { ok: true, json: async () => [{ plan: orgPlan }] };
  }
  throw new Error(`unexpected fetch in knowledge tests: ${url}`);
};

const { handler } = await import("../../api-aws/knowledge/index.js");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

function event({ method = "GET", origin = "https://cambree.ai", headers = {} } = {}) {
  return {
    rawPath: "/api/knowledge",
    headers: { ...(origin ? { origin } : {}), ...headers },
    requestContext: { http: { method, sourceIp: "5.5.5.5" } },
    body: null,
  };
}

// Keys only paid plans receive (spot checks from the isPaid spread)
const PAID_ONLY_KEYS = ["paymentsIndustry", "complianceFrameworks", "insurancePlaybook", "cannabisPlaybook", "rfpProcurement"];
// Keys every authenticated tier receives
const ALL_TIER_KEYS = ["fitScoringRules", "negotiations", "verticalPlaybooks", "b2bSales", "discoveryQuestionBank", "displacementInjection"];

console.log("\n── guard behavior (parity with api/knowledge.js) ───────────────");
{
  const out = await handler(event({ method: "OPTIONS" }));
  assert(out.statusCode === 204 && out.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "preflight answered with CORS headers");
}
{
  const out = await handler(event({ method: "POST" }));
  assert(out.statusCode === 405, "non-GET → 405");
}
{
  const out = await handler(event({ origin: "https://evil.com" }));
  assert(out.statusCode === 403 && JSON.parse(out.body).error === "origin not allowed", "disallowed origin → 403 (same error string)");
}
{
  const out = await handler(event());
  assert(out.statusCode === 401 && JSON.parse(out.body).error === "authentication required", "no JWT → 401 (guest mode disabled in prod)");
}
{
  const out = await handler(event({ headers: { authorization: "Bearer not.a.jwt" } }));
  assert(out.statusCode === 401, "garbage JWT → 401");
}

console.log("\n── trial tier ──────────────────────────────────────────────────");
{
  orgPlan = "trial";
  const out = await handler(event({ headers: { authorization: `Bearer ${mintHS256()}` } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200, "200 for authenticated trial user");
  assert(body._plan === "trial", "_plan: trial");
  assert(out.headers["Cache-Control"] === "private, max-age=300", "private 5-minute Cache-Control (plan upgrades propagate)");
  assert(ALL_TIER_KEYS.every(k => body[k] !== undefined), "core frameworks present for trial");
  assert(PAID_ONLY_KEYS.every(k => body[k] === undefined), "no paid-only vertical layers for trial");
  assert(body._guest === undefined, "authenticated response is not the guest stub");
}

console.log("\n── paid tiers ──────────────────────────────────────────────────");
for (const plan of ["paid", "enterprise", "promo"]) {
  orgPlan = plan;
  const out = await handler(event({ headers: { authorization: `Bearer ${mintHS256()}` } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body._plan === plan && PAID_ONLY_KEYS.every(k => body[k] !== undefined),
    `plan '${plan}' receives the paid vertical layers`);
}
{
  orgPlan = "paid";
  const out = await handler(event({ headers: { authorization: `Bearer ${mintHS256()}` } }));
  const body = JSON.parse(out.body);
  assert(ALL_TIER_KEYS.every(k => body[k] !== undefined), "paid still receives all core frameworks");
  assert(typeof body.joltEffect?.description !== "undefined" && Array.isArray(body.joltEffect?.steps), "joltEffect shaped as {description, steps}");
}

console.log("\n── resilience ──────────────────────────────────────────────────");
{
  // Plan lookup fails → fail open to trial tier (parity with the Vercel try/catch)
  supabaseDown = true;
  const out = await handler(event({ headers: { authorization: `Bearer ${mintHS256()}` } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body._plan === "trial" && PAID_ONLY_KEYS.every(k => body[k] === undefined),
    "Supabase outage falls open to trial tier, not an error");
  supabaseDown = false;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
