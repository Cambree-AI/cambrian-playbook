-- Migration 040: promo-code attempt limiting moves server-side (issue #87)
--
-- api/request-access.js throttles promo-code attempts (5 per 15 minutes per
-- IP) to block code enumeration — "this limit is the real defense", the code
-- comparison itself leaks nothing. On Vercel that lived in a per-instance
-- in-memory Map (best effort). The AWS Lambda port cannot hold cross-request
-- state in memory (issue #87 AC), so attempts are recorded here and checked
-- atomically via check_promo_attempt().
--
-- The table is touched only by server functions using the service_role key:
-- RLS is enabled with NO policies, so anon/authenticated clients get nothing
-- (same pattern as promo_codes, migration 033).

CREATE TABLE IF NOT EXISTS public.promo_code_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip           text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_code_attempts ENABLE ROW LEVEL SECURITY;

-- check_promo_attempt() counts by ip within the sliding window on every call.
CREATE INDEX IF NOT EXISTS idx_promo_attempts_ip_time
  ON public.promo_code_attempts (ip, attempted_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- check_promo_attempt — record + check in one round trip
-- ═══════════════════════════════════════════════════════════════
-- Returns true and records the attempt iff the IP has made fewer than 5
-- attempts in the last 15 minutes; returns false (recording nothing, so a
-- denied burst cannot extend its own lockout) otherwise. Sliding window —
-- marginally stricter than the Vercel Map's fixed 15-minute buckets, same
-- 5-per-15-minutes contract. Also sweeps rows older than a day so the table
-- stays tiny without needing a cron.

CREATE OR REPLACE FUNCTION public.check_promo_attempt(p_ip text)
RETURNS boolean AS $$
DECLARE
  v_recent integer;
BEGIN
  DELETE FROM public.promo_code_attempts
  WHERE attempted_at < now() - interval '1 day';

  SELECT count(*) INTO v_recent
  FROM public.promo_code_attempts
  WHERE ip = p_ip
    AND attempted_at > now() - interval '15 minutes';

  IF v_recent >= 5 THEN
    RETURN false;
  END IF;

  INSERT INTO public.promo_code_attempts (ip) VALUES (p_ip);
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service-role only — never callable directly from the browser.
REVOKE EXECUTE ON FUNCTION public.check_promo_attempt(text) FROM PUBLIC, anon, authenticated;
