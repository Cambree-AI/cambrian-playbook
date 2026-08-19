-- Migration 034: One-time promo run pack — $45 / 20 runs (issue #2)
--
-- Promo codes flagged grants_run_pack unlock a one-time Stripe purchase
-- (mode=payment, STRIPE_PRICE_PROMO_PACK) that adds runs to the buyer's org.
-- The org moves to plan='promo', a value the monthly cron never refreshes:
-- cron-reset-tokens.js only zeroes run_count for plan='trial', and
-- process_monthly_rollover (redefined below) only cycles plan='paid'. A promo
-- org's run_count is therefore monotonic and the pack is a true one-time
-- allotment, not a monthly renewal.
--
-- Additive and IF NOT EXISTS-safe, same as 033. Seed the offer after applying:
--   INSERT INTO promo_codes (code, grants_run_pack) VALUES ('MWFT26', true)
--   ON CONFLICT (code) DO UPDATE SET grants_run_pack = true;

-- Which promo code admitted this org — stamped at provisioning by
-- api/_provision.js; api/checkout.js verifies pack eligibility against it
-- server-side (price IDs ship in the client bundle, so the discounted price
-- must not be purchasable by guessing).
ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS promo_code text;

-- Audit: the code submitted with the access request, recognized or not.
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS promo_code text;

-- Per-code offer flag — enable/disable the pack offer without a deploy.
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS grants_run_pack boolean NOT NULL DEFAULT false;

-- Allow the new plan value.
ALTER TABLE public.orgs DROP CONSTRAINT IF EXISTS orgs_plan_check;
ALTER TABLE public.orgs ADD CONSTRAINT orgs_plan_check
  CHECK (plan IN ('trial', 'paid', 'suspended', 'promo'));

-- Ledger of applied packs. The PK on the Stripe checkout session id is the
-- idempotency gate for webhook retries (the in-memory dedup in
-- api/stripe-webhook.js is per-instance best-effort only — an increment is
-- not value-idempotent like the subscription path's absolute PATCH).
CREATE TABLE IF NOT EXISTS public.promo_pack_purchases (
  session_id   text PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  runs_added   int NOT NULL,
  amount_cents int,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS on, no policies: service-role only, same as promo_codes.
ALTER TABLE public.promo_pack_purchases ENABLE ROW LEVEL SECURITY;

-- Atomic apply: record the purchase and add the runs in one transaction.
-- Returns 'duplicate' when the session was already applied (Stripe retry) and
-- 'org_not_eligible' when the org left trial/promo between checkout and
-- webhook — payment captured but runs withheld; the webhook logs it for
-- manual resolution.
CREATE OR REPLACE FUNCTION public.apply_run_pack(
  p_session_id text,
  p_org_id uuid,
  p_runs int,
  p_amount_cents int DEFAULT NULL
)
RETURNS text AS $$
BEGIN
  INSERT INTO public.promo_pack_purchases (session_id, org_id, runs_added, amount_cents)
  VALUES (p_session_id, p_org_id, p_runs, p_amount_cents)
  ON CONFLICT (session_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  UPDATE public.orgs
     SET run_limit = run_limit + p_runs,
         plan = 'promo',
         updated_at = now()
   WHERE id = p_org_id
     AND plan IN ('trial', 'promo');
  IF NOT FOUND THEN
    RETURN 'org_not_eligible';
  END IF;

  RETURN 'applied';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.apply_run_pack(text, uuid, int, int) FROM PUBLIC, anon, authenticated;

-- Monthly rollover now cycles paid orgs only (was: plan != 'trial', which
-- would also have refreshed promo and suspended orgs' run_count each month).
CREATE OR REPLACE FUNCTION public.process_monthly_rollover()
RETURNS jsonb AS $$
DECLARE
  v_org record;
  v_count int := 0;
BEGIN
  FOR v_org IN
    SELECT id, run_count, run_limit, rollover_runs, rollover_cap
    FROM public.orgs
    WHERE plan = 'paid'
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
