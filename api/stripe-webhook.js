// api/stripe-webhook.js
//
// Stripe webhook handler — automatically upgrades org plan/limits
// after successful checkout. Handles:
// - checkout.session.completed (initial subscription)
// - customer.subscription.updated (plan changes)
// - customer.subscription.deleted (cancellation)

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

// In-memory dedup — best-effort within a single instance lifespan.
// True idempotency is enforced below by checking the org's current
// plan/limits before writing (the update is already value-idempotent).
const processedSessions = new Set();
const DEDUP_MAX = 500;

// Plan config — same as checkout.js. Keep in sync.
const PLAN_LIMITS = {
  starter:       { run_limit: 25,   max_run_limit: 5 },
  pro:           { run_limit: 100,  max_run_limit: 20 },
  team:          { run_limit: 250,  max_run_limit: 50 },
  enterprise:    { run_limit: 1000, max_run_limit: 200 },
  promo_monthly: { run_limit: 20,   max_run_limit: 0 },  // issue #137: 2-month promo subscription
};

// One-time run pack (plan_id "promo_pack") — same as checkout.js
const PROMO_PACK_RUNS = 20;

// Stripe sends raw body — need to verify signature
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawBody, signature) {
  // Fail closed — reject if webhook secret is not configured
  if (!STRIPE_WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const elements = signature.split(",").reduce((acc, part) => {
    const [key, val] = part.split("=");
    acc[key] = val;
    return acc;
  }, {});
  const timestamp = elements.t;
  const expectedSig = elements.v1;
  if (!timestamp || !expectedSig) return false;

  // Reject replayed events older than 5 minutes
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (isNaN(timestampAge) || timestampAge > 300 || timestampAge < -60) return false;

  const payload = `${timestamp}.${rawBody}`;
  const computed = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  if (computed.length !== expectedSig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(expectedSig, "utf8"));
  } catch { return false; }
}

async function updateOrg(orgId, planId) {
  if (!orgId || !planId || !PLAN_LIMITS[planId]) return;
  const limits = PLAN_LIMITS[planId];

  // Idempotency guard — if the org already has the target plan and
  // matching limits, skip the write.  This protects against Stripe
  // retries that land on a different Vercel instance (where the
  // in-memory Set is empty).
  try {
    const checkRes = await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}&select=plan,run_limit,max_run_limit`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const orgs = await checkRes.json();
    const org = orgs?.[0];
    if (org && org.plan === "paid" && org.run_limit === limits.run_limit && org.max_run_limit === limits.max_run_limit) {
      console.log(`[stripe] Org ${orgId} already on ${planId} — skipping duplicate upgrade`);
      return;
    }
  } catch (e) {
    // If the check fails, proceed with the update (fail-open for the
    // idempotent write — worst case we PATCH to the same values).
    console.warn("[stripe] Idempotency pre-check failed, proceeding:", e.message);
  }

  await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      plan: "paid",
      run_limit: limits.run_limit,
      max_run_limit: limits.max_run_limit,
      run_count: 0,
      rollover_cap: limits.run_limit, // Max rollover = 1 month's allocation
    }),
  });

  console.log(`[stripe] Upgraded org ${orgId} to ${planId}: ${limits.run_limit} runs, ${limits.max_run_limit} max`);
}

// One-time run pack: record the purchase and add the runs in a single
// transaction (apply_run_pack, migration 034). The session-id PK in
// promo_pack_purchases makes Stripe retries a no-op even across instances —
// unlike the subscription path, an increment is not value-idempotent, so the
// in-memory dedup alone is not enough.
async function applyRunPack(orgId, session) {
  if (!orgId) return;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/apply_run_pack`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_session_id: session.id,
        p_org_id: orgId,
        p_runs: PROMO_PACK_RUNS,
        p_amount_cents: session.amount_total ?? null,
      }),
    });
    const outcome = await r.json().catch(() => null);
    console.log(`[stripe] Run pack for org ${orgId}: ${outcome}`);
    if (outcome === "org_not_eligible") {
      // Payment captured but the org is no longer trial/promo — needs a human.
      console.warn(`[stripe] Run pack PAID but not applied for org ${orgId} (session ${session.id}) — resolve manually`);
    }
  } catch (e) {
    console.error("[stripe] Run pack apply failed:", e.message);
  }
}

