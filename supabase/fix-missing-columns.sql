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
-- total; only the barrow-by-barrow breakdown is lost. It is also where the
-- coarse and grinding lines bank each load as it comes off a running machine.
alter table public.runs add column if not exists weigh_entries jsonb;

-- The shiftwise lines keep one record per machine per shift, so a machine
-- stopped and restarted inside the shift folds back into it: `passes` is how
-- many start/stops that record combines. The tablets wrote this column, so it
-- is normally already there.
alter table public.runs add column if not exists passes integer default 1;

-- The batches a special-line pass drew from - the one being refined, then the
-- tailings of others mixed into it. Four columns rather than a list, which is
-- how the tablets kept them.
alter table public.runs add column if not exists src1 text;
alter table public.runs add column if not exists src2 text;
alter table public.runs add column if not exists src3 text;
alter table public.runs add column if not exists src4 text;

-- Every stop on the coarse or grinding line looks for the record its shift
-- already has, so that lookup gets an index of its own.
create index if not exists runs_machine_shift_idx
  on public.runs (machine_id, shift_date, shift);

-- What a moulding press records: the product it was set up for, the curing
-- settings copied off that product as it started, and what came out - pieces,
-- weighed output (weight_kg, already there) and the flash trimmed off. A press
-- has no meters, so none of the meter columns apply to it.
alter table public.runs add column if not exists product       text;
alter table public.runs add column if not exists cavities      integer;
alter table public.runs add column if not exists cyclic_min    numeric;
alter table public.runs add column if not exists cure_temp_c   numeric;
alter table public.runs add column if not exists pieces        integer;
alter table public.runs add column if not exists flash_kg      numeric;
alter table public.runs add column if not exists compound_rate numeric;

-- The presses themselves, and what they mould. `kind` had no 'press' in it, so
-- the check constraint has to be replaced before a press row will insert - a
-- check cannot be widened in place. Products are seeded with their figures null:
-- nobody has measured them into this system, and a made-up compound rate would
-- cost every press run wrong. The press sheets say "not set" until they are
-- filled in from the back office's Products screen.
alter table if exists public.machines drop constraint if exists machines_kind_check;
alter table if exists public.machines add constraint machines_kind_check
  check (kind in ('grind', 'autoclave', 'prerefiner', 'refiner', 'coarse', 'press'));

create table if not exists public.products (
  id             text primary key,
  name           text not null,
  cure_temp_c    numeric,
  cyclic_min     numeric,
  cavities       integer,
  compound_rate  numeric,
  note           text,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Sleve was seeded as "Slive" the first time this file was run. The rename comes
-- before the insert below, so a project that already has it keeps the one row -
-- with whatever settings were entered against it - rather than gaining a second.
-- A press run keeps the product's name on the row, so those are renamed with it.
update public.products set id = 'SLEVE', name = 'Sleve' where id = 'SLIVE';
update public.runs     set product = 'Sleve' where product = 'Slive';

insert into public.products (id, name, active, sort_order)
values ('LOOP', 'Loop', true, 1), ('SLEVE', 'Sleve', true, 2)
on conflict (id) do nothing;

insert into public.machines
  (id, name, short, kind, group_name, sub, accent, out_weight, needs_quality, weigh, tyre, enabled, sort_order)
values
  ('PRS_P3', 'Press 3', 'P3', 'press', 'Moulding presses', 'platen, daylights, tonnage - to be measured', '#4d9fe8', false, false, false, false, true, 15),
  ('PRS_P5', 'Press 5', 'P5', 'press', 'Moulding presses', 'platen, daylights, tonnage - to be measured', '#4d9fe8', false, false, false, false, true, 16)
on conflict (id) do nothing;

alter table public.products enable row level security;

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select to anon, authenticated using (true);

drop policy if exists products_write on public.products;
create policy products_write on public.products
  for all to service_role using (true) with check (true);

-- Weighbridge loads: without these a dispatch cannot carry its loads at all.
alter table public.dispatch_loads add column if not exists dispatch_id text;
alter table public.dispatch_loads add column if not exists gross_kg    numeric;
alter table public.dispatch_loads add column if not exists tare_kg     numeric;
alter table public.dispatch_loads add column if not exists net_kg      numeric;
alter table public.dispatch_loads add column if not exists bags        integer;

-- Where the sacks on a dispatch came from: the packed run they were drawn off
-- and the batch they were made on, plus the line's note. Without `run_id` the
-- Dispatch tab cannot tell which packed sacks have already gone out, so the
-- packed stock it offers never draws down.
alter table public.dispatches add column if not exists run_id   text;
alter table public.dispatches add column if not exists batch_no text;
alter table public.dispatches add column if not exists remarks  text;

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

-- The lab bench signs in as its own role: Quality is the only tab it gets, and
-- the only one anybody else does not. Without this the check constraint written
-- by the original schema.sql rejects a lab account outright.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('worker', 'supervisor', 'lab', 'manager', 'admin'));

-- PostgREST caches the table shapes; this makes it pick the new columns up
-- straight away instead of on its next reload.
notify pgrst, 'reload schema';
