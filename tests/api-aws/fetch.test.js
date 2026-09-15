#!/usr/bin/env node
/* global process */
/* global Buffer */
// tests/api-aws/fetch.test.js — response-parity tests for the AWS port of
// /api/fetch (issue #87). Drives the real Lambda handler with APIGW v2
// events; DNS (node:dns promises.lookup — the reference shared/fetch-ssrf.js
// calls) and all outbound HTTP (target pages, Firecrawl) are stubbed — no
// network access. The full SSRF matrix lives in tests/fetch-ssrf/ssrf.test.js
// (run with --module=api-aws for this copy); this file covers the handler's
// integration of it: guard behavior, never-500 contract, redirect
// re-validation, the 404/410 definitive-miss short-circuit, and the
// two-stage render escalation.
//
// Usage: node tests/api-aws/fetch.test.js   (exit 0 = green)

import { createHmac } from "crypto";
import { promises as dnsPromises } from "node:dns";

process.env.CAMBREE_ENV = "prod";
process.env.SUPABASE_URL = "https://mocked-project.supabase.co";
process.env.SUPABASE_JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
process.env.FIRECRAWL_API_KEY = "fc-mock-key";
// SECRETS_ARN deliberately unset: loadSecrets() falls back to plain env vars.

// DNS stub: every hostname resolves public. shared/fetch-ssrf.js reads
// dnsPromises.lookup at call time, so patching the shared object works.
dnsPromises.lookup = async () => [{ address: "104.18.22.33", family: 4 }];

const USER_SUB = "11111111-2222-3333-4444-555555555555";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
function mintHS256({ sub = USER_SUB, exp = Math.floor(Date.now() / 1000) + 3600 } = {}) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub, exp, iss: "supabase" }));
  const sig = createHmac("sha256", process.env.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

// ── outbound HTTP stub ───────────────────────────────────────────────────
// state.routes: url → response spec {status, ctype, body, location}
const state = { routes: new Map(), firecrawl: null, firecrawlCalls: 0, firecrawlUrls: [], pageFetches: [] };

function htmlResp(body, { status = 200, ctype = "text/html; charset=utf-8", location = null } = {}) {
  return { status, ctype, body, location };
}

const RICH_HTML = `<html><head><title>Leadership — Acme Corp</title></head><body>
  <h1>Our Leadership Team</h1>
  <p>${"Jane Smith serves as Chief Executive Officer (CEO) and leads the executive team. ".repeat(20)}</p>
  <p>John Doe, CFO. Mary Major, President and founder.</p>
</body></html>`;
const THIN_HTML = `<html><head><title>Acme</title></head><body><div id="root"></div></body></html>`;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://api.firecrawl.dev/")) {
    state.firecrawlCalls++;
    state.firecrawlUrls.push(init.body ? JSON.parse(init.body).url : null);
    const fc = state.firecrawl;
    if (!fc) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ success: true, data: { markdown: fc.markdown, metadata: { title: fc.title } } }) };
  }
  state.pageFetches.push({ url: u, redirect: init.redirect });
  const spec = state.routes.get(u);
  if (!spec) throw new Error(`unexpected fetch in fetch tests: ${u}`);
  const headers = new Headers({ "content-type": spec.ctype || "", ...(spec.location ? { location: spec.location } : {}) });
  const bytes = new TextEncoder().encode(spec.body || "");
  let served = false;
  return {
    status: spec.status,
    headers,
    body: {
      getReader() {
        return {
          async read() {
            if (served) return { done: true, value: undefined };
            served = true;
            return { done: false, value: bytes };
          },
          cancel() {},
        };
      },
    },
  };
};

const { handler } = await import("../../api-aws/fetch/index.js");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

function reset() {
  state.routes = new Map();
  state.firecrawl = null;
  state.firecrawlCalls = 0;
  state.firecrawlUrls = [];
  state.pageFetches = [];
}

