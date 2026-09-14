#!/usr/bin/env node
/* global process */
// tests/api-aws/request-access.test.js — response-parity tests for the AWS
// port of /api/request-access (issue #87). Drives the real Lambda handler
// with APIGW v2 events; Supabase REST/auth, the promo RPCs, and Resend are
// mocked via a global fetch stub — no network access.
//
// Parity oracle: the assertions mirror api/request-access.js (status codes,
// the three user-facing messages, dedup/promo/queue branching, referral
// attribution, lowercased email normalization). The one deliberate platform
// difference is the promo-attempt limiter: the Map became the
// check_promo_attempt() RPC (migration 040) — asserted here as an RPC call.
//
// Usage: node tests/api-aws/request-access.test.js   (exit 0 = green)

process.env.CAMBREE_ENV = "prod";
process.env.SUPABASE_URL = "https://mocked-project.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "mock-service-key";
process.env.RESEND_API_KEY = "mock-resend-key";
// SECRETS_ARN deliberately unset: loadSecrets() falls back to plain env vars.

// ── mutable mock state (reset per scenario) ──────────────────────────────
const state = {};
function reset() {
  Object.assign(state, {
    dupRows: [],            // idempotency check result
    attemptAllowed: true,   // check_promo_attempt RPC
    attemptRpcDown: false,
    redeemOk: false,        // redeem_promo_code RPC
    referrerExists: false,  // users?referral_code lookup
    existingUser: false,    // provision: users?email lookup
    resendDown: false,
    calls: [],              // every fetch: {url, method, body}
    inserted: null,         // access_requests POST body
    patched: null,          // access_requests PATCH body
    resendMails: [],        // Resend payloads
  });
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  state.calls.push({ url: u, method, body });

  if (u.includes("/rest/v1/rpc/check_promo_attempt")) {
    if (state.attemptRpcDown) throw new Error("rpc down");
    return { ok: true, json: async () => state.attemptAllowed };
  }
  if (u.includes("/rest/v1/rpc/redeem_promo_code")) {
    return { ok: true, json: async () => state.redeemOk };
  }
  if (u.includes("/rest/v1/users?referral_code=")) {
    return { ok: true, json: async () => (state.referrerExists ? [{ id: "referrer-1" }] : []) };
  }
  if (u.includes("/rest/v1/users?email=")) { // provision: existing-user check
    return { ok: true, status: 200, json: async () => (state.existingUser ? [{ id: "u-1", org_id: "org-9" }] : []) };
  }
  if (u.includes("/rest/v1/invitations?email=")) { // provision: pending-invite check
    return { ok: true, status: 200, json: async () => [] };
  }
  if (u.includes("/rest/v1/access_requests?email=")) { // idempotency check
    return { ok: true, json: async () => state.dupRows };
  }
  if (u.includes("/rest/v1/access_requests?id=")) { // mark approved
    state.patched = body;
    return { ok: true, status: 204, json: async () => null };
  }
  if (u.includes("/rest/v1/access_requests")) { // insert
    state.inserted = body;
    return { ok: true, json: async () => [{ id: "req-1" }] };
  }
  if (u.includes("/rest/v1/orgs") && method === "POST") { // provision: create org
    return { ok: true, status: 201, json: async () => [{ id: "org-new" }] };
  }
  if (u.includes("/rest/v1/invitations") && method === "POST") { // provision: create invitation
    return { ok: true, status: 201, json: async () => [{ id: "inv-1", token: "tok-abc" }] };
  }
  if (u.includes("/auth/v1/invite")) {
    return { ok: true, status: 200, json: async () => ({}) };
  }
  if (u.includes("api.resend.com/emails")) {
    if (state.resendDown) throw new Error("resend down");
    state.resendMails.push(body);
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  }
  throw new Error(`unexpected fetch in request-access tests: ${method} ${u}`);
};

const { handler } = await import("../../api-aws/request-access/index.js");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

function event({ method = "POST", origin = "https://cambree.ai", body = null } = {}) {
  return {
    rawPath: "/api/request-access",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    requestContext: { http: { method, sourceIp: "5.5.5.5" } },
    body: body == null ? null : JSON.stringify(body),
  };
}

const QUEUED_MSG = "Request received. We review every request and send invites personally.";
const PROMO_MSG = "You're in! Check your email for your invite link.";
const BAD_CODE_MSG = "That code wasn't recognized, so your request has been queued for review — we'll send your invite personally.";
const GOOD = { name: "Ada Lovelace", email: "Ada@Example.com", company: "Analytical Engines", note: "hi" };

