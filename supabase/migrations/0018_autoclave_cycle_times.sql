-- =============================================================================
-- MANNA RECLAIM - the three clock times an autoclave cycle turns on
--
-- A charge already records when it went in and when it was discharged, which is
-- the whole cook and tells you nothing about where the time went. Three moments
-- inside it are the ones the plant actually loses time to:
--
--   pressure_at    when the vessel reached 21 bar. Loading to pressure is the
--                  heat-up, and it is the part a cold vessel, wet firewood or a
--                  slow start shows up in. Without it a long cook and a slow
--                  heat-up are the same number.
--
--   door_open_at   when the discharge door was opened.
--   door_close_at  when it was closed again.
--
-- The last two are a pair and the gap between them is the point: that is the
-- vessel standing open while it is emptied and the next charge is put in, and it
-- is dead time on a machine that is only earning while it is shut and hot. The
-- plant has never had a figure for it - the charge before and the charge after
-- are two rows, so the gap between them was invisible in the record even though
-- everybody standing there can see it.
--
-- Timestamps rather than durations, deliberately. A duration is one subtraction
-- away and cannot be checked afterwards; a clock time can be read back against
-- the shift, and a figure the plant is going to be measured on has to be
-- something somebody can point at. Every one is nullable: they are being asked
-- for from today, and a charge logged last month has no answer to give.
-- =============================================================================

alter table public.runs add column if not exists pressure_at timestamptz;
alter table public.runs add column if not exists door_open_at timestamptz;
alter table public.runs add column if not exists door_close_at timestamptz;

comment on column public.runs.pressure_at is
  'When the vessel reached working pressure (21 bar). started_at to here is the '
  'heat-up. See 0018_autoclave_cycle_times.sql.';

comment on column public.runs.door_open_at is
  'When the discharge door was opened. See 0018_autoclave_cycle_times.sql.';

comment on column public.runs.door_close_at is
  'When the discharge door was closed again. door_open_at to here is the vessel '
  'standing open being emptied and re-charged - the plant''s loading time. '
  'See 0018_autoclave_cycle_times.sql.';
