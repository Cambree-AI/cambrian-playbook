-- Migration 037: promo_offer_kind() RPC — which promo offer the caller's org gets (issue #143)
--
-- The pricing modal needs to know whether to render the one-time Run Pack card
-- (issue #2) or the $45/mo promo-monthly card (issue #137). That depends on
-- promo_codes.grants_run_pack, but promo_codes is service-role only (RLS on, no
-- policies), so the client can't read it. This SECURITY DEFINER function exposes
-- exactly one bit for the caller's own org and nothing else — no code text, no
-- use counts, not queryable for arbitrary codes.
--
-- Returns:
--   'run_pack' — org admitted by an active code with grants_run_pack, still on
--                trial or promo (matches the pack eligibility in api/checkout.js)
--   'monthly'  — org admitted by any other active code, still on trial
--                (matches the promo_monthly eligibility in api/checkout.js)
--   NULL       — no promo offer for this org
--
-- Run order: after 036. Additive; safe to re-run.

CREATE OR REPLACE FUNCTION public.promo_offer_kind()
RETURNS text AS $$
  SELECT CASE
    WHEN pc.grants_run_pack AND o.plan IN ('trial', 'promo') THEN 'run_pack'
    WHEN NOT pc.grants_run_pack AND o.plan = 'trial' THEN 'monthly'
    ELSE NULL
  END
  FROM public.users u
  JOIN public.orgs o ON o.id = u.org_id
  JOIN public.promo_codes pc ON pc.code = o.promo_code AND pc.active
  WHERE u.id = auth.uid()::text
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.promo_offer_kind() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promo_offer_kind() TO authenticated;
