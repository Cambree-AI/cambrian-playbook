// api-aws/shared/usage.js
/* global process */
//
// Usage logging for the AWS Lambda endpoints — the port of api/_usage.js
// (issue #86). Same api_usage_log table, same Supabase REST API path.
// KEEP IN SYNC with api/_usage.js until the Vercel copy is decommissioned.
//
// Supabase access rule (docs/aws-migration-plan.md §6): Lambdas talk to
// Supabase over the REST API (PostgREST) or the Supavisor pooler — NEVER a
// direct Postgres connection; hundreds of concurrent Lambdas would exhaust
// the connection pool.

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_KEY || "";

/** Insert one row into api_usage_log via Supabase REST. Fire-and-forget by
 *  default; pass { wait: true } to await the write (use sparingly). */
export function logUsageRow(row, { wait = false } = {}) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) {
    console.warn("[usage] Supabase env missing — usage row dropped");
    return Promise.resolve();
  }
  const p = fetch(`${url}/rest/v1/api_usage_log`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  }).then((r) => {
    if (!r.ok) console.warn("[usage] insert failed:", r.status);
  }).catch((e) => {
    console.warn("[usage] insert error:", e?.message || e);
  });
  return wait ? p : Promise.resolve();
}

/** Port of api/_usage.js logTokenUsage — same row shape, same defaults. */
export function logTokenUsage({ userId, orgId, model, inputTokens, outputTokens, cacheReadTokens = 0, cacheCreationTokens = 0, webSearches = 0, endpoint = "claude", targetCompany = null, sellerUrl = null, briefType = null, durationMs = null }) {
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
  if (targetCompany) row.target_company = targetCompany.slice(0, 200);
  if (sellerUrl) row.seller_url = sellerUrl.slice(0, 200);
  if (briefType) row.brief_type = briefType.slice(0, 50);
  if (Number.isInteger(durationMs) && durationMs >= 0) row.duration_ms = durationMs;
  return logUsageRow(row);
}