function event({ method = "POST", origin = "https://cambree.ai", body = null, token = mintHS256() } = {}) {
  return {
    rawPath: "/api/fetch",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    requestContext: { http: { method, sourceIp: "5.5.5.5" } },
    body: body == null ? null : JSON.stringify(body),
  };
}

console.log("\n── guard behavior (parity with api/fetch.js) ───────────────────");
reset();
{
  const out = await handler(event({ method: "OPTIONS", token: null }));
  assert(out.statusCode === 204 && out.headers["Access-Control-Allow-Origin"] === "https://cambree.ai", "preflight answered with CORS headers");
}
{
  const out = await handler(event({ method: "GET" }));
  assert(out.statusCode === 405 && JSON.parse(out.body).reason === "fetch_failed", "non-POST → 405 with ok:false shape");
}
{
  const out = await handler(event({ origin: "https://evil.com", body: { url: "https://example.com/" } }));
  assert(out.statusCode === 403 && JSON.parse(out.body).ok === false, "disallowed origin → 403");
}
{
  const out = await handler(event({ body: { url: "https://example.com/" }, token: null }));
  assert(out.statusCode === 401 && JSON.parse(out.body).ok === false, "no JWT → 401");
}
{
  const out = await handler(event({ body: {} }));
  assert(out.statusCode === 200 && JSON.parse(out.body).reason === "fetch_failed", "missing url → 200 ok:false (never a 500)");
}
{
  const out = await handler(event({ body: { url: "https://example.com/" + "x".repeat(2048) } }));
  assert(out.statusCode === 200 && JSON.parse(out.body).ok === false, "oversized url → 200 ok:false");
}
{
  const out = await handler(event({ body: { url: "https://example.com/", render: "sometimes" } }));
  assert(out.statusCode === 200 && JSON.parse(out.body).reason === "fetch_failed", "invalid render mode → 200 ok:false");
}

console.log("\n── SSRF integration (full matrix in tests/fetch-ssrf) ─────────");
{
  reset();
  const out = await handler(event({ body: { url: "http://127.0.0.1/latest/meta-data/" } }));
  assert(out.statusCode === 200 && JSON.parse(out.body).reason === "blocked_private_ip", "private IP literal → blocked_private_ip, no connection");
  assert(state.pageFetches.length === 0, "no outbound request was made");
}
{
  reset();
  const out = await handler(event({ body: { url: "https://www.linkedin.com/company/acme" } }));
  assert(out.statusCode === 200 && JSON.parse(out.body).reason === "blocked_host", "linkedin → blocked_host");
}
{
  reset();
  state.routes.set("https://example.com/leadership", htmlResp("", { status: 302, location: "http://169.254.169.254/latest/meta-data/" }));
  const out = await handler(event({ body: { url: "https://example.com/leadership", render: "never" } }));
  assert(out.statusCode === 200 && JSON.parse(out.body).reason === "blocked_private_ip", "redirect to cloud metadata → blocked on the hop (render:never surfaces the reason)");
  assert(state.pageFetches.length === 1 && state.pageFetches[0].redirect === "manual", "redirects handled manually (one hop, then blocked)");
}
{
  reset();
  // Parity: with render:auto a blocked hop is a stage-1 failure, which
  // escalates — but Firecrawl is only ever given the ORIGINAL public URL
  // (finalUrl is unset on failure), never the private redirect target.
  state.routes.set("https://example.com/leadership", htmlResp("", { status: 302, location: "http://169.254.169.254/latest/meta-data/" }));
  state.firecrawl = { markdown: "# Leadership\n\nJane Smith, CEO. ".repeat(10), title: "Leadership" };
  const out = await handler(event({ body: { url: "https://example.com/leadership" } }));
  const body = JSON.parse(out.body);
  assert(body.ok === true && body.renderUsed === true, "render:auto escalates the blocked-hop failure to the render service");
  assert(state.firecrawlUrls[0] === "https://example.com/leadership", "render service receives only the public URL, never the private redirect target");
}

