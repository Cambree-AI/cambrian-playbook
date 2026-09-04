#!/usr/bin/env node
/* global process */
/* global Buffer */
// tests/api-aws/guard.test.js — unit tests for the AWS shared guard layer
// (issue #86): origin allow/deny, CORS preflight parity with api/_guard.js,
// JWT verification (HS256 + ES256-via-JWKS, expired, garbage, wrong key),
// input caps, adapter translation. The Supabase JWKS endpoint (a live
// service) is mocked via a global fetch stub — no network access.
//
// Usage: node tests/api-aws/guard.test.js   (exit 0 = green)

import { createHmac, generateKeyPairSync, createSign } from "crypto";
import {
  isAllowedOrigin, applyCors, verifyJwt, decodeJwtPayload,
  withinInputCap, clientIp,
} from "../../api-aws/shared/guard.js";
import { eventToReq, makeRes, httpAdapter } from "../../api-aws/shared/adapter.js";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

// ── test fixtures ─────────────────────────────────────────────────────────
const SUPABASE_URL = "https://akceiidofsiajrjtgone.supabase.co";
const HS_SECRET = "test-jwt-secret-for-unit-tests-only";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
function mintHS256({ exp = Math.floor(Date.now() / 1000) + 3600, iss = "supabase", secret = HS_SECRET, sub = "user-1" } = {}) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub, exp, iss }));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

// ES256 keypair + JWKS served by the fetch mock below
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key-1", alg: "ES256", use: "sig" };
function mintES256({ exp = Math.floor(Date.now() / 1000) + 3600, iss = "supabase", key = privateKey, sub = "user-2" } = {}) {
  const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "test-key-1" }));
  const payload = b64url(JSON.stringify({ sub, exp, iss }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

// Mock of the live Supabase JWKS endpoint (the only outbound call the guard
// makes). Anything else is a test bug — fail loudly.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes("/.well-known/jwks.json")) {
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  }
  throw new Error(`unexpected fetch in guard tests: ${url}`);
};

const req = (headers = {}, method = "POST") => ({ method, headers });

console.log("\n── origin allowlist (parity with api/_guard.js) ────────────────");
process.env.CAMBREE_ENV = "prod";
{
  const allowed = [
    "https://cambree.ai", "https://www.cambree.ai", "https://staging.cambree.ai",
    "https://cambriancatalyst.ai", "https://app.cambriancatalyst.ai",
    "https://cambrian-playbook.vercel.app",
    "https://cambrian-playbook-git-staging-x.vercel.app",
    "https://dev.d1gtnd67v2ws7a.amplifyapp.com",
    "https://staging.d33ublf97u0bs6.amplifyapp.com",
    "https://main.d1fuoohbeo8gqk.amplifyapp.com",
    "http://localhost:5173", "http://127.0.0.1:5173",
  ];
  for (const o of allowed) assert(isAllowedOrigin(o), `allows ${o}`);
  const denied = [
    "https://evil.com",
    "https://cambree.ai.evil.com",
    "https://notcambree.ai",
    "https://anything.amplifyapp.com",          // wildcard amplify must NOT pass
    "https://x.dev.d1gtnd67v2ws7a.amplifyapp.com.evil.com",
    "not a url",
  ];
  for (const o of denied) assert(!isAllowedOrigin(o), `denies ${o}`);
  assert(!isAllowedOrigin(""), "prod: denies missing origin");
}
process.env.CAMBREE_ENV = "dev";
assert(isAllowedOrigin(""), "dev: allows missing origin (local tools)");

console.log("\n── CORS preflight (parity with issue #83) ──────────────────────");
{
  const res = makeRes();
  const handled = applyCors(req({ origin: "https://cambree.ai" }, "OPTIONS"), res);
  assert(handled === true, "OPTIONS preflight is fully answered");
  assert(res._result.statusCode === 204, "preflight → 204");
  assert(res._result.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "echoes allowlisted origin (never *)");
  assert(res._result.headers["Vary"] === "Origin", "Vary: Origin set");
  assert(/Authorization/.test(res._result.headers["Access-Control-Allow-Headers"]), "allows Authorization header");
  assert(res._result.headers["Access-Control-Max-Age"] === "86400", "max-age matches Vercel guard");
}
{
  const res = makeRes();
  applyCors(req({ origin: "https://evil.com" }, "OPTIONS"), res);
  assert(res._result.headers["Access-Control-Allow-Origin"] === undefined, "disallowed origin gets no ACAO header");
}
{
  const res = makeRes();
  const handled = applyCors(req({ origin: "https://cambree.ai" }, "POST"), res);
  assert(handled === false, "POST is not consumed by applyCors");
  assert(res._result.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "POST still gets ACAO echo");
}

