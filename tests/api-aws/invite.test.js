#!/usr/bin/env node
/* global process */
/* global Buffer */
// tests/api-aws/invite.test.js — response-parity tests for the AWS port of
// /api/invite (issue #87). Drives the real Lambda handler with APIGW v2
// events; Supabase REST + auth are mocked via a global fetch stub — no
// network access.
//
// Parity oracle: the assertions mirror api/invite.js (status codes, error
// strings, the existing-user / new-user / duplicate-retry / skipEmail
// branches, superuser org override). The in-memory 10/min invite limiter is
// a deliberate platform removal (see api-aws/invite/index.js header) — no
// 429 path exists to test.
//
// Usage: node tests/api-aws/invite.test.js   (exit 0 = green)

import { createHmac } from "crypto";

process.env.CAMBREE_ENV = "prod";
process.env.SUPABASE_URL = "https://mocked-project.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "mock-service-key";
process.env.SUPABASE_JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
process.env.SUPERUSER_EMAIL = "Root@Cambree.ai";
// SECRETS_ARN deliberately unset: loadSecrets() falls back to plain env vars.

const ADMIN_SUB = "11111111-2222-3333-4444-555555555555";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
function mintHS256({ sub = ADMIN_SUB, exp = Math.floor(Date.now() / 1000) + 3600 } = {}) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub, exp, iss: "supabase" }));
  const sig = createHmac("sha256", process.env.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

// ── mutable mock state (reset per scenario) ──────────────────────────────
const state = {};
function reset() {
  Object.assign(state, {
    caller: { org_id: "org-1", role: "admin", email: "boss@acme.com" },
    existingUser: null,          // users?email lookup result
    inviteInsertResults: [[{ id: "inv-1", token: "tok-1" }]], // shifted per POST
    authInviteStatus: 200,       // /auth/v1/invite response status
    calls: [],
    patchedUser: null,
    deletedInvitations: [],
    authInvites: [],
    recoveries: [],
  });
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  state.calls.push({ url: u, method, body });

  if (u.includes("/rest/v1/users?id=") && method === "GET") {
    return { ok: true, json: async () => (state.caller ? [state.caller] : []) };
  }
  if (u.includes("/rest/v1/users?email=")) {
    return { ok: true, json: async () => (state.existingUser ? [state.existingUser] : []) };
  }
  if (u.includes("/rest/v1/users?id=") && method === "PATCH") {
    state.patchedUser = body;
    return { ok: true, status: 204, json: async () => null };
  }
  if (u.includes("/rest/v1/invitations?") && method === "DELETE") {
    state.deletedInvitations.push(u);
    return { ok: true, status: 204, json: async () => null };
  }
  if (u.endsWith("/rest/v1/invitations") && method === "POST") {
    const result = state.inviteInsertResults.shift() ?? [{ id: "inv-x", token: "tok-x" }];
    return { ok: true, json: async () => result };
  }
  if (u.includes("/auth/v1/invite")) {
    state.authInvites.push(body);
    const status = state.authInviteStatus;
    return { ok: status < 400, status, json: async () => (status === 422 ? { msg: "A user with this email address has already been registered" } : {}) };
  }
  if (u.includes("/auth/v1/recover")) {
    state.recoveries.push(body);
    return { ok: true, status: 200, json: async () => ({}) };
  }
  throw new Error(`unexpected fetch in invite tests: ${method} ${u}`);
};

const { handler } = await import("../../api-aws/invite/index.js");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

function event({ method = "POST", origin = "https://cambree.ai", body = null, token = mintHS256() } = {}) {
  return {
    rawPath: "/api/invite",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    requestContext: { http: { method, sourceIp: "5.5.5.5" } },
    body: body == null ? null : JSON.stringify(body),
  };
}

const GOOD = { email: "New.Rep@Client.com", role: "rep" };

console.log("\n── guard behavior (parity with api/invite.js) ──────────────────");
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
  const out = await handler(event({ origin: "https://evil.com", body: GOOD }));
  assert(out.statusCode === 403 && JSON.parse(out.body).error === "origin not allowed", "disallowed origin → 403 (same error string)");
}
{
  const out = await handler(event({ body: GOOD, token: null }));
  assert(out.statusCode === 401 && JSON.parse(out.body).error === "Authentication required", "no JWT → 401");
}
{
  const out = await handler(event({ body: GOOD, token: mintHS256({ sub: "not-a-uuid" }) }));
  assert(out.statusCode === 401, "non-UUID sub → 401");
}