// Promo monthly plan activation (issue #137).
// Sets the org to plan='promo_monthly' with 20 runs/month and kicks off a Stripe
// Subscription Schedule that automatically graduates to the starter price after
// 2 billing cycles — no cron or manual step needed for the upgrade.
async function applyPromoMonthly(orgId, session) {
  if (!orgId) return;
  const subscriptionId = session.subscription || null;
  const promoEnd = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(); // ~60 days

  try {
    await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        plan: "promo_monthly",
        run_limit: 20,
        max_run_limit: 0,
        run_count: 0,
        rollover_cap: 20,
        stripe_subscription_id: subscriptionId,
        promo_period_end: promoEnd,
      }),
    });
    console.log(`[stripe] Promo monthly activated for org ${orgId}: 20 runs/mo, ends ~${promoEnd}`);
  } catch (e) {
    console.error("[stripe] Promo monthly org update failed:", e.message);
    return; // Do not create schedule if org update failed
  }

  // Attach a Subscription Schedule: 2 iterations at promo price → starter price forever.
  // When Stripe advances to the starter phase, customer.subscription.updated fires with
  // sub.metadata.plan_id='starter' and the existing updateOrg handler graduates the org.
  if (subscriptionId) {
    await attachPromoSchedule(subscriptionId);
  } else {
    console.warn("[stripe] Promo monthly: no subscription ID in session — schedule not created");
  }
}

