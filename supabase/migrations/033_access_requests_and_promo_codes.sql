-- Migration 033: Reconcile access_requests + add promo codes (issue #2)
--
-- 1. access_requests was created out-of-band (Supabase dashboard) and had no
--    migration. This captures its live production shape (verified 2026-08-03
--    via PostgREST introspection) so the table is reproducible, and adds the
--    audit columns for the promo auto-approve path.
--    Coordination contract with the admin-queue issue (#3): this migration
--    owns the base shape + approved_via/approved_at; #3 adds
--    approved_by/dismissed_reason. All ALTERs are IF NOT EXISTS-safe because
--    staging shares the production database.
--
-- 2. promo_codes lets newsletter promo codes be rotated/disabled without a
--    deploy. Redemption goes through redeem_promo_code() so the
--    active/max_uses check and the use_count increment are atomic.
--
-- Both tables are touched only by server functions using the service_role
-- key: RLS is enabled with NO policies, so anon/authenticated clients get
-- nothing (same pattern as the data-science tables, migrations 027/030).

-- ═══════════════════════════════════════════════════════════════
-- 1. access_requests — reconcile live shape + audit columns
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.access_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  company    text NOT NULL,
  note       text,
  status     text NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'dismissed' (see issue #3)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 'promo' (auto-approved via promo code) | 'manual' (admin queue, issue #3)
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS approved_via text;
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- The 15-minute idempotency window in api/request-access.js queries by
-- email + created_at on every submission.
CREATE INDEX IF NOT EXISTS idx_access_requests_email_created
  ON public.access_requests (email, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 2. promo_codes
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.promo_codes (
  code       text PRIMARY KEY,
  active     boolean NOT NULL DEFAULT true,
  max_uses   integer,                    -- NULL = unlimited
  use_count  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Seed codes with plain INSERTs from the SQL editor, e.g.:
--   INSERT INTO public.promo_codes (code, max_uses) VALUES ('NEWSLETTER2026', 100);
-- Rotate by setting active = false and inserting a new row — no deploy needed.

-- ═══════════════════════════════════════════════════════════════
-- 3. redeem_promo_code — atomic validate + increment
-- ═══════════════════════════════════════════════════════════════
-- Returns true and consumes one use iff the code exists, is active, and has
-- uses remaining. Single UPDATE so two concurrent redemptions of a code's
-- last use cannot both succeed.

CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
RETURNS boolean AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  UPDATE public.promo_codes
  SET use_count = use_count + 1
  WHERE code = p_code
    AND active
    AND (max_uses IS NULL OR use_count < max_uses)
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service-role only — never redeemable directly from the browser.
REVOKE EXECUTE ON FUNCTION public.redeem_promo_code(text) FROM PUBLIC, anon, authenticated;