console.log("\n── validation + authorization ──────────────────────────────────");
{
  reset();
  const out = await handler(event({ body: { email: "nope" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Valid email required (user@domain.tld)", "bad email → 400");
}
{
  reset();
  const out = await handler(event({ body: { ...GOOD, role: "owner" } }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Invalid role", "unknown role → 400");
}
{
  reset();
  state.caller = { org_id: null, role: "admin", email: "boss@acme.com" };
  const out = await handler(event({ body: GOOD }));
  assert(out.statusCode === 403 && JSON.parse(out.body).error === "You must belong to an organization", "caller without org → 403");
}
{
  reset();
  state.caller = { org_id: "org-1", role: "rep", email: "rep@acme.com" };
  const out = await handler(event({ body: GOOD }));
  assert(out.statusCode === 403 && JSON.parse(out.body).error === "Only admins can invite users", "non-admin caller → 403");
}

console.log("\n── new user: invitation + email ────────────────────────────────");
{
  reset();
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === true && body.invitation_id === "inv-1" && body.email_sent === true, "invitation created and emailed");
  assert(state.deletedInvitations.some(u => u.includes("accepted_at=is.null")), "stale pending invitations cleared first (accepted kept for history)");
  const ins = state.calls.find(c => c.url.endsWith("/rest/v1/invitations") && c.method === "POST");
  assert(ins.body.email === "new.rep@client.com" && ins.body.role === "rep" && ins.body.org_id === "org-1" && ins.body.invited_by === ADMIN_SUB, "invitation row: lowercased email, caller's org, audit trail");
  assert(state.authInvites[0]?.data?.invitation_token === "tok-1", "auth invite carries the invitation token");
}
{
  reset();
  state.authInviteStatus = 422; // auth user exists from a prior partial invite
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(body.ok === true && body.action === "recovery_sent" && state.recoveries.length === 1, "existing auth user → recovery email instead");
}
{
  reset();
  state.inviteInsertResults = [{ code: "23505", message: "duplicate key value" }, [{ id: "inv-2", token: "tok-2" }]];
  const out = await handler(event({ body: GOOD }));
  // Fixed in issue #169 (both copies together): the retry result — a
  // PostgREST array — is now reassigned to invResult instead of
  // Object.assign-merged into the error object, so the fresh token is found
  // and the invite completes instead of 500ing with an orphan row.
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === true && body.invitation_id === "inv-2" && body.email_sent === true,
    "duplicate-key conflict → cleanup, retry, and invite succeeds (issue #169)");
  assert(state.deletedInvitations.length === 2 && state.authInvites[0]?.data?.invitation_token === "tok-2",
    "retry deletes the conflict and the email carries the retried token");
}
{
  reset();
  state.inviteInsertResults = [{ code: "42501", message: "permission denied" }];
  const out = await handler(event({ body: GOOD }));
  assert(out.statusCode === 400 && JSON.parse(out.body).error === "Failed to create invitation: permission denied", "non-duplicate insert failure → 400 with reason");
}
{
  reset();
  const out = await handler(event({ body: { ...GOOD, skipEmail: true } }));
  const body = JSON.parse(out.body);
  assert(body.ok === true && body.email_sent === false && state.authInvites.length === 0, "skipEmail creates the invitation without sending");
}

console.log("\n── existing user routes ────────────────────────────────────────");
{
  reset();
  state.existingUser = { id: "u-7", org_id: "org-1", role: "rep" };
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(body.action === "password_reset" && state.recoveries.length === 1, "already a member → password reset, no new invitation");
  assert(!state.calls.some(c => c.url.endsWith("/rest/v1/invitations") && c.method === "POST"), "no invitation row created for existing member");
}
{
  reset();
  state.existingUser = { id: "u-8", org_id: "org-other", role: "manager" };
  const out = await handler(event({ body: GOOD }));
  const body = JSON.parse(out.body);
  assert(body.action === "reassigned_and_reset", "member of another org → reassigned");
  assert(state.patchedUser?.org_id === "org-1" && state.patchedUser?.role === "rep", "user row moved to caller's org with requested role");
}

console.log("\n── superuser override ──────────────────────────────────────────");
{
  reset();
  state.caller = { org_id: "org-1", role: "rep", email: "root@cambree.ai" }; // matches SUPERUSER_EMAIL case-insensitively
  const out = await handler(event({ body: { ...GOOD, orgId: "org-target" } }));
  assert(out.statusCode === 200, "superuser may invite regardless of admin role");
  const ins = state.calls.find(c => c.url.endsWith("/rest/v1/invitations") && c.method === "POST");
  assert(ins.body.org_id === "org-target", "superuser orgId override lands on the invitation");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