console.log("\n── guard + validation (parity with api/request-access.js) ─────");
reset();
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
{
  const out = await handler(event({ body: { email: "a@b.co", company: "X" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Name, email, and company are required", "missing name → 400");
}
{
  const out = await handler(event({ body: { ...GOOD, email: "not-an-email" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Invalid email format", "bad email → 400");
}
{
  const out = await handler(event({ body: { ...GOOD, note: "x".repeat(2001) } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Input too long", "oversized note → 400");
}
{
  const out = await handler(event({ body: { ...GOOD, promoCode: "x".repeat(65) } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Input too long", "oversized promo code → 400");
}

console.log("\n── idempotency (Supabase-backed, survives cold starts) ────────");
{
  reset();
  state.dupRows = [{ id: "old", status: "pending" }];
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === true && body.approved === false && body.message === QUEUED_MSG, "recent pending duplicate → queued message, no new row");
  assert(state.inserted === null && state.resendMails.length === 0, "duplicate inserts nothing and sends no email");
}
{
  reset();
  state.dupRows = [{ id: "old", status: "approved" }];
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(body.approved === true && body.message === PROMO_MSG, "recent approved duplicate → promo message");
}

console.log("\n── manual queue path (no promo code) ──────────────────────────");
{
  reset();
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === true && body.approved === false && body.message === QUEUED_MSG, "queued response");
  assert(state.inserted?.email === "ada@example.com", "email lowercased in the inserted row");
  assert(state.inserted?.status === "pending" && state.inserted?.promo_code === null, "row shape: pending, no promo code");
  assert(state.resendMails.length === 2, "founder notification + requester ack sent");
  assert(state.resendMails[0].to === "joe@cambree.ai" && state.resendMails[0].reply_to === "ada@example.com", "founder email addressed with reply-to requester");
  assert(state.resendMails[1].to === "ada@example.com" && state.resendMails[1].text.startsWith("Hi Ada,"), "requester ack greets by first name");
  assert(!state.calls.some(c => c.url.includes("rpc/check_promo_attempt")), "no promo attempt recorded when no code submitted");
}

console.log("\n── promo path ─────────────────────────────────────────────────");
{
  reset();
  state.redeemOk = true;
  const out = await handler(event({ body: { ...GOOD, promoCode: "WELCOME1" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.approved === true && body.message === PROMO_MSG, "valid code → auto-approved");
  assert(state.calls.some(c => c.url.includes("rpc/check_promo_attempt") && c.body?.p_ip === "5.5.5.5"), "attempt limiter is the Supabase RPC keyed by sourceIp (migration 040)");
  assert(state.calls.some(c => c.url.includes("rpc/redeem_promo_code") && c.body?.p_code === "WELCOME1"), "code redeemed atomically via RPC");
  assert(state.patched?.status === "approved" && state.patched?.approved_via === "promo", "request row marked approved via promo");
  assert(state.calls.some(c => c.url.includes("/auth/v1/invite")), "invite email sent through Supabase auth");
  assert(state.inserted?.promo_code === "WELCOME1", "submitted code recorded on the request row");
}
{
  reset();
  state.attemptAllowed = false;
  const out = await handler(event({ body: { ...GOOD, promoCode: "GUESS1" } }));
  assert(out.statusCode === 429 && JSON.parse(out.body).error === "Too many code attempts — try again later", "attempt limit exceeded → 429 (same error string)");
  assert(!state.calls.some(c => c.url.includes("rpc/redeem_promo_code")), "limited request never reaches redemption");
}
{
  reset();
  state.redeemOk = false;
  const out = await handler(event({ body: { ...GOOD, promoCode: "BOGUS1" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.approved === false && body.message === BAD_CODE_MSG, "unrecognized code → queued with bad-code message");
  assert(state.resendMails[0]?.text.includes("Submitted an unrecognized promo code."), "founder email flags the unrecognized code");
}
{
  reset();
  state.redeemOk = true;
  state.existingUser = true; // provisioning refuses: already a full user
  const out = await handler(event({ body: { ...GOOD, promoCode: "WELCOME1" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.approved === false && body.message === QUEUED_MSG, "valid code but provisioning refused → falls back to queue");
  assert(state.resendMails[0]?.text.includes("auto-provision failed (existing_user)"), "founder email flags the provisioning fallback");
}
{
  reset();
  state.attemptRpcDown = true;
  state.redeemOk = true;
  const out = await handler(event({ body: { ...GOOD, promoCode: "WELCOME1" } }));
  assert(out.statusCode === 200 && JSON.parse(out.body).approved === true, "attempt-RPC outage fails open (best effort, parity with the Map)");
}

console.log("\n── referral attribution (issue #154) ──────────────────────────");
{
  reset();
  state.referrerExists = true;
  await handler(event({ body: { ...GOOD, referralCode: "ada-ref-1" } }));
  assert(state.inserted?.referral_code === "ada-ref-1", "valid referral code rides onto the request row");
}
{
  reset();
  state.referrerExists = false;
  const out = await handler(event({ body: { ...GOOD, referralCode: "unknown-ref" } }));
  assert(out.statusCode === 200 && state.inserted?.referral_code === null, "unknown referral code silently dropped, never blocks signup");
}
{
  reset();
  const out = await handler(event({ body: { ...GOOD, referralCode: "!!bad format!!" } }));
  assert(out.statusCode === 200 && state.inserted?.referral_code === null && !state.calls.some(c => c.url.includes("referral_code=")), "malformed referral code skipped without a lookup");
}

console.log("\n── resilience ─────────────────────────────────────────────────");
{
  reset();
  state.resendDown = true;
  const out = await handler(event({ body: GOOD }));
  assert(out.statusCode === 200 && JSON.parse(out.body).ok === true, "Resend outage does not fail the submission");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
