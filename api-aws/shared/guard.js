// api-aws/shared/guard.js
/* global process, Buffer */
//
// Shared request validation for the AWS Lambda endpoints — the port of
// api/_guard.js (issue #86). Bundled into every function by esbuild
// (decision record: api-aws/README.md — bundled module, not a Lambda layer).
//
// KEEP IN SYNC with api/_guard.js until the Vercel copy is decommissioned
// (migration Phase 9): origin allowlist, CORS headers, and JWT semantics must
// stay byte-identical so an endpoint behaves the same on either platform.
//
// Deliberate differences from api/_guard.js:
//   - NO in-memory per-IP/per-user rate limiter: Lambda instances don't share
//     memory the way warm Vercel instances do, so the Map-based limiter is
//     meaningless here. Baseline throttling is API Gateway stage limits
//     (infra/modules/api); per-user usage plans are the Phase 8 follow-up.
//   - IS_PRODUCTION comes from CAMBREE_ENV=prod (set by Terraform), not
//     VERCEL_ENV.
//   - Config is read lazily (per call, cheap) so secrets fetched at cold
//     start (shared/secrets.js) can populate process.env before first use.

import { createHmac, timingSafeEqual, createVerify, createPublicKey } from "crypto";

const isProduction = () => process.env.CAMBREE_ENV === "prod";

// ── ORIGIN CHECK — identical allowlist to api/_guard.js ──────────────────
export function isAllowedOrigin(origin) {
  if (!origin) return !isProduction(); // Allow missing origin in dev only
  let u;
  try { u = new URL(origin); } catch { return false; }
  const h = u.hostname;
  if (h === "cambrian-playbook.vercel.app") return true;
  if (/^cambrian-playbook[a-z0-9-]*\.vercel\.app$/.test(h)) return true;
  if (h.includes("cambrian-playbook") && h.endsWith(".vercel.app")) return true;
  if (h === "cambriancatalyst.ai" || h.endsWith(".cambriancatalyst.ai")) return true;
  if (h === "cambree.ai" || h.endsWith(".cambree.ai")) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  // Amplify default domains (issue #83) — exact per-app hostnames, never a
  // wildcard on all of amplifyapp.com. App ids: docs/aws-migration-plan.md §7.
  if (h === "dev.d1gtnd67v2ws7a.amplifyapp.com") return true;    // dev
  if (h === "staging.d33ublf97u0bs6.amplifyapp.com") return true; // staging
  if (h === "main.d1fuoohbeo8gqk.amplifyapp.com") return true;   // prod
  return false;
}

// ── CORS — identical behavior to api/_guard.js applyCors (issue #83) ─────
// Bearer-token CORS: echo the origin back ONLY when allowlisted (never *),
// answer preflight fully. Returns true when the request was an OPTIONS
// preflight and has been answered — the caller must return immediately.
export function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Billable-Run, X-Billable-Max, X-Brief-Type, X-Seller-Url, X-Target-Company"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
    return true;
  }
  return false;
}

// ── JWT AUTH — port of api/_guard.js verifyJwt ───────────────────────────
// HS256 via SUPABASE_JWT_SECRET; ES256/RS256 via the Supabase JWKS endpoint.
// Fail-closed everywhere in production.

function base64UrlDecode(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1]).toString());
  } catch { return null; }
}

let cachedJWKS = null;
let jwksFetchedAt = 0;
const JWKS_TTL = 300_000; // 5 minutes

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseRef = () => {
  try { return new URL(supabaseUrl()).hostname.split(".")[0]; } catch { return ""; }
};

async function getJWKS() {
  if (cachedJWKS && (Date.now() - jwksFetchedAt) < JWKS_TTL) return cachedJWKS;
  const base = supabaseUrl();
  if (!base) return null;
  try {
    const r = await fetch(`${base}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return cachedJWKS; // keep stale cache on failure
    const data = await r.json();
    cachedJWKS = data.keys || [];
    jwksFetchedAt = Date.now();
    return cachedJWKS;
  } catch {
    return cachedJWKS; // keep stale cache
  }
}

async function verifyAsymmetricSignature(token, alg) {
  const parts = token.split(".");
  const header = JSON.parse(base64UrlDecode(parts[0]).toString());
  const signedData = parts[0] + "." + parts[1];
  const signature = base64UrlDecode(parts[2]);

  const keys = await getJWKS();
  if (!keys || !keys.length) {
    console.error("[auth] JWKS unavailable — rejecting request");
    return false;
  }

  for (const jwk of keys) {
    try {
      if (header.kid && jwk.kid && header.kid !== jwk.kid) continue;
      const publicKey = createPublicKey({ key: jwk, format: "jwk" });
      const verifier = createVerify("SHA256");
      verifier.update(signedData);
      const opts = alg === "ES256" ? { key: publicKey, dsaEncoding: "ieee-p1363" } : publicKey;
      if (verifier.verify(opts, signature)) return true;
    } catch { continue; }
  }
  return false;
}

async function verifyJwtSignature(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const header = JSON.parse(base64UrlDecode(parts[0]).toString());
    const alg = header?.alg;

    if (alg === "HS256") {
      const secret = process.env.SUPABASE_JWT_SECRET || "";
      if (!secret) {
        if (isProduction()) return false;
        return true;
      }
      const expected = createHmac("sha256", secret)
        .update(parts[0] + "." + parts[1])
        .digest();
      const actual = base64UrlDecode(parts[2]);
      if (expected.length !== actual.length) return false;
      return timingSafeEqual(expected, actual);
    }

    if (alg === "ES256" || alg === "RS256") {
      return await verifyAsymmetricSignature(token, alg);
    }

    // Unknown algorithm — reject
    return false;
  } catch { return false; }
}

export async function verifyJwt(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token) {
      if (!await verifyJwtSignature(token)) return false;
      const payload = decodeJwtPayload(token);
      if (!payload) return false;

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return false;

      const ref = supabaseRef();
      if (!ref) return false;
      if (payload.iss !== "supabase" && !payload.iss?.includes(ref)) return false;

      req._isGuest = false;
      return true;
    }
  }

  // No valid JWT — guest mode is dev-only, exactly as on Vercel.
  if (isProduction()) return false;
  const guestFlag = (process.env.ALLOW_GUEST || "").replace(/^["']|["']$/g, "").replace(/\\n/g, "").trim().toLowerCase();
  if (guestFlag === "true" || guestFlag === "1" || guestFlag === "yes") {
    req._isGuest = true;
    return true;
  }

  return false;
}

// ── INPUT SIZE CAP ───────────────────────────────────────────────────────
// Same ceiling as api/_guard.js buildAnthropicBody's input check; exported
// standalone so non-Anthropic endpoints can cap arbitrary JSON bodies.
export const MAX_INPUT_BYTES = 250_000;
export function withinInputCap(value, max = MAX_INPUT_BYTES) {
  try { return JSON.stringify(value ?? "").length <= max; } catch { return false; }
}

// ── CLIENT IP ────────────────────────────────────────────────────────────
// API Gateway's requestContext.http.sourceIp lands on req.socket.remoteAddress
// via the adapter and is authoritative; header fallbacks keep parity with the
// Vercel handlers for any code path that still reads them.
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  return req.socket?.remoteAddress
    || (xff ? xff.split(",").pop().trim() : "")
    || req.headers["x-real-ip"]
    || "unknown";
}
