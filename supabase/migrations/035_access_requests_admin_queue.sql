-- Migration 035: access_requests admin-queue audit columns (issue #3)
--
-- Completes the coordination contract in migration 033: 033 owns the base
-- table shape plus approved_via/approved_at (promo auto-approve, issue #2);
-- this migration adds the two columns owned by the admin Approve/Dismiss
-- queue. Additive and IF NOT EXISTS-safe, same as 033/034.
--
-- approved_by records which admin actioned the row (superuser email, or
-- 'system:promo'-style markers if automation ever stamps it). It is set on
-- BOTH approve and dismiss — together with approved_at it doubles as the
-- generic "actioned by/at" audit pair, so a dismissal's who/when/why is
-- queryable without a third pair of columns:
--   approve → status='approved',  approved_via='manual', approved_by, approved_at
--   dismiss → status='dismissed', dismissed_reason,      approved_by, approved_at
-- Rows are status-flagged, never deleted, so history remains queryable.

ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS dismissed_reason text;
