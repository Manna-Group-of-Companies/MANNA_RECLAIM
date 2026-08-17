-- =============================================================================
-- MANNA RECLAIM - what the plant *should* have made, beside what it did
--
-- The Efficiency tab has always measured the plant against itself: every figure
-- carries the median of the same figure across every shift on record. That
-- answers "is this shift worse than usual" and it cannot answer "is usual any
-- good" - a line that has run 15% under its capacity for two years has a median
-- that says so and a screen that never once flags it.
--
-- So the manager gets to say what the figure ought to be. Two tables:
--
--   ideal_values     one row, id 'current', every benchmark inside `data` -
--                    the same shape cost_rates already uses, and for the same
--                    reason: the set of figures grows as the plant measures
--                    more things, and a column per figure would be a migration
--                    every time it does.
--
--   variance_reasons why the actual missed the ideal, against the date, the
--                    shift and the parameter it missed on.
--
-- variance_reasons is deliberately NOT efficiency_notes. That table holds a
-- different sentence - "this shift came in under what this plant normally
-- manages" - and the two would be indistinguishable once mixed: a note against
-- a shift that beat the plant's median and missed the manager's target is not
-- the same note as one against a shift that did neither.
--
-- Idempotent. supabase/schema.sql carries the same block as 6f.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The benchmarks
--
-- One row. `data` is a flat object keyed the way the API names each figure -
-- 'prod.GRD_K', 'runs.AC_A', 'kwhkg.SPECIAL.SuperFine' - and the server drops
-- any key it does not declare, so a stale field left by an older screen cannot
-- become a benchmark nothing compares against. See IDEAL_VALUE_KEYS in
-- server/src/config/constants.js.
--
-- Not one row per parameter: the manager edits the whole sheet at once and
-- saves it once, which is one write either way, and a table of thirty rows
-- would need a key for every figure the plant might later measure.
-- -----------------------------------------------------------------------------
create table if not exists public.ideal_values (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  updated_by text
);

alter table public.ideal_values enable row level security;

-- Read by the API's key like every other table here; written only by the
-- service role, which is what the manager-only route holds. A target the floor
-- could move is a target that gets moved to wherever this shift landed.
drop policy if exists ideal_values_read on public.ideal_values;
create policy ideal_values_read on public.ideal_values
  for select to anon, authenticated using (true);

drop policy if exists ideal_values_service on public.ideal_values;
create policy ideal_values_service on public.ideal_values
  for all to service_role using (true) with check (true);


-- -----------------------------------------------------------------------------
-- 2. Why the actual missed the ideal
--
-- `parameter` is the key the comparison was made under, so a reason is tied to
-- the figure it explains rather than to a card on a screen that may be laid out
-- differently next year. `label` is what that key read as on the day - a target
-- renamed later leaves the old reason still saying what it was about.
--
-- `ideal` and `actual` are snapshots, not lookups. A benchmark raised next month
-- must not silently rewrite what last month's shortfall was measured against;
-- the reason has to still make sense beside the numbers that prompted it.
--
-- Nothing is unique here: a shift may miss the same target twice and be
-- explained twice, and the second reason does not replace the first. They are
-- both what somebody said.
-- -----------------------------------------------------------------------------
create table if not exists public.variance_reasons (
  id         text primary key,
  shift_date date not null,
  shift      text,
  parameter  text not null,
  label      text,
  ideal      numeric,
  actual     numeric,
  reason     text not null,
  entered_by text,
  created_at timestamptz not null default now()
);

create index if not exists variance_reasons_shift_idx
  on public.variance_reasons (shift_date, shift);

alter table public.variance_reasons enable row level security;

drop policy if exists variance_reasons_read on public.variance_reasons;
create policy variance_reasons_read on public.variance_reasons
  for select to anon, authenticated using (true);

drop policy if exists variance_reasons_service on public.variance_reasons;
create policy variance_reasons_service on public.variance_reasons
  for all to service_role using (true) with check (true);
