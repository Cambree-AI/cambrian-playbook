// api/cron-reset-tokens.js
//
// Monthly billing cycle — calculates rollover runs, then resets counters.
// Triggered by Vercel Cron on the 1st of each month at midnight UTC.
//
// Rollover model:
//   - Unused runs carry forward (capped at 1 month's allocation)
//   - run_count resets to 0
//   - rollover_runs = min(unused, rollover_cap)
//   - Trial orgs: no rollover, just reset
//
// Security: requires CRON_SECRET header to prevent unauthorized calls.

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not set — rejecting (fail-closed)");
    return res.status(500).json({ error: "Cron not configured" });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SB_KEY || !SB_URL) {
    return res.status(500).json({ error: "Not configured" });
  }

  try {
    // Step 1: Process rollover for paid orgs (atomic RPC)
    const rolloverRes = await fetch(`${SB_URL}/rest/v1/rpc/process_monthly_rollover`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const rolloverData = await rolloverRes.json();
    const paidCount = rolloverData?.orgs_processed || 0;

    // Step 1b: Reset max_run_count for paid and promo_monthly orgs (Max Mode
    // removed, but counter should not accumulate indefinitely month-over-month).
    // promo_monthly has max_run_limit=0 so this should always be a no-op for
    // those orgs, but defensive resets are cheap.
    await fetch(`${SB_URL}/rest/v1/orgs?plan=in.(paid,promo_monthly)&max_run_count=gt.0`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ max_run_count: 0 }),
    });

    // Step 2: Reset trial orgs (no rollover, just zero out)
    const trialRes = await fetch(`${SB_URL}/rest/v1/orgs?plan=eq.trial&run_count=gt.0`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ run_count: 0, max_run_count: 0, rollover_runs: 0 }),
    });
    const trialUpdated = await trialRes.json();
    const trialCount = Array.isArray(trialUpdated) ? trialUpdated.length : 0;

    // Step 3: Reset referral bonus counters (monthly cap resets)
    await fetch(`${SB_URL}/rest/v1/orgs?referral_bonus_runs=gt.0`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ referral_bonus_runs: 0 }),
    });

    // Audit log
    await fetch(`${SB_URL}/rest/v1/api_usage_log`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: "system",
        model: "cron-monthly-rollover",
        input_tokens: 0,
        output_tokens: 0,
        web_searches: 0,
        endpoint: `paid:${paidCount},trial:${trialCount}`,
      }),
    });

    console.log(`[cron] Monthly cycle: ${paidCount} paid orgs rolled over, ${trialCount} trial orgs reset`);
    res.status(200).json({ ok: true, paid_rollovers: paidCount, trial_resets: trialCount, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("[cron] Monthly cycle failed:", e.message);
    res.status(500).json({ error: "Cycle failed" });
  }
}
