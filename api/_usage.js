// api/_usage.js
//
// Server-side usage tracking for org-level playbook run limits.
// Tracks both standard (Haiku) and Max (Opus) runs separately.
// Uses the Supabase REST API with the service_role key (not the
// anon key) so it can read across RLS boundaries.
//
// Headers from client:
//   x-billable-run: "1" — this is a standard playbook run
//   x-billable-max: "1" — this is a Max (Opus) playbook run

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

/** Log API token usage for cost tracking. Fire-and-forget. */
export function logTokenUsage({ userId, orgId, model, inputTokens, outputTokens, cacheReadTokens = 0, cacheCreationTokens = 0, webSearches = 0, endpoint = "claude", targetCompany = null, sellerUrl = null, briefType = null, durationMs = null }) {
  if (!SB_URL || !SB_KEY) return;
  const row = {
    user_id: userId || null,
    org_id: orgId || null,
    model: model || "unknown",
    input_tokens: inputTokens || 0,
    output_tokens: outputTokens || 0,
    cache_read_tokens: cacheReadTokens || 0,
    cache_creation_tokens: cacheCreationTokens || 0,
    web_searches: webSearches || 0,
    endpoint,
  };
  // Add tracking detail fields (columns added in migration 016)
  if (targetCompany) row.target_company = targetCompany.slice(0, 200);
  if (sellerUrl) row.seller_url = sellerUrl.slice(0, 200);
  if (briefType) row.brief_type = briefType.slice(0, 50);
  // Request duration in ms (duration_ms column — applied via Supabase before this deployed)
  if (Number.isInteger(durationMs) && durationMs >= 0) row.duration_ms = durationMs;
  fetch(`${SB_URL}/rest/v1/api_usage_log`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(row),
  }).catch(() => {}); // fire-and-forget
}

/** Extract tracking context from request headers (set by client) */
// Sanitize tracking headers — untrusted client input, logged to DB
const sanitizeTracking = (val, maxLen = 200) => {
  if (!val || typeof val !== "string") return null;
  // Strip HTML/script tags, control chars, and excessive whitespace
  return val.replace(/<[^>]*>/g, "").replace(/[\x00-\x1f]/g, "").trim().slice(0, maxLen) || null;
};
export function extractTrackingContext(req) {
  return {
    targetCompany: sanitizeTracking(req.headers["x-target-company"], 150),
    sellerUrl: sanitizeTracking(req.headers["x-seller-url"], 150),
    briefType: sanitizeTracking(req.headers["x-brief-type"], 50),
  };
}

function sbFetch(path, method = "GET", body = null) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: method === "POST" ? "return=representation" : undefined,
  };
  Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sbRpc(fn, params) {
  return fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  }).then(r => r.json());
}

export function extractUserId(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const parts = auth.slice(7).split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    );
    return payload.sub || null;
  } catch { return null; }
}

/**
 * Auto-provision a trial org for a user who has no org_id.
 * Returns the new org_id, or null on failure.
 */