// Create a Stripe Subscription Schedule that transitions from the promo price to
// the starter price after 2 billing cycles. Phase 2 sets metadata.plan_id='starter'
// on the subscription so the existing customer.subscription.updated webhook handler
// can call updateOrg('starter') without any additional promo-specific logic.
async function attachPromoSchedule(subscriptionId) {
  const PROMO_PRICE = process.env.STRIPE_PRICE_PROMO_MONTHLY;
  const STARTER_PRICE = process.env.STRIPE_PRICE_STARTER;
  if (!PROMO_PRICE || !STARTER_PRICE) {
    console.warn("[stripe] attachPromoSchedule: STRIPE_PRICE_PROMO_MONTHLY or STRIPE_PRICE_STARTER not set — schedule skipped");
    return;
  }

  // Step 1: create a schedule from the existing subscription (current period → phase 1).
  const createParams = new URLSearchParams();
  createParams.append("from_subscription", subscriptionId);
  let schedule;
  try {
    const createRes = await fetch("https://api.stripe.com/v1/subscription_schedules", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: createParams.toString(),
    });
    schedule = await createRes.json();
    if (schedule.error) {
      console.error("[stripe] Schedule create failed:", schedule.error.message);
      return;
    }
  } catch (e) {
    console.error("[stripe] Schedule create network error:", e.message);
    return;
  }

  // Step 2: update the schedule with explicit two-phase definition.
  // Phase 0: promo price, 2 billing cycles total (the current period counts as cycle 1).
  // Phase 1: starter price, indefinite. end_behavior=release keeps the subscription
  // running at the starter price after the schedule completes — no cancellation.
  // Phase 1's metadata overwrites sub.metadata.plan_id to 'starter', which triggers
  // the existing updateOrg('starter') logic in customer.subscription.updated.
  const updateParams = new URLSearchParams();
  updateParams.append("phases[0][items][0][price]", PROMO_PRICE);
  updateParams.append("phases[0][items][0][quantity]", "1");
  updateParams.append("phases[0][iterations]", "2");
  updateParams.append("phases[1][items][0][price]", STARTER_PRICE);
  updateParams.append("phases[1][items][0][quantity]", "1");
  updateParams.append("phases[1][metadata][plan_id]", "starter");
  updateParams.append("end_behavior", "release");

  try {
    const updateRes = await fetch(`https://api.stripe.com/v1/subscription_schedules/${schedule.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: updateParams.toString(),
    });
    const updated = await updateRes.json();
    if (updated.error) {
      console.error("[stripe] Schedule update failed:", updated.error.message, "— org will NOT auto-graduate; resolve manually in Stripe");
    } else {
      console.log(`[stripe] Promo schedule ${schedule.id} created for subscription ${subscriptionId} — graduates to starter after 2 cycles`);
    }
  } catch (e) {
    console.error("[stripe] Schedule update network error:", e.message);
  }
}

async function downgradeOrg(orgId) {
  if (!orgId) return;

  await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      plan: "trial",
      run_limit: 3,
      max_run_limit: 0,
    }),
  });

  console.log(`[stripe] Downgraded org ${orgId} to trial`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers["stripe-signature"];

  if (!verifyStripeSignature(rawBody.toString(), signature)) {
    console.warn("[stripe] Invalid webhook signature");
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Idempotency — skip if already processed (Stripe retries)
        if (processedSessions.has(session.id)) {
          console.log(`[stripe] Duplicate session ${session.id} — skipping`);
          break;
        }
        processedSessions.add(session.id);
        if (processedSessions.size > DEDUP_MAX) {
          const first = processedSessions.values().next().value;
          processedSessions.delete(first);
        }
        // Server-side org_id lookup from user_id — don't trust metadata for org_id
        const userId = session.metadata?.user_id;
        const planId = session.metadata?.plan_id;
        let orgId = null;
        if (userId && SB_URL && SB_KEY) {
          try {
            const r = await fetch(`${SB_URL}/rest/v1/users?id=eq.${userId}&select=org_id`, {
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
            });
            const users = await r.json();
            orgId = users?.[0]?.org_id || null;
          } catch (e) { console.error("[stripe] Org lookup failed:", e.message); }
        }
        console.log(`[stripe] Checkout completed: user=${userId}, org=${orgId}, plan=${planId}`);
        if (planId === "promo_pack") await applyRunPack(orgId, session);
        else if (planId === "promo_monthly") await applyPromoMonthly(orgId, session);
        else await updateOrg(orgId, planId);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const planId = sub.metadata?.plan_id;
        // Server-side org_id lookup — don't trust metadata
        const subUserId = sub.metadata?.user_id;
        let subOrgId = null;
        if (subUserId && SB_URL && SB_KEY) {
          try {
            const r = await fetch(`${SB_URL}/rest/v1/users?id=eq.${subUserId}&select=org_id`, {
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
            });
            const users = await r.json();
            subOrgId = users?.[0]?.org_id || null;
          } catch (e) { console.error("[stripe] Sub update org lookup failed:", e.message); }
        }
        if (sub.status === "active" && subOrgId && planId) {
          console.log(`[stripe] Subscription updated: user=${subUserId}, org=${subOrgId}, plan=${planId}`);
          await updateOrg(subOrgId, planId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        // Server-side org_id lookup — don't trust metadata
        const delUserId = sub.metadata?.user_id;
        let delOrgId = null;
        if (delUserId && SB_URL && SB_KEY) {
          try {
            const r = await fetch(`${SB_URL}/rest/v1/users?id=eq.${delUserId}&select=org_id`, {
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
            });
            const users = await r.json();
            delOrgId = users?.[0]?.org_id || null;
          } catch (e) { console.error("[stripe] Sub delete org lookup failed:", e.message); }
        }
        console.log(`[stripe] Subscription cancelled: user=${delUserId}, org=${delOrgId}`);
        await downgradeOrg(delOrgId);
        break;
      }

      default:
        // Ignore other event types
        break;
    }
  } catch (e) {
    console.error("[stripe] Webhook processing error:", e.message);
    return res.status(500).json({ error: "Processing failed" });
  }

  res.json({ received: true });
}
