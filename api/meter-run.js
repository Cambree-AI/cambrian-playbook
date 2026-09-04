// api/meter-run.js
//
// Meters ONE run at a user-intent boundary.
//
// WHY THIS EXISTS
// Metering used to ride on the `x-billable-run` header attached to the P2
// executives web-search fallback inside generateBrief(). That call is
// conditional — it only fires when Phase 0 fails to resolve page-verified
// executives — and every other candidate call (P1, P2) is cache-gated. The
// result: two identical user clicks could bill differently, and
// buildSellerICP ("Analyze my company") never metered at all because
// streamAIWithSearch had no way to send headers.
//
// Production evidence at the time of writing (2026-08-06):
//   sum(orgs.run_count) = 3   vs   356 briefs in account_outputs
//   2 of 36 orgs had any run counted
//   294 unmetered Opus calls (7.88M in / 0.49M out tokens)
//
// THE MODEL THIS ENFORCES
//   Quick Brief   → user clicks "Go"                  → 1 run
//   Full Session  → user clicks "Analyze my company"  → 1 run
//   Nothing else meters. Steps 2-9 are included in the Full Session's run.
//
// Deliberately dumb: no model call, no research, no caching. It authenticates,
// checks the org's allowance, increments, and answers. That is the whole job —
// which is exactly why it is reliable.

import { applyCors, isAllowedOrigin, checkRateLimit, verifyJwt, decodeJwtPayload } from "./_guard.js";
import { checkOrgUsage, incrementUsage, incrementMaxUsage } from "./_usage.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Recognised metering events. Anything else is rejected so a typo on the
// client can never silently mean "don't bill".
const KINDS = {
  quick_brief:  { isMax: false, label: "Quick Brief" },
  full_session: { isMax: false, label: "Full Sales Session" },
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  if (req.method !== "POST") return res.status(405).end();

  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: { type: "origin_not_allowed" } });
  }

  // Cheap abuse guard. Signature matches the rest of api/ — checkRateLimit(ip)
  // returns false when the caller is over the shared 200/min per-IP window.
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: { type: "rate_limited" } });
  }

  const kindKey = (req.body && req.body.kind) || "";
  const kind = KINDS[kindKey];
  if (!kind) {
    return res.status(400).json({
      error: { type: "unknown_kind", message: `kind must be one of: ${Object.keys(KINDS).join(", ")}` },
    });
  }

  // Unauthenticated callers cannot consume a run. Guests are handled by the
  // caller's own guest path (see api/claude.js `req._isGuest`); if guest
  // metering policy changes, change it here in one place.
  //
  // verifyJwt checks the signature, expiry and issuer — extractUserId alone
  // only base64-decodes the payload, so a forged `sub` would otherwise let an
  // unauthenticated caller charge a run to someone else's org. Same pattern as
  // api/checkout.js: verify, then UUID-validate the sub before it reaches a
  // service_role query.
  if (!await verifyJwt(req) || req._isGuest) {
    return res.status(401).json({ error: { type: "unauthenticated" } });
  }
  const userId = decodeJwtPayload((req.headers.authorization || "").slice(7))?.sub;
  if (!userId || !UUID_RE.test(userId)) {
    return res.status(401).json({ error: { type: "unauthenticated" } });
  }

  // checkOrgUsage auto-provisions a trial org for users who don't have one,
  // and accounts for rollover_runs in total_available. Do not reimplement
  // that math here — it lives in _usage.js and must stay single-sourced.
  let usage;
  try {
    usage = await checkOrgUsage(userId, { isMax: kind.isMax });
  } catch (e) {
    // FAIL CLOSED. A metering outage must never hand out free runs.
    console.error("[meter-run] checkOrgUsage threw:", e && e.message);
    return res.status(503).json({
      error: { type: "meter_unavailable", message: "Could not verify your run allowance. Please try again." },
    });
  }

  if (!usage.allowed) {
    const errType =
      usage.reason === "max_not_available"   ? "max_not_available" :
      usage.reason === "max_limit_exceeded"  ? "max_limit_exceeded" :
                                               "usage_limit_exceeded";
    // Same 402 shape api/claude.js returns, so the existing
    // "usage-limit-exceeded" client listener and upgrade modal work unchanged.
    return res.status(402).json({
      error: { type: errType, message: usage.message || "You've used all your runs." },
      run_count: usage.run_count,
      run_limit: usage.run_limit,
      max_run_count: usage.max_run_count,
      max_run_limit: usage.max_run_limit,
      rollover_runs: usage.rollover_runs,
    });
  }

  // Increment BEFORE the client starts work. The old post-2xx ordering was
  // correct when the meter rode on a model call that might fail; here the
  // user action is the billable event, and under-billing is the failure mode
  // we are fixing. If generation later fails, "Retry Brief (free)" covers it.
  try {
    if (kind.isMax) await incrementMaxUsage(usage.org_id);
    else            await incrementUsage(usage.org_id);
  } catch (e) {
    console.error("[meter-run] increment failed:", e && e.message);
    return res.status(503).json({
      error: { type: "meter_unavailable", message: "Could not record your run. Please try again." },
    });
  }

  const used = (usage.run_count || 0) + 1;
  const total = usage.total_available != null ? usage.total_available : usage.run_limit;

  console.log(`[meter-run] ${kind.label} metered · org=${usage.org_id} · ${used}/${total}`);

  return res.status(200).json({
    ok: true,
    kind: kindKey,
    run_count: used,
    run_limit: usage.run_limit,
    rollover_runs: usage.rollover_runs || 0,
    total_available: total,
    remaining: Math.max(0, (total || 0) - used),
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   CLIENT COUNTERPART — for src/App.jsx, place adjacent to claudeFetch (~1130).
   Reproduced here so the whole contract is reviewable in one file; it is
   added to App.jsx in Commit 2, not imported from here.

   async function meterRun(kind) {
     try {
       const r = await fetch("/api/meter-run", {
         method: "POST",
         headers: { ...authHeaders(), "Content-Type": "application/json" },
         body: JSON.stringify({ kind }),
       });
       if (r.status === 402) {
         const d = await r.json().catch(() => ({}));
         // Same event api/claude.js 402s trigger — opens the upgrade modal.
         window.dispatchEvent(new CustomEvent("usage-limit-exceeded", { detail: d }));
         return false;
       }
       if (!r.ok) {
         console.warn("[meterRun] non-OK:", r.status);
         return false;               // fail closed
       }
       const d = await r.json();
       // Keep the header run counter honest without a refetch.
       setOrgCtx(prev => prev ? { ...prev, run_count: d.run_count } : prev);
       return true;
     } catch (e) {
       console.warn("[meterRun] network error:", e && e.message);
       return false;                 // fail closed
     }
   }
   ───────────────────────────────────────────────────────────────────────── */
