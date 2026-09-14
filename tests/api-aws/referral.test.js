#!/usr/bin/env node
/* global process */
/* global Buffer */
// tests/api-aws/referral.test.js — response-parity tests for the AWS port of
// /api/referral (issue #87). Drives the real Lambda handler with APIGW v2
// events; the Supabase REST API + RPCs are mocked via a global fetch stub —
// no network access.
//
// Parity oracle: the assertions mirror api/referral.js (status codes, error
// strings, the three actions' branching, the mark-before-award double-spend
// guard, cap handling).
//
// Usage: node tests/api-aws/referral.test.js   (exit 0 = green)

import { createHmac } from "crypto";

process.env.CAMBREE_ENV = "prod";
process.env.SUPABASE_URL = "https://mocked-project.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "mock-service-key";
process.env.SUPABASE_JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
process.env.APP_URL = "https://test.cambree.ai";
// SECRETS_ARN deliberately unset: loadSecrets() falls back to plain env vars.

const USER_SUB = "11111111-2222-3333-4444-555555555555";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
function mintHS256({ sub = USER_SUB, exp = Math.floor(Date.now() / 1000) + 3600 } = {}) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub, exp, iss: "supabase" }));
  const sig = createHmac("sha256", process.env.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

// ── mutable mock state (reset per scenario) ──────────────────────────────
const state = {};
function reset() {
  Object.assign(state, {
    user: { referral_code: "ada-ref-1", referred_by: null, referral_rewarded: false, org_id: "org-1" },
    referred: [{ id: "r1", referral_rewarded: true }, { id: "r2", referral_rewarded: false }],
    org: { referral_bonus_runs: 2, referral_bonus_cap: 5 },
    referrers: [],           // users?referral_code lookup
    markedRows: [{ id: USER_SUB }], // conditional referral_rewarded PATCH result
    rpcResult: { run_limit: 11, referral_bonus_runs: 3 },
    calls: [],
    patches: [],
  });
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  state.calls.push({ url: u, method, body });

  if (u.includes("/rest/v1/rpc/increment_referral_bonus")) {
    return { ok: true, json: async () => state.rpcResult };
  }
  if (u.includes("referral_rewarded=eq.false") && method === "PATCH") {
    state.patches.push({ url: u, body });
    return { ok: true, json: async () => state.markedRows };
  }
  if (u.includes("referred_by=is.null") && method === "PATCH") {
    state.patches.push({ url: u, body });
    return { ok: true, status: 204, json: async () => null };
  }
  if (u.includes("/rest/v1/users?id=")) {
    return { ok: true, json: async () => [state.user] };
  }
  if (u.includes("/rest/v1/users?referred_by=")) {
    return { ok: true, json: async () => state.referred };
  }
  if (u.includes("/rest/v1/users?referral_code=")) {
    return { ok: true, json: async () => state.referrers };
  }
  if (u.includes("/rest/v1/orgs?id=")) {
    return { ok: true, json: async () => [state.org] };
  }
  throw new Error(`unexpected fetch in referral tests: ${method} ${u}`);
};

const { handler } = await import("../../api-aws/referral/index.js");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

function event({ method = "POST", origin = "https://cambree.ai", body = null, token = mintHS256() } = {}) {
  return {
    rawPath: "/api/referral",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    requestContext: { http: { method, sourceIp: "5.5.5.5" } },
    body: body == null ? null : JSON.stringify(body),
  };
}

console.log("\n── guard behavior (parity with api/referral.js) ────────────────");
reset();
{
  const out = await handler(event({ method: "OPTIONS", token: null }));
  assert(out.statusCode === 204 && out.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "preflight answered with CORS headers");
}
{
  const out = await handler(event({ method: "GET" }));
  assert(out.statusCode === 405, "non-POST → 405");
}
{
  const out = await handler(event({ origin: "https://evil.com", body: { action: "get_referral_info" } }));
  assert(out.statusCode === 403 && JSON.parse(out.body).error === "Origin not allowed", "disallowed origin → 403 (same error string)");
}
{
  const out = await handler(event({ body: { action: "get_referral_info" }, token: null }));
  assert(out.statusCode === 401 && JSON.parse(out.body).error === "Authentication required", "no JWT → 401");
}
{
  const out = await handler(event({ body: { action: "reticulate_splines" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Unknown action", "unknown action → 400");
}

console.log("\n── get_referral_info ───────────────────────────────────────────");
{
  reset();
  const out = await handler(event({ body: { action: "get_referral_info" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === true && body.referral_code === "ada-ref-1", "returns the caller's referral code");
  assert(body.referral_link === "https://test.cambree.ai?ref=ada-ref-1", "referral link uses the configured app URL");
  assert(body.total_referred === 2 && body.total_rewarded === 1, "referred/rewarded counts computed");
  assert(body.bonus_runs_this_month === 2 && body.bonus_cap === 5, "org bonus stats included");
}

console.log("\n── set_referrer ────────────────────────────────────────────────");
{
  reset();
  const out = await handler(event({ body: { action: "set_referrer", referralCode: "!!" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Referral code required", "malformed code → 400");
}
{
  reset();
  state.referrers = [];
  const out = await handler(event({ body: { action: "set_referrer", referralCode: "ghost-ref" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === false && body.message === "Invalid referral code", "unknown code → ok:false, not an error status");
}
{
  reset();
  state.referrers = [{ id: USER_SUB }]; // the caller's own code
  const out = await handler(event({ body: { action: "set_referrer", referralCode: "ada-ref-1" } }));
  assert(JSON.parse(out.body).message === "Can't refer yourself", "self-referral rejected");
}
{
  reset();
  state.referrers = [{ id: "referrer-9" }];
  state.user = { ...state.user, referred_by: "earlier-ref" };
  const out = await handler(event({ body: { action: "set_referrer", referralCode: "new-ref-1" } }));
  assert(JSON.parse(out.body).message === "Referral already recorded" && state.patches.length === 0, "existing referrer never overwritten");
}
{
  reset();
  state.referrers = [{ id: "referrer-9" }];
  const out = await handler(event({ body: { action: "set_referrer", referralCode: "good-ref-1" } }));
  assert(JSON.parse(out.body).message === "Referral tracked", "valid code recorded");
  assert(state.patches[0]?.url.includes("referred_by=is.null") && state.patches[0]?.body.referred_by === "good-ref-1", "write is guarded on referred_by still null (no overwrite race)");
}

console.log("\n── process_reward ──────────────────────────────────────────────");
{
  reset();
  state.user = { ...state.user, referred_by: null };
  const out = await handler(event({ body: { action: "process_reward" } }));
  assert(JSON.parse(out.body).message === "No reward to process", "not referred → nothing to process");
}
{
  reset();
  state.user = { ...state.user, referred_by: "ref-x", referral_rewarded: false };
  state.referrers = [{ id: "referrer-9", org_id: "org-9" }];
  const out = await handler(event({ body: { action: "process_reward" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.rewarded === true && body.message === "Referral reward granted!", "reward granted");
  const markIdx = state.calls.findIndex(c => c.url.includes("referral_rewarded=eq.false"));
  const rpcIdx = state.calls.findIndex(c => c.url.includes("increment_referral_bonus"));
  assert(markIdx !== -1 && rpcIdx !== -1 && markIdx < rpcIdx, "rewarded flag marked BEFORE the bonus RPC (double-award guard)");
  assert(state.calls[rpcIdx].body.p_org_id === "org-9", "bonus lands on the referrer's org via atomic RPC");
}
{
  reset();
  state.user = { ...state.user, referred_by: "ref-x" };
  state.referrers = [{ id: "referrer-9", org_id: "org-9" }];
  state.markedRows = []; // another request already claimed the flag
  const out = await handler(event({ body: { action: "process_reward" } }));
  assert(JSON.parse(out.body).message === "Already processed" && !state.calls.some(c => c.url.includes("increment_referral_bonus")), "concurrent claim → no second award");
}
{
  reset();
  state.user = { ...state.user, referred_by: "ref-x" };
  state.referrers = [{ id: "referrer-9", org_id: "org-9" }];
  state.rpcResult = { error: "cap_reached" };
  const out = await handler(event({ body: { action: "process_reward" } }));
  assert(JSON.parse(out.body).message === "Referrer at bonus cap", "cap reached → acknowledged without retry");
}
{
  reset();
  state.user = { ...state.user, referred_by: "ref-x", referral_rewarded: true };
  const out = await handler(event({ body: { action: "process_reward" } }));
  assert(JSON.parse(out.body).message === "No reward to process", "already rewarded → idempotent no-op");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