async function provisionTrialOrg(userId) {
  try {
    // Get user email/name for the org name
    const userRes = await sbFetch(`users?id=eq.${userId}&select=email,name`);
    const users = await userRes.json();
    const user = users?.[0];
    const orgName = user?.name || user?.email || "My Organization";

    // Create a trial org with default limits (run_limit=3, max_run_limit=0)
    const createRes = await fetch(`${SB_URL}/rest/v1/orgs`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ name: orgName }),
    });
    const created = await createRes.json();
    const newOrgId = created?.[0]?.id;
    if (!newOrgId) return null;

    // Bind user to the new org as rep (consistent with DB trigger in migration 009)
    await fetch(`${SB_URL}/rest/v1/users?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ org_id: newOrgId, role: "rep" }),
    });

    console.log(`[usage] Auto-provisioned trial org ${newOrgId} for user ${userId}`);
    return newOrgId;
  } catch (e) {
    console.warn("[usage] Failed to provision trial org:", e.message);
    return null;
  }
}

/**
 * Check if the user's org has remaining runs.
 * isMax=true checks max_run_count/max_run_limit (Opus).
 * isMax=false checks run_count/run_limit (Haiku, default).
 */
export async function checkOrgUsage(userId, { isMax = false } = {}) {
  if (!SB_URL || !SB_KEY) return { allowed: true };

  try {
    const userRes = await sbFetch(`users?id=eq.${userId}&select=org_id`);
    const users = await userRes.json();
    let orgId = users?.[0]?.org_id;

    // Auto-provision a trial org for users without one
    if (!orgId) {
      orgId = await provisionTrialOrg(userId);
      if (!orgId) {
        return { allowed: false, reason: "no_org", message: "Account setup failed. Please try again or contact support." };
      }
    }

    const orgRes = await sbFetch(`orgs?id=eq.${orgId}&select=run_count,run_limit,max_run_count,max_run_limit,plan,rollover_runs`);
    const orgs = await orgRes.json();
    const org = orgs?.[0];
    if (!org) return { allowed: true };

    if (org.plan === "suspended") {
      return { allowed: false, reason: "suspended" };
    }

    // Total available = plan limit + rollover from last month
    const totalAvailable = (org.run_limit || 0) + (org.rollover_runs || 0);

    if (isMax) {
      if (org.max_run_limit <= 0) {
        return { allowed: false, reason: "max_not_available", message: "Cambrian Max is not available on your plan. Upgrade to unlock premium intelligence." };
      }
      if (org.max_run_count >= org.max_run_limit) {
        return { allowed: false, reason: "max_limit_exceeded", max_run_count: org.max_run_count, max_run_limit: org.max_run_limit };
      }
      if (org.run_count >= totalAvailable) {
        return { allowed: false, reason: "limit_exceeded", run_count: org.run_count, run_limit: org.run_limit, rollover_runs: org.rollover_runs || 0, total_available: totalAvailable };
      }
      return { allowed: true, org_id: orgId, max_run_count: org.max_run_count, max_run_limit: org.max_run_limit, run_count: org.run_count, run_limit: org.run_limit, rollover_runs: org.rollover_runs || 0, total_available: totalAvailable };
    } else {
      if (org.run_count >= totalAvailable) {
        return { allowed: false, reason: "limit_exceeded", run_count: org.run_count, run_limit: org.run_limit, rollover_runs: org.rollover_runs || 0, total_available: totalAvailable };
      }
      return { allowed: true, org_id: orgId, run_count: org.run_count, run_limit: org.run_limit, rollover_runs: org.rollover_runs || 0, total_available: totalAvailable, max_run_count: org.max_run_count, max_run_limit: org.max_run_limit };
    }
  } catch (e) {
    console.error("[usage] check failed — BLOCKING (fail-closed):", e.message);
    return { allowed: false, reason: "service_error", message: "Usage check temporarily unavailable. Please try again in a moment." };
  }
}

/** Increment standard run counter */
export async function incrementUsage(orgId) {
  if (!SB_URL || !SB_KEY) return;
  try {
    const result = await sbRpc("increment_run_count", { p_org_id: orgId });
    if (result?.error) console.warn("[usage] increment failed:", result.error);
    return result;
  } catch (e) {
    console.warn("[usage] increment error:", e.message);
  }
}

/** Increment Max run counter (also increments standard counter) */
export async function incrementMaxUsage(orgId) {
  if (!SB_URL || !SB_KEY) return;
  try {
    // Increment both counters — Max run costs a regular run too
    const [maxResult, stdResult] = await Promise.all([
      sbRpc("increment_max_run_count", { p_org_id: orgId }),
      sbRpc("increment_run_count", { p_org_id: orgId }),
    ]);
    if (maxResult?.error) console.warn("[usage] max increment failed:", maxResult.error);
    return maxResult;
  } catch (e) {
    console.warn("[usage] max increment error:", e.message);
  }
}
