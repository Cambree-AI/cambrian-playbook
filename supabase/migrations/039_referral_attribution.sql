-- Migration 039: server-side referral attribution + monthly bonus expiry (issue #154)
--
-- The referral program never attributed a signup in production: the ?ref code
-- lived in the visitor's sessionStorage and the invite-gated funnel crosses an
-- email hop into a fresh tab, stranding it. Attribution now rides the funnel
-- server-side, same pattern as promo codes:
--   request-access form → access_requests.referral_code (audit)
--                       → invitations.referred_by (provisioning)
--                       → users.referred_by (auto-provision trigger, below)
--
-- Also: referral rewards were permanent capacity — increment_referral_bonus
-- (migration 019) raises run_limit and the monthly cron only zeroed the earn
-- counter, so every referral was +1 run forever (and, post-#151, a way for
-- trial orgs to farm free runs indefinitely). expire_referral_bonus() makes
-- the bonus a monthly perk: the cron now removes expiring bonus runs from
-- run_limit when it resets the counter.
--
-- Run order: after 038. Additive; safe to re-run. Existing rows untouched.

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS referred_by text;
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS referral_code text;

-- Same trigger as migration 004/018, plus: carry the invitation's referred_by
-- onto the new user row (never overwriting a value that is somehow already set).
CREATE OR REPLACE FUNCTION public.auto_provision_trial_org()
RETURNS trigger AS $$
DECLARE
  v_inv RECORD;
BEGIN
  -- If org_id already set (e.g., by a different process), do nothing
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check for a pending invitation matching this email
  SELECT id, org_id, role, referred_by INTO v_inv
  FROM public.invitations
  WHERE email = lower(trim(NEW.email))
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_inv.id IS NOT NULL THEN
    -- Invitation found — join that org directly
    NEW.org_id := v_inv.org_id;
    NEW.role := COALESCE(v_inv.role, 'rep');
    IF NEW.referred_by IS NULL THEN
      NEW.referred_by := v_inv.referred_by;
    END IF;

    -- Mark the invitation as accepted so it can't be reused
    UPDATE public.invitations
    SET accepted_at = now()
    WHERE id = v_inv.id;

    RETURN NEW;
  END IF;

  -- No invitation found — leave org_id NULL
  -- User can create an org or get invited later
  NEW.role := 'rep';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Monthly expiry: remove this month's bonus runs from run_limit and zero the
-- earn counter, atomically per org. Called by cron-reset-tokens.js (service
-- role) in place of the old counter-only PATCH. GREATEST guards against a
-- run_limit that was manually lowered below the outstanding bonus.
CREATE OR REPLACE FUNCTION public.expire_referral_bonus()
RETURNS jsonb AS $$
DECLARE
  v_org record;
  v_count int := 0;
BEGIN
  FOR v_org IN
    SELECT id, run_limit, referral_bonus_runs
    FROM public.orgs
    WHERE referral_bonus_runs > 0
    FOR UPDATE
  LOOP
    UPDATE public.orgs
    SET run_limit = GREATEST(run_limit - v_org.referral_bonus_runs, 0),
        referral_bonus_runs = 0,
        updated_at = now()
    WHERE id = v_org.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'orgs_processed', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service-role only — this rewrites run limits.
REVOKE ALL ON FUNCTION public.expire_referral_bonus() FROM PUBLIC, anon, authenticated;
