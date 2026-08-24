-- =============================================================================
-- MANNA RECLAIM - a reason is written by the shift and signed off by the office
--
-- The record already held why a figure missed its ideal. What it did not hold is
-- who agreed with it.
--
-- That matters now because the plant pays an incentive on these figures. A
-- supervisor writing "the belt was slipping all shift" against a miss is not
-- merely explaining it - they are asking for the miss to be discounted, and an
-- explanation that discounts a miss with nobody's name against it is an
-- explanation that settles its own case. So the reason is the shift's to write
-- and the office's to accept.
--
-- Three columns, and the split between them is the point:
--
--   approved_at   when the office accepted it. Null is not "rejected" - it is
--                 "nobody has looked yet", which is the ordinary state of a
--                 reason written twenty minutes ago and a different sentence
--                 from one that has been read and agreed.
--   approved_by   whose name is on that acceptance.
--   manager_note  what the office added, kept apart from `reason` rather than
--                 appended to it. A manager who edits a supervisor's sentence
--                 leaves a record that reads as the supervisor's words and is
--                 not; the two belong to two people and stay in two columns, so
--                 months later it is still clear who said which.
--
-- Nothing is backfilled. Every reason already on the record was written by the
-- back office - it was the only role that could - so approving them to
-- themselves would manufacture a sign-off that never happened. They stay
-- unapproved and honest, and the screen says "not yet approved" rather than
-- pretending.
-- =============================================================================

alter table public.variance_reasons add column if not exists approved_at timestamptz;
alter table public.variance_reasons add column if not exists approved_by text;
alter table public.variance_reasons add column if not exists manager_note text;

comment on column public.variance_reasons.approved_at is
  'When the back office accepted this reason. Null = nobody has looked yet, '
  'which is not the same as rejected. See 0017_variance_reason_approval.sql.';

comment on column public.variance_reasons.manager_note is
  'What the office added alongside the shift''s own words - deliberately a '
  'separate column, so a manager''s sentence is never read back as the '
  'supervisor''s. See 0017_variance_reason_approval.sql.';