console.log("\n── JWT verification ────────────────────────────────────────────");
process.env.CAMBREE_ENV = "prod";
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_JWT_SECRET = HS_SECRET;
{
  const r = req({ authorization: `Bearer ${mintHS256()}` });
  assert(await verifyJwt(r) === true, "HS256: valid token accepted");
  assert(r._isGuest === false, "HS256: authenticated user is not a guest");
}
assert(await verifyJwt(req({ authorization: `Bearer ${mintHS256({ exp: Math.floor(Date.now() / 1000) - 60 })}` })) === false, "HS256: expired token rejected");
assert(await verifyJwt(req({ authorization: `Bearer ${mintHS256({ secret: "wrong-secret" })}` })) === false, "HS256: wrong signature rejected");
assert(await verifyJwt(req({ authorization: `Bearer ${mintHS256({ iss: "https://other-project.supabase.co/auth/v1" })}` })) === false, "HS256: foreign issuer rejected");
assert(await verifyJwt(req({ authorization: "Bearer garbage.token" })) === false, "garbage token rejected");
assert(await verifyJwt(req({ authorization: "Bearer " })) === false, "empty bearer rejected");
assert(await verifyJwt(req({})) === false, "prod: no auth header rejected (no guest mode)");
{
  // alg:none-style forgery — header claims an unknown alg
  const forged = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify({ sub: "x" }))}.`;
  assert(await verifyJwt(req({ authorization: `Bearer ${forged}` })) === false, "unknown/none algorithm rejected");
}
{
  const r = req({ authorization: `Bearer ${mintES256()}` });
  assert(await verifyJwt(r) === true, "ES256: valid token verified against (mocked) JWKS");
}
{
  const { privateKey: otherKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  assert(await verifyJwt(req({ authorization: `Bearer ${mintES256({ key: otherKey })}` })) === false, "ES256: token signed by a different key rejected");
}
{
  process.env.CAMBREE_ENV = "dev";
  process.env.ALLOW_GUEST = "true";
  const r = req({});
  assert(await verifyJwt(r) === true && r._isGuest === true, "dev + ALLOW_GUEST: guest mode works");
  process.env.CAMBREE_ENV = "prod";
  const r2 = req({});
  assert(await verifyJwt(r2) === false, "prod: ALLOW_GUEST is ignored (fail closed)");
  delete process.env.ALLOW_GUEST;
}

console.log("\n── input caps + client IP ──────────────────────────────────────");
assert(withinInputCap({ msg: "hello" }), "small body within cap");
assert(!withinInputCap({ msg: "x".repeat(260_000) }), "260KB body over the 250KB cap");
assert(withinInputCap("x".repeat(10), 20) && !withinInputCap("x".repeat(30), 20), "custom cap respected");
assert(clientIp({ headers: {}, socket: { remoteAddress: "9.9.9.9" } }) === "9.9.9.9", "sourceIp via adapter socket wins");
assert(clientIp({ headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" }, socket: {} }) === "2.2.2.2", "XFF fallback takes rightmost entry");
assert(clientIp({ headers: {}, socket: {} }) === "unknown", "no signal → 'unknown'");

console.log("\n── adapter translation ─────────────────────────────────────────");
{
  const event = {
    rawPath: "/api/contact",
    headers: { "content-type": "application/json", origin: "https://cambree.ai" },
    requestContext: { http: { method: "POST", sourceIp: "3.3.3.3" } },
    body: JSON.stringify({ a: 1 }),
  };
  const r = eventToReq(event);
  assert(r.method === "POST" && r.url === "/api/contact", "method + path mapped");
  assert(r.body?.a === 1, "JSON body parsed");
  assert(r.socket.remoteAddress === "3.3.3.3", "sourceIp lands on socket.remoteAddress");
}
{
  const event = {
    rawPath: "/api/contact",
    headers: { "content-type": "application/json" },
    requestContext: { http: { method: "POST", sourceIp: "3.3.3.3" } },
    body: Buffer.from(JSON.stringify({ b: 2 })).toString("base64"),
    isBase64Encoded: true,
  };
  assert(eventToReq(event).body?.b === 2, "base64-encoded JSON body decoded and parsed");
}
{
  const lambda = httpAdapter(async (rq, rs) => rs.status(201).json({ ok: true }));
  const out = await lambda({ headers: {}, requestContext: { http: { method: "POST" } } });
  assert(out.statusCode === 201 && JSON.parse(out.body).ok === true, "handler response round-trips to APIGW shape");
  assert(out.headers["Content-Type"] === "application/json", "json() sets content type");
}
{
  const lambda = httpAdapter(async () => { throw new Error("boom"); });
  const out = await lambda({ headers: {}, requestContext: { http: { method: "POST" } } });
  assert(out.statusCode === 500 && JSON.parse(out.body).error === "internal error", "thrown handler → clean 500");
}
{
  assert(decodeJwtPayload(mintHS256({ sub: "abc" }))?.sub === "abc", "decodeJwtPayload reads sub");
  assert(decodeJwtPayload("nope") === null, "decodeJwtPayload tolerates garbage");
}

globalThis.fetch = realFetch;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
