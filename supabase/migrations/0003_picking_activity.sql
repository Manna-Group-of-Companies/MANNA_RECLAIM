-- =============================================================================
-- MANNA RECLAIM - picking activity costing
--
-- Picking is the gang that pulls scrap tyres out of the yard by hand and feeds
-- them to the cracker. It is the first labour the plant spends on a kg of
-- reclaim, and until now it was spent nowhere: no field asked for it, so no
-- figure carried it, so a shift that put four extra hands on the yard looked
-- exactly as cheap as one that put none.
--
-- It belongs to the cracker, and through the cracker to the crumb:
--
--   crumb rupees-per-kg = the rubber, at the feedstock's crumb rate
--                       + (grinding-line electricity
--                          + the cracker and grinder crews
--                          + the picking gang)
--                         / the crumb the line weighed
--
--   autoclave charge    = charge kg x crumb rupees-per-kg
--
-- so more labourers on picking, or the same gang there longer, raises the crumb
-- rate, which raises what the autoclave charge cost, which raises the cost of
-- the reclaim. It flows; it is not a bucket anybody has to remember to add.
--
-- This is the opposite of loading (0002), which happens to goods that already
-- exist and therefore can never be part of what they cost to make.
--
-- The two columns are the tablets' own - `pickcut_workers` and `pickcut_hours`,
-- from "pick and cut". They have existed on `runs` since the prototype and were
-- written by nothing and read by nothing. Nothing is renamed here: the server
-- reads them under the names the screens use (see run.service.js decorate()),
-- and a rename would only break whatever old tablet is still syncing.
--
-- Idempotent: everything is `if not exists`. Run it in the Supabase SQL editor
-- after 0002. supabase/schema.sql carries the same block, so a project that
-- runs that file alone ends up in the same place.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The picking gang on a cracker run
--
-- How many hands were put on the yard, and roughly how long they were at it.
-- Approximate by design: the gang is not clocked in, the supervisor says "four
-- of them, about three hours" at the end of the shift, and an approximate
-- figure that gets recorded is worth more than an exact one that does not.
--
-- Only the cracker is asked and only the cracker is believed - the API drops
-- picking sent against any other machine. The grinding line keeps one row per
-- machine per shift, so a cracker stopped for a blockage and started again
-- folds back into the same row: the gang is the most hands it ever had at once,
-- for as long as the starts of it add up to.
-- -----------------------------------------------------------------------------
alter table public.runs add column if not exists pickcut_workers integer;
alter table public.runs add column if not exists pickcut_hours   numeric;

-- Neither can be negative. Written as `not valid` so a project with a stray
-- historic row is not blocked from migrating; validate it once the row is put
-- right. Postgres has no `add constraint if not exists`, so it is guarded.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'runs_pickcut_nonneg'
  ) then
    alter table public.runs
      add constraint runs_pickcut_nonneg
      check (
        (pickcut_workers is null or pickcut_workers >= 0)
        and (pickcut_hours is null or pickcut_hours >= 0)
      )
      not valid;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 2. The rates it is costed at
--
-- Both live in the one `cost_rates` row the Rates tab edits, inside its `data`
-- object, so there is no column to add - this is here to say what the keys are
-- and what they mean, because a rate nobody knows the units of gets filled in
-- wrong once and then trusted for a year.
--
--   pickingLabourPerHour  rupees per labourer per hour. Prices the picking gang
--                         and the crews on the cracker and the grinders alike -
--                         a labourer-hour is a labourer-hour, and one rate
--                         cannot drift away from itself. Falls back to
--                         `loadingLabourPerHour`, which is the same day rate
--                         under the name loading already gave it.
--
--   grinderKwhRate        rupees per kWh on the grinding line. Its own key
--                         because `refinerKwhRate` is the refiners', and the
--                         two lines are metered separately. Falls back to the
--                         refiner rate on a plant that has filled in only one.
--
-- Nothing is snapshotted onto a run. A loading entry freezes its rates because
-- it is the record of a job that was paid for; this is an average over whatever
-- window the back office asked for, re-priced at today's rates on every read -
-- like every other line of the Costing tab. See services/crumb.service.js.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 3. Reading it back
--
-- What the plant spent on picking, per shift, alongside the crumb that shift
-- weighed. The Costing tab works the rupees out itself - it has the rates and
-- the whole window in hand - so this view deliberately stops at the quantities:
-- a view that multiplied by a rate would be a second place for the arithmetic
-- to live, and the two would disagree the first time a rate moved.
-- -----------------------------------------------------------------------------
create or replace view public.picking_activity as
  select
    r.shift_date,
    r.shift,
    r.machine_id,
    r.machine,
    r.supervisor,
    r.pickcut_workers                                      as picking_labourers,
    r.pickcut_hours                                        as picking_hours,
    coalesce(r.pickcut_workers, 0) * coalesce(r.pickcut_hours, 0)
                                                           as picking_labour_hours,
    -- The cracker weighs nothing itself: what it cracks is weighed downstream at
    -- the grinders. The column is here so a shift reads as one line.
    r.weight_kg                                            as crumb_kg
  from public.runs r
  where r.pickcut_workers is not null
     or r.pickcut_hours is not null;

grant select on public.picking_activity to anon, authenticated, service_role;
