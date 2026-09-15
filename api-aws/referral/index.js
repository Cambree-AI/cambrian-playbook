// api-aws/referral/index.js
/* global process */
//
// AWS port of api/referral.js (issue #87) — referral reward processing.
// Returns the caller's referral code/stats, records who referred a new
// signup, and awards +1 run to the referrer's org after the referred user's
// first brief (capped via the increment_referral_bonus RPC). Logic is a
// line-for-line copy of the Vercel handler wrapped in the shared adapter;
// keep the two in sync until the Vercel copy is removed in the final
// conversion issue. Parity is asserted by tests/api-aws/referral.test.js
// against a mocked Supabase REST API.
//
// Differences from the Vercel copy (all platform-level):
//   - no in-memory checkRateLimit — API Gateway stage throttling covers it
//   - env vars are read lazily — SUPABASE_SERVICE_KEY arrives via Secrets
//     Manager at cold start. The referral link base is APP_URL (Terraform,
//     from var.vite_app_url) with the same fallback chain as Vercel.

import { httpAdapter } from "../shared/adapter.js";
import { applyCors, verifyJwt, decodeJwtPayload, isAllowedOrigin } from "../shared/guard.js";
import { loadSecrets } from "../shared/secrets.js";

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_KEY || "";
const appUrl = () => process.env.APP_URL || process.env.VITE_APP_URL || "https://www.cambree.ai";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERRAL_CODE_RE = /^[a-zA-Z0-9_-]{4,32}$/;

async function sbFetch(path, method = "GET", body = null) {
  const headers = { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" };
  if (method === "POST") headers.Prefer = "return=representation";
  if (method === "PATCH") headers.Prefer = "return=minimal";
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
}

async function sbRpc(fn, params) {
  return fetch(`${supabaseUrl()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then(r => r.json());
}

export async function referralHandler(req, res) {
  await loadSecrets(); // populates SUPABASE_SERVICE_KEY on cold start
  if (applyCors(req, res)) return; // CORS preflight (issue #83)
  if (req.method !== "POST") return res.status(405).end();

  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Origin not allowed" });

  if (!await verifyJwt(req)) return res.status(401).json({ error: "Authentication required" });
  const authToken = (req.headers.authorization || "").slice(7);
  const payload = decodeJwtPayload(authToken);
  if (!payload?.sub || !UUID_RE.test(payload.sub)) return res.status(401).json({ error: "Authentication required" });

  const { action } = req.body || {};

  // GET: return the current user's referral code and stats
  if (action === "get_referral_info") {
    const users = await sbFetch(`users?id=eq.${payload.sub}&select=referral_code,referred_by,referral_rewarded,org_id`);
    const user = users?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    // Count how many people this user has referred
    const referred = await sbFetch(`users?referred_by=eq.${user.referral_code}&select=id,referral_rewarded`);
    const referralCount = (referred || []).length;
    const rewardedCount = (referred || []).filter(r => r.referral_rewarded).length;

    // Get org bonus info
    let bonusRuns = 0, bonusCap = 5;
    if (user.org_id) {
      const orgs = await sbFetch(`orgs?id=eq.${user.org_id}&select=referral_bonus_runs,referral_bonus_cap`);
      if (orgs?.[0]) { bonusRuns = orgs[0].referral_bonus_runs || 0; bonusCap = orgs[0].referral_bonus_cap || 5; }
    }

    return res.json({
      ok: true,
      referral_code: user.referral_code,
      referral_link: `${appUrl()}?ref=${user.referral_code}`,
      total_referred: referralCount,
      total_rewarded: rewardedCount,
      bonus_runs_this_month: bonusRuns,
      bonus_cap: bonusCap,
    });
  }

  // POST: store referral code on signup
  if (action === "set_referrer") {
    const { referralCode } = req.body || {};
    if (!referralCode || !REFERRAL_CODE_RE.test(referralCode)) return res.status(400).json({ error: "Referral code required" });

    // Verify the referral code exists and isn't the user's own
    const referrers = await sbFetch(`users?referral_code=eq.${encodeURIComponent(referralCode)}&select=id`);
    if (!referrers?.length) return res.json({ ok: false, message: "Invalid referral code" });
    if (referrers[0].id === payload.sub) return res.json({ ok: false, message: "Can't refer yourself" });

    // Check if user already has a referrer — don't allow overwriting
    const currentUser = await sbFetch(`users?id=eq.${payload.sub}&select=referred_by`);
    if (currentUser?.[0]?.referred_by) return res.json({ ok: true, message: "Referral already recorded" });

    // Set referred_by on the current user (only if not already set)
    await fetch(`${supabaseUrl()}/rest/v1/users?id=eq.${payload.sub}&referred_by=is.null`, {
      method: "PATCH",
      headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ referred_by: referralCode }),
    });

    return res.json({ ok: true, message: "Referral tracked" });
  }

  // POST: process reward after first brief completion
  if (action === "process_reward") {
    // Check if this user was referred and hasn't been rewarded yet
    const users = await sbFetch(`users?id=eq.${payload.sub}&select=referred_by,referral_rewarded`);
    const user = users?.[0];
    if (!user?.referred_by || user.referral_rewarded) return res.json({ ok: true, message: "No reward to process" });

    // Find the referrer
    const referrers = await sbFetch(`users?referral_code=eq.${user.referred_by}&select=id,org_id`);
    const referrer = referrers?.[0];
    if (!referrer?.org_id) return res.json({ ok: true, message: "Referrer not found or has no org" });

    // Mark as rewarded FIRST (atomic flag) to prevent race-condition double-award.
    // Use If-Match header pattern: only patch if referral_rewarded is still false.
    const markRes = await fetch(`${supabaseUrl()}/rest/v1/users?id=eq.${payload.sub}&referral_rewarded=eq.false`, {
      method: "PATCH",
      headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ referral_rewarded: true }),
    });
    const marked = await markRes.json();
    // If no rows updated, another request already claimed this reward
    if (!marked?.length) return res.json({ ok: true, message: "Already processed" });

    // Award +1 run to the referrer's org using atomic RPC (SELECT … FOR UPDATE
    // inside PostgreSQL prevents two concurrent rewards from reading the same
    // run_limit and losing an increment).
    const rpcResult = await sbRpc("increment_referral_bonus", { p_org_id: referrer.org_id });
    if (rpcResult?.error) {
      // Cap reached or org not found — reward flag is already set so we won't retry
      console.log(`[referral] bonus RPC returned: ${rpcResult.error} for org ${referrer.org_id}`);
      return res.json({ ok: true, message: rpcResult.error === "cap_reached" ? "Referrer at bonus cap" : "Referrer org issue" });
    }

    console.log(`[referral] +1 run to org ${referrer.org_id} (run_limit=${rpcResult.run_limit}, bonus=${rpcResult.referral_bonus_runs}) from user ${payload.sub} (referred by ${user.referred_by})`);
    return res.json({ ok: true, message: "Referral reward granted!", rewarded: true });
  }

  return res.status(400).json({ error: "Unknown action" });
}

export const handler = httpAdapter(referralHandler);