console.log("\n── stage 1: plain fetch ────────────────────────────────────────");
{
  reset();
  state.routes.set("https://example.com/leadership", htmlResp(RICH_HTML));
  const out = await handler(event({ body: { url: "https://example.com/leadership" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === true && body.renderUsed === false, "rich leadership page → stage-1 success, no render");
  assert(body.title === "Leadership — Acme Corp", "title extracted");
  assert(body.text.includes("Chief Executive Officer") && !body.text.includes("<h1>"), "text extracted, tags stripped");
  assert(body.httpStatus === 200 && body.finalUrl === "https://example.com/leadership" && body.cached === false, "response shape parity");
  assert(state.firecrawlCalls === 0, "no render-service call for a substantive page");
}
{
  reset();
  state.routes.set("https://example.com/leaders", htmlResp("", { status: 301, location: "https://example.com/leadership" }));
  state.routes.set("https://example.com/leadership", htmlResp(RICH_HTML));
  const out = await handler(event({ body: { url: "https://example.com/leaders" } }));
  const body = JSON.parse(out.body);
  assert(body.ok === true && body.finalUrl === "https://example.com/leadership", "public redirect followed; finalUrl reflects the landing page");
}
{
  reset();
  state.routes.set("https://example.com/nope", htmlResp("<html>gone</html>", { status: 404 }));
  const out = await handler(event({ body: { url: "https://example.com/nope" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === false && body.reason === "fetch_failed", "404 → ok:false fetch_failed");
  assert(state.firecrawlCalls === 0, "404/410 definitive miss short-circuits render escalation");
}
{
  reset();
  state.routes.set("https://example.com/data.json", htmlResp("{}", { ctype: "application/json" }));
  state.firecrawl = { markdown: "# Leadership\n\nJane Smith, CEO. ".repeat(10), title: "Leadership" };
  const out = await handler(event({ body: { url: "https://example.com/data.json", render: "never" } }));
  assert(JSON.parse(out.body).reason === "non_html" && state.firecrawlCalls === 0, "non-HTML content-type with render:never → non_html, no escalation");
}

console.log("\n── stage 2: render escalation ──────────────────────────────────");
{
  reset();
  state.routes.set("https://spa.example.com/team", htmlResp(THIN_HTML));
  state.firecrawl = { markdown: "# Our Team\n\nJane Smith, Chief Executive Officer. ".repeat(5), title: "Our Team" };
  const out = await handler(event({ body: { url: "https://spa.example.com/team" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === true && body.renderUsed === true, "SPA shell escalates to render and succeeds");
  assert(body.title === "Our Team" && body.text.includes("Chief Executive Officer"), "rendered markdown + title returned");
  assert(state.firecrawlCalls === 1, "exactly one render-service call");
}
{
  reset();
  state.routes.set("https://spa.example.com/team", htmlResp(THIN_HTML));
  const out = await handler(event({ body: { url: "https://spa.example.com/team", render: "never" } }));
  const body = JSON.parse(out.body);
  assert(body.ok === true && body.renderUsed === false && state.firecrawlCalls === 0, "render:never returns thin stage-1 text without escalating");
}
{
  reset();
  state.routes.set("https://spa.example.com/team", htmlResp(THIN_HTML));
  state.firecrawl = null; // Firecrawl 500s
  const out = await handler(event({ body: { url: "https://spa.example.com/team" } }));
  const body = JSON.parse(out.body);
  assert(out.statusCode === 200 && body.ok === false && body.reason === "render_failed", "thin page + render failure → render_failed (still not a 500)");
}
{
  reset();
  delete process.env.FIRECRAWL_API_KEY;
  state.routes.set("https://spa.example.com/team", htmlResp(THIN_HTML));
  const out = await handler(event({ body: { url: "https://spa.example.com/team" } }));
  assert(JSON.parse(out.body).reason === "render_failed" && state.firecrawlCalls === 0, "no Firecrawl key → render_failed without an outbound call");
  process.env.FIRECRAWL_API_KEY = "fc-mock-key";
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("Failures:\n  " + failures.join("\n  ")); process.exit(1); }
