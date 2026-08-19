// api/checkout.js
//
// Creates a Stripe Checkout session for plan upgrades.
// POST { priceId, planId } with JWT → returns checkout URL.
// planId "promo_pack" is the one-time $45 / 20-run offer for promo-code
// signups (issue #2): mode=payment, price resolved server-side from
// STRIPE_PRICE_PROMO_PACK, eligibility verified against the org's admitting
// promo code — never trusted from the client, since price IDs ship in the
// bundle.

import { verifyJwt, decodeJwtPayload, isAllowedOrigin, checkRateLimit } from "./_guard.js";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.VITE_APP_URL || "https://www.cambriancatalyst.ai";
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

// Plan config — maps planId to run limits
const PLAN_LIMITS = {
  starter:    { run_limit: 25,   max_run_limit: 5 },
  pro:        { run_limit: 100,  max_run_limit: 20 },
  team:       { run_limit: 250,  max_run_limit: 50 },
  enterprise: { run_limit: 1000, max_run_limit: 200 },
};

// One-time run pack for promo-code signups — runs added by the webhook via
// apply_run_pack() (migration 034), keep in sync with stripe-webhook.js.
const PROMO_PACK_RUNS = 20;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!STRIPE_SECRET) return res.status(500).json({ error: "Stripe not configured" });

  // Origin check
  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "Origin not allowed" });

  // Rate limiting
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) return res.status(429).json({ error: "Too many requests" });

  // Auth
  if (!await verifyJwt(req)) return res.status(401).json({ error: "Authentication required" });
  const authToken = (req.headers.authorization || "").slice(7);
  const payload = decodeJwtPayload(authToken);
  if (!payload?.sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) return res.status(401).json({ error: "Authentication required" });

  // Server-side priceId→planId binding — prevents plan manipulation
  const PRICE_TO_PLAN = {};
  if (process.env.STRIPE_PRICE_STARTER) PRICE_TO_PLAN[process.env.STRIPE_PRICE_STARTER] = "starter";
  if (process.env.STRIPE_PRICE_PRO) PRICE_TO_PLAN[process.env.STRIPE_PRICE_PRO] = "pro";
  if (process.env.STRIPE_PRICE_TEAM) PRICE_TO_PLAN[process.env.STRIPE_PRICE_TEAM] = "team";
  if (process.env.STRIPE_PRICE_ENTERPRISE) PRICE_TO_PLAN[process.env.STRIPE_PRICE_ENTERPRISE] = "enterprise";

  const { priceId, planId: requestedPlanId } = req.body || {};
  const isPack = requestedPlanId === "promo_pack";
  let planId, sessionPriceId;
  if (isPack) {
    sessionPriceId = process.env.STRIPE_PRICE_PROMO_PACK;
    if (!sessionPriceId) return res.status(500).json({ error: "Promo offer not configured" });
    planId = "promo_pack";
  } else {
    if (!priceId || typeof priceId !== "string") return res.status(400).json({ error: "priceId required" });
    planId = PRICE_TO_PLAN[priceId];
    if (!planId || !PLAN_LIMITS[planId]) return res.status(400).json({ error: "Invalid price" });
    sessionPriceId = priceId;
  }

  // Get user email and org
  let userEmail = "";
  let orgId = "";
  try {
    const userRes = await fetch(`${SB_URL}/rest/v1/users?id=eq.${payload.sub}&select=email,org_id`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const users = await userRes.json();
    userEmail = users?.[0]?.email || "";
    orgId = users?.[0]?.org_id || "";
  } catch (e) {
    console.error("[checkout] User lookup failed:", e.message);
    return res.status(500).json({ error: "User lookup failed" });
  }

  // Pack eligibility: the org must have been admitted by a promo code whose
  // row still grants the offer and is active, and must still be on the
  // trial (or a prior pack's promo) plan.
  if (isPack) {
    try {
      if (!orgId) return res.status(403).json({ error: "This offer isn't available for your account" });
      const orgRes = await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}&select=promo_code,plan`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      const org = (await orgRes.json())?.[0];
      let eligible = false;
      if (org?.promo_code && (org.plan === "trial" || org.plan === "promo")) {
        const codeRes = await fetch(
          `${SB_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(org.promo_code)}&grants_run_pack=is.true&active=is.true&select=code`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
        const codes = await codeRes.json();
        eligible = Array.isArray(codes) && codes.length > 0;
      }
      if (!eligible) return res.status(403).json({ error: "This offer isn't available for your account" });
    } catch (e) {
      console.error("[checkout] Pack eligibility check failed:", e.message);
      return res.status(500).json({ error: "Eligibility check failed" });
    }
  }

  try {
    // Create Stripe Checkout session — one-time payment for the run pack,
    // subscription for everything else
    const params = new URLSearchParams();
    params.append("mode", isPack ? "payment" : "subscription");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price]", sessionPriceId);
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", `${APP_URL}?checkout=success&plan=${planId}`);
    params.append("cancel_url", `${APP_URL}?checkout=cancel`);
    if (userEmail) params.append("customer_email", userEmail);
    // Store metadata for webhook
    params.append("metadata[user_id]", payload.sub);
    params.append("metadata[org_id]", orgId);
    params.append("metadata[plan_id]", planId);
    if (isPack) {
      params.append("metadata[pack_runs]", String(PROMO_PACK_RUNS));
    } else {
      params.append("subscription_data[metadata][user_id]", payload.sub);
      params.append("subscription_data[metadata][org_id]", orgId);
      params.append("subscription_data[metadata][plan_id]", planId);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (session.error) return res.status(400).json({ error: session.error.message });

    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: "Failed to create checkout session" });
  }
}
