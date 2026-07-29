-- -----------------------------------------------------------------------------
-- The columns this project is missing, and nothing else.
--
-- supabase/schema.sql is the full file - it also creates `users` and `machines`
-- and sets up the indexes and policies. This is the subset the API is actively
-- tripping over, pulled out so it can be pasted into the SQL editor on its own:
--
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Every statement is idempotent; running it twice changes nothing. Nothing here
-- touches existing data.
-- -----------------------------------------------------------------------------

-- Pause/resume on the shop floor, a note against a run, and the flag that says
-- this machine's output gets weighed later. Without `paused` the pause button
-- cannot hold and the card never shows the paused timer.
alter table public.runs add column if not exists paused      boolean default false;
alter table public.runs add column if not exists paused_at   timestamptz;
alter table public.runs add column if not exists remarks     text;
alter table public.runs add column if not exists needs_weigh boolean default false;

-- The individual weighings behind a run's weight, so the Weigh tab's correction
-- sheet can show what went on the scale. Without it a correction still saves the
-- total; only the barrow-by-barrow breakdown is lost.
alter table public.runs add column if not exists weigh_entries jsonb;

-- Weighbridge loads: without these a dispatch cannot carry its loads at all.
alter table public.dispatch_loads add column if not exists dispatch_id text;
alter table public.dispatch_loads add column if not exists gross_kg    numeric;
alter table public.dispatch_loads add column if not exists tare_kg     numeric;
alter table public.dispatch_loads add column if not exists net_kg      numeric;
alter table public.dispatch_loads add column if not exists bags        integer;

-- A quality test pinned to the run and machine it was drawn from.
alter table public.quality_tests add column if not exists run_id     text;
alter table public.quality_tests add column if not exists machine_id text;

-- Who logged a breakdown and who signed it off.
alter table public.maintenance add column if not exists logged_by   text;
alter table public.maintenance add column if not exists resolved_by text;

-- A free-text note against a temperature reading.
alter table public.bearing_logs add column if not exists notes text;

-- Who last saved the costing inputs on the Rates tab.
alter table public.cost_rates add column if not exists updated_by text;

-- PostgREST caches the table shapes; this makes it pick the new columns up
-- straight away instead of on its next reload.
notify pgrst, 'reload schema';
