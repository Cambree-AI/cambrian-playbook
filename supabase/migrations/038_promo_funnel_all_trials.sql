-- Migration 038: promo funnel for all trials (issue #151)
--
-- The 10-free-runs → $45/mo half-off → Starter funnel becomes the default
-- new-user path, promo code or not:
--   1. New orgs start with 10 free runs (was 3, migration 010).
--   2. promo_offer_kind() no longer requires an admitting promo code for the
--      'monthly' offer — any trial org qualifies. Run-pack codes still map
--      to 'run_pack'.
-- Existing org rows are untouched. Run order: after 037. Safe to re-run.

ALTER TABLE public.orgs ALTER COLUMN run_limit SET DEFAULT 10;

CREATE OR REPLACE FUNCTION public.promo_offer_kind()
RETURNS text AS $$
  SELECT CASE
    WHEN pc.grants_run_pack AND o.plan IN ('trial', 'promo') THEN 'run_pack'
    WHEN o.plan = 'trial' THEN 'monthly'
    ELSE NULL
  END
  FROM public.users u
  JOIN public.orgs o ON o.id = u.org_id
  LEFT JOIN public.promo_codes pc ON pc.code = o.promo_code AND pc.active
  WHERE u.id = auth.uid()::text
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.promo_offer_kind() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promo_offer_kind() TO authenticated;
