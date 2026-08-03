-- =============================================================================
-- MANNA RECLAIM - what picking was worth, and when
--
-- 0003 put the picking gang on the cracker's run and sent it through the crumb
-- rate into the reclaim. It costed every hour ever picked at whatever the Rates
-- tab said this morning: raise the day wage in March and February got dearer
-- too, retrospectively, on a screen that offered no hint it had happened.
--
-- Two things here fix that and finish the record.
--
--   1. `runs.pickcut_remarks` - why the gang was the size it was. A shift that
--      put eight hands on the yard because a lorry of scrap came in at once is
--      not a shift that over-spent, and the figure alone cannot say so.
--
--   2. `labour_rates` - the day rate with a date on it. A run is costed at the
--      rate in force on the day it was worked, so closed months stay closed.
--
-- The plant does not think in rupees per hour; it thinks in a day's wage. So a
-- row may be entered either way and the per-hour figure is derived from the day
-- wage and the shift it covers when it was not given directly. Whichever way it
-- was entered, `per_hour` is what the costing multiplies by - see
-- rate.service.js labourRateAt().
--
-- Idempotent. Run after 0003; supabase/schema.sql carries the same block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The note behind the gang
--
-- Optional, and deliberately so: the figure is what the costing spends, and a
-- required note is a required lie on the shifts where there is nothing to say.
-- -----------------------------------------------------------------------------
alter table public.runs add column if not exists pickcut_remarks text;


-- -----------------------------------------------------------------------------
-- 2. The labour rate, with the date it came into force
--
-- One row per change, not one row edited in place. `effective_from` is the day
-- it started applying; a run is costed at the newest row that is not after the
-- day the run was worked, so correcting a run in History re-prices it at the
-- rate of its own day rather than at today's.
--
-- `per_hour` is what the costing reads. It may be entered directly, or left to
-- be worked out from `daily_wage` over `shift_hours` - the plant hires by the
-- day, and asking a yard supervisor for a rupees-per-hour figure is asking them
-- to do the division in their head and get it wrong.
--
-- Unique on the date: two rates in force on the same morning is not a state the
-- plant can be in, and an upsert on that conflict is what lets a manager correct
-- a rate they mistyped rather than stacking a second one behind it.
-- -----------------------------------------------------------------------------
create table if not exists public.labour_rates (
  id             text primary key,
  effective_from date not null,
  per_hour       numeric,
  daily_wage     numeric,
  shift_hours    numeric,
  note           text,
  created_at     timestamptz not null default now(),
  created_by     text
);

create unique index if not exists labour_rates_effective_from_key
  on public.labour_rates (effective_from);

-- A rate has to be readable as money one way or the other, and none of the three
-- figures can be negative. `not valid` so a project with a stray row is not
-- blocked from migrating.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'labour_rates_priced') then
    alter table public.labour_rates
      add constraint labour_rates_priced
      check (
        (per_hour is not null and per_hour >= 0)
        or (daily_wage is not null and daily_wage >= 0 and shift_hours is not null and shift_hours > 0)
      )
      not valid;
  end if;
end $$;

alter table public.labour_rates enable row level security;

-- Read by the API's key like every other table here; written only by the
-- service role, which is what the manager-only route holds. A rate is money,
-- and money is not something a browser key gets to change.
drop policy if exists labour_rates_read on public.labour_rates;
create policy labour_rates_read on public.labour_rates
  for select to anon, authenticated using (true);

drop policy if exists labour_rates_service on public.labour_rates;
create policy labour_rates_service on public.labour_rates
  for all to service_role using (true) with check (true);


-- -----------------------------------------------------------------------------
-- 3. Reading picking back with its note
--
-- Replaces the view 0003 created, adding the remark and telling apart the two
-- kinds of blank. A shift that recorded "nobody picked today" is a fact; a shift
-- that was never asked is a hole, and costing the second as though it were the
-- first is how a plant convinces itself picking is free.
-- -----------------------------------------------------------------------------
create or replace view public.picking_activity as
  select
    r.id                                                   as run_id,
    r.shift_date,
    r.shift,
    r.machine_id,
    r.machine,
    r.supervisor,
    r.pickcut_workers                                      as picking_labourers,
    r.pickcut_hours                                        as picking_hours,
    coalesce(r.pickcut_workers, 0) * coalesce(r.pickcut_hours, 0)
                                                           as picking_labour_hours,
    r.pickcut_remarks                                      as picking_remarks,
    -- Recorded at all, whatever it said. False is the hole; a deliberate nought
    -- is `recorded` with no hours against it.
    (r.pickcut_workers is not null or r.pickcut_hours is not null)
                                                           as picking_recorded,
    -- The cracker weighs nothing itself: what it cracks is weighed downstream at
    -- the grinders. The column is here so a shift reads as one line.
    r.weight_kg                                            as crumb_kg
  from public.runs r
  where r.pickcut_workers is not null
     or r.pickcut_hours is not null
     or r.pickcut_remarks is not null;

grant select on public.picking_activity to anon, authenticated, service_role;
