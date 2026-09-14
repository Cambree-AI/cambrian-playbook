-- Migration 036: Promo monthly plan — 10 free → $45/mo × 2 months → starter (issue #137)
--
-- Adds the promo_monthly plan value, two columns for Stripe subscription tracking and
-- UI display, and updates process_monthly_rollover so promo_monthly orgs receive the
-- same rollover mechanics as paid orgs.
--
-- Run order: after 035. Additive and IF NOT EXISTS-safe (staging shares prod DB).
-- Stripe setup required before first checkout: create a $45/mo recurring price in the
-- Stripe dashboard and set STRIPE_PRICE_PROMO_MONTHLY in Vercel env vars.

-- ── 1. Extend plan constraint ────────────────────────────────────────────────
-- Add promo_monthly alongside the existing values. DROP+ADD is the only way to
-- alter a CHECK constraint in Postgres (same pattern as migration 034).
ALTER TABLE public.orgs DROP CONSTRAINT IF EXISTS orgs_plan_check;
ALTER TABLE public.orgs ADD CONSTRAINT orgs_plan_check
  CHECK (plan IN ('trial', 'paid', 'suspended', 'promo', 'promo_monthly'));

-- ── 2. New columns ────────────────────────────────────────────────────────────
-- The Stripe subscription ID, stored at checkout completion, is needed to:
-- (a) verify the subscription schedule was attached correctly,
-- (b) surface a "manage subscription" link in the UI (future), and
-- (c) allow manual graduation if the Stripe schedule ever fails.
ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Approximate end of the promo period — stored for UI display (e.g. "Your promo
-- rate ends on Oct 3, 2026"). The actual graduation is driven by Stripe's
-- subscription schedule; this column is informational only and is cleared on
-- graduation via the stripe-webhook handler.
ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS promo_period_end timestamptz;

-- ── 3. Monthly rollover — include promo_monthly alongside paid ───────────────
-- Migration 034 redefined this RPC to process only plan='paid'. Now extend it to
-- also process plan='promo_monthly': same rollover mechanics, same caps.
-- promo orgs (old one-time pack) are intentionally excluded — their run_count is
-- monotonic by design (the pack is a one-time allotment, not a monthly renewal).
CREATE OR REPLACE FUNCTION public.process_monthly_rollover()
RETURNS jsonb AS $$
DECLARE
  v_org record;
  v_count int := 0;
BEGIN
  FOR v_org IN
    SELECT id, run_count, run_limit, rollover_runs, rollover_cap
    FROM public.orgs
    WHERE plan IN ('paid', 'promo_monthly')
    FOR UPDATE
  LOOP
    DECLARE
      v_total_available int := v_org.run_limit + v_org.rollover_runs;
      v_unused int := GREATEST(0, v_total_available - v_org.run_count);
      v_new_rollover int := LEAST(v_unused, v_org.rollover_cap);
    BEGIN
      UPDATE public.orgs
      SET run_count = 0,
          rollover_runs = v_new_rollover,
          updated_at = now()
      WHERE id = v_org.id;
      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'orgs_processed', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
