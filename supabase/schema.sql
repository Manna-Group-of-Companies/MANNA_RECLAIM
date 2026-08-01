-- =============================================================================
-- MANNA RECLAIM - Supabase schema
--
-- Everything the plant records already lives in this project: runs, batches,
-- quality tests, bearing logs, maintenance, rates and the shared plant state
-- all came across from the shop-floor tablets. Two things never did, because
-- the prototype hard-coded them, and a handful of columns the API writes were
-- never created. This script adds exactly those.
--
-- Run it once, in the Supabase SQL editor (Database -> SQL Editor -> New query).
-- It is idempotent: running it twice changes nothing.
--
-- Afterwards, from server/:  npm run seed
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Accounts
--
-- Name + PIN, matching the PIN gate the tablets have always used. `pin_hash`
-- is bcrypt and is never selected by the API except on the login path.
-- Names are unique case-insensitively: "Mathai" and "mathai" are one account.
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  role        text not null default 'supervisor'
                check (role in ('worker', 'supervisor', 'lab', 'manager', 'admin')),
  active      boolean not null default true,
  pin_hash    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists users_name_lower_key on public.users (lower(name));


-- -----------------------------------------------------------------------------
-- 2. The machine list
--
-- Ids are the short codes used across the whole UI (CRK, AC_A, R4), so they
-- are the primary key rather than a surrogate. `out_weight` / `weigh` mark the
-- machines whose output is weighed after the run - that pair is what the Weigh
-- tab lists against.
-- -----------------------------------------------------------------------------
create table if not exists public.machines (
  id             text primary key,
  name           text not null,
  short          text,
  kind           text not null
                   check (kind in ('grind', 'autoclave', 'prerefiner', 'refiner', 'coarse', 'press')),
  group_name     text,
  sub            text,
  accent         text,
  capacity       numeric,
  out_weight     boolean not null default false,
  needs_quality  boolean not null default false,
  weigh          boolean not null default false,
  -- The grinding line runs on a tyre feedstock, picked when the shift starts.
  tyre           boolean not null default false,
  def_tyre       text,
  enabled        boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists machines_sort_order_idx on public.machines (sort_order);
create index if not exists machines_kind_idx on public.machines (kind);

-- The 14 machines from the prototype, and the two moulding presses. `on conflict
-- do nothing` so a later run never overwrites a change the back office made
-- through the admin screen.
insert into public.machines
  (id, name, short, kind, group_name, sub, accent, capacity, out_weight, needs_quality, weigh, tyre, def_tyre, enabled, sort_order)
values
  ('CRK',   'Cracker',        'CRK',     'grind',      'Grinding line', 'shiftwise - tyre prep (mixed)', '#9bb0c4', null,  false, false, false, false, null,    true,  1),
  ('GRD_K', 'Grinder 1',      'Grind 1', 'grind',      'Grinding line', 'shiftwise - 30# default',       '#9bb0c4', null,  true,  false, false, true,  'truck', true,  2),
  ('GRD_S', 'Grinder 2',      'Grind 2', 'grind',      'Grinding line', 'shiftwise - 20# default',       '#9bb0c4', null,  true,  false, false, true,  'bike',  true,  3),
  ('GRD_O', 'Soorya Grinder', 'Soorya',  'grind',      'Grinding line', 'shiftwise',                     '#9bb0c4', null,  true,  false, false, true,  'truck', true,  4),
  ('AC_A',  'Autoclave A',    'AC-A',    'autoclave',  'Autoclaves',    null,                            '#e0762e', 2500,  false, false, false, false, null,    true,  5),
  ('AC_M',  'Autoclave M',    'AC-M',    'autoclave',  'Autoclaves',    null,                            '#e0762e', 2200,  false, false, false, false, null,    true,  6),
  ('AC_N',  'Autoclave N',    'AC-N',    'autoclave',  'Autoclaves',    null,                            '#e0762e', 2200,  false, false, false, false, null,    false, 7),
  ('AC_O',  'Autoclave O',    'AC-O',    'autoclave',  'Autoclaves',    null,                            '#e0762e', 2200,  false, false, false, false, null,    false, 8),
  ('PR2',   'Pre-Refiner 2',  'PR2',     'prerefiner', 'Pre-Refiners',  null,                            '#46c2d6', null,  false, true,  false, false, null,    true,  9),
  ('R1',    'Refiner 1',      'R1',      'refiner',    'Refiners',      'stands in for R3',              '#46c2d6', null,  false, true,  false, false, null,    true,  10),
  ('R3',    'Refiner 3',      'R3',      'refiner',    'Refiners',      null,                            '#46c2d6', null,  false, true,  false, false, null,    true,  11),
  ('R4',    'Refiner 4',      'R4',      'refiner',    'Refiners',      null,                            '#46c2d6', null,  false, true,  true,  false, null,    true,  12),
  ('PR1',   'Pre-Refiner 1',  'PR1',     'coarse',     'Coarse line',   'coarse - shiftwise',            '#e0762e', null,  false, false, false, false, null,    true,  13),
  ('R2',    'Refiner 2',      'R2',      'coarse',     'Coarse line',   'coarse - or Medium grade',      '#e0762e', null,  true,  false, false, false, null,    true,  14),
  -- The moulding presses. Their platen size, daylights and tonnage are still to
  -- be measured, so the sub-line says so rather than stating a figure nobody has
  -- checked. Nothing is weighed off a press by the Weigh tab: the crew weighs
  -- the output at the machine and enters it at stop, so `out_weight` is false.
  ('PRS_P3', 'Press 3',       'P3',      'press',      'Moulding presses', 'platen, daylights, tonnage - to be measured', '#4d9fe8', null, false, false, false, false, null, true, 15),
  ('PRS_P5', 'Press 5',       'P5',      'press',      'Moulding presses', 'platen, daylights, tonnage - to be measured', '#4d9fe8', null, false, false, false, false, null, true, 16)
on conflict (id) do nothing;

-- For a project whose machines table predates the feedstock picker.
alter table if exists public.machines add column if not exists tyre     boolean not null default false;
alter table if exists public.machines add column if not exists def_tyre text;

-- And for one whose `kind` check was written before the presses existed: the
-- constraint is replaced rather than added to, because a check constraint cannot
-- be widened in place.
alter table if exists public.machines drop constraint if exists machines_kind_check;
alter table if exists public.machines add constraint machines_kind_check
  check (kind in ('grind', 'autoclave', 'prerefiner', 'refiner', 'coarse', 'press'));


-- -----------------------------------------------------------------------------
-- 2b. What the presses mould
--
-- A press's curing settings belong to the product, not to the machine: the same
-- press moulds Loop today and Sleve tomorrow, and the floor should never retype
-- a temperature or a cycle time it cannot change anyway. So temperature, cyclic
-- time, cavities and the compound rate live here, and a press run copies them
-- as it starts - which is also what keeps an old run costed at the rate that
-- applied when it was moulded.
--
-- The figures are seeded null on purpose. Nobody has measured them into this
-- system yet, and a placeholder rate would quietly cost every press run wrong;
-- the press sheets say "not set" until the back office fills them in.
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id             text primary key,
  name           text not null,
  -- Held on the platen, in °C. Shown at the run as a fact, never typed.
  cure_temp_c    numeric,
  -- The cure, in minutes. Pre-filled at the run and editable for that run only.
  cyclic_min     numeric,
  -- How many pieces the mould makes per cycle.
  cavities       integer,
  -- What the reclaim compound this product is moulded from costs, per kg.
  compound_rate  numeric,
  note           text,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists products_sort_order_idx on public.products (sort_order);

insert into public.products (id, name, cure_temp_c, cyclic_min, cavities, compound_rate, active, sort_order)
values
  ('LOOP',  'Loop',  null, null, null, null, true, 1),
  ('SLEVE', 'Sleve', null, null, null, null, true, 2)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 3. Columns the API writes that the tablets never created
--
-- Each of these is a field the server records but has had nowhere to put.
-- -----------------------------------------------------------------------------

-- A run can carry a note, and the shop floor can pause one mid-shift.
alter table public.runs add column if not exists remarks     text;
alter table public.runs add column if not exists needs_weigh boolean default false;
alter table public.runs add column if not exists paused      boolean default false;
alter table public.runs add column if not exists paused_at   timestamptz;

-- The special line's rare non-production pass: metered like any other run, but
-- it yields nothing to weigh, so it never reaches the Weigh or Packing tabs.
-- Rows recorded before this column existed read null, and all of those were
-- production - see run.service.js productionOnly().
alter table public.runs add column if not exists non_production boolean default false;

-- Material comes off a machine in more than one barrow, so the Weigh tab banks
-- each weighing and files their sum as the run's weight. The weighings
-- themselves are kept here: a correction can then show what was actually put on
-- the scale rather than only the figure it added up to. Runs weighed before
-- this column existed read null, which is one weighing by another name.
alter table public.runs add column if not exists weigh_entries jsonb;

-- The coarse and grinding lines are run for a shift, not for a batch, so they
-- keep one record per machine per shift date per shift: a machine stopped and
-- restarted inside the shift is folded back into it rather than opening a
-- second row, and `passes` is how many start/stops that record combines.
alter table public.runs add column if not exists passes integer default 1;

-- The batches a special-line pass drew from - the one being refined first, then
-- the tailings of other batches mixed into it. Four columns rather than a list,
-- which is how the tablets kept them.
alter table public.runs add column if not exists src1 text;
alter table public.runs add column if not exists src2 text;
alter table public.runs add column if not exists src3 text;
alter table public.runs add column if not exists src4 text;

-- What a moulding press run recorded. A press has no meters and no run hours to
-- speak of: what it produced is a count of pieces, the weight that came off it
-- and the flash trimmed away, against the product it was set up for. The curing
-- settings are copied off the product as the run starts, so a later change to
-- the product does not rewrite what an old run was moulded at - and `compound_
-- rate` is what its material cost is worked out against for good.
alter table public.runs add column if not exists product       text;
alter table public.runs add column if not exists cavities      integer;
alter table public.runs add column if not exists cyclic_min    numeric;
alter table public.runs add column if not exists cure_temp_c   numeric;
alter table public.runs add column if not exists pieces        integer;
alter table public.runs add column if not exists flash_kg      numeric;
alter table public.runs add column if not exists compound_rate numeric;

-- A quality test can be pinned to the run and machine it was drawn from,
-- not just to the batch number.
alter table public.quality_tests add column if not exists run_id     text;
alter table public.quality_tests add column if not exists machine_id text;

-- The lab's report for a test - a photo of the signed sheet, or a PDF. The file
-- itself lives in the `qc-reports` storage bucket, which has to exist and be
-- public; the row keeps nothing but its URL and the name it was uploaded under.
alter table public.quality_tests add column if not exists attachment_url  text;
alter table public.quality_tests add column if not exists attachment_name text;

-- Who logged a breakdown and who signed it off.
alter table public.maintenance add column if not exists logged_by   text;
alter table public.maintenance add column if not exists resolved_by text;

-- A free-text note against a temperature reading.
alter table public.bearing_logs add column if not exists notes text;

-- Who last saved the costing inputs on the Rates tab.
alter table public.cost_rates add column if not exists updated_by text;

-- Which vehicle a load left on, and whether it was one of ours or a hired /
-- customer one. The vehicle number was collected on the shop floor long before
-- there was a column to keep it in.
alter table public.dispatches add column if not exists vehicle_no  text;
alter table public.dispatches add column if not exists own_vehicle boolean;

-- Weighbridge loads against a dispatch: gross in, tare out, the difference net.
alter table public.dispatch_loads add column if not exists dispatch_id text;
alter table public.dispatch_loads add column if not exists gross_kg    numeric;
alter table public.dispatch_loads add column if not exists tare_kg     numeric;
alter table public.dispatch_loads add column if not exists net_kg      numeric;
alter table public.dispatch_loads add column if not exists bags        integer;

create index if not exists dispatch_loads_dispatch_id_idx
  on public.dispatch_loads (dispatch_id);

-- Where the sacks on a load came from: the packed run they were drawn off and
-- the batch they were made on, plus the line's own note. `run_id` is what lets
-- the packed stock still in the yard be worked out - packed sacks less the ones
-- already dispatched against that run - so a load entered by hand simply leaves
-- it null and draws nothing down.
alter table public.dispatches add column if not exists run_id   text;
alter table public.dispatches add column if not exists batch_no text;
alter table public.dispatches add column if not exists remarks  text;

create index if not exists dispatches_run_id_idx on public.dispatches (run_id);


-- -----------------------------------------------------------------------------
-- 4. Constraints the API's upserts rely on
--
-- PostgREST resolves `on_conflict=customer,grade` against a real unique
-- constraint; without one the rate-card save is rejected.
-- -----------------------------------------------------------------------------
create unique index if not exists customer_rates_customer_grade_key
  on public.customer_rates (customer, grade);


-- -----------------------------------------------------------------------------
-- 5. Indexes for the queries the API actually runs
-- -----------------------------------------------------------------------------
create index if not exists runs_shift_date_shift_idx  on public.runs (shift_date, shift);
-- Every stop on a shiftwise line looks for the record its shift already has.
create index if not exists runs_machine_shift_idx     on public.runs (machine_id, shift_date, shift);
create index if not exists runs_machine_ended_idx     on public.runs (machine_id, ended_at);
create index if not exists runs_batch_no_idx          on public.runs (batch_no);
create index if not exists bearing_logs_ts_idx        on public.bearing_logs (ts desc);
create index if not exists maintenance_down_start_idx on public.maintenance (down_start desc);


-- -----------------------------------------------------------------------------
-- 6. Access
--
-- The API talks to this project with one key and does its own authentication
-- (name + PIN, then a JWT), so the policies below simply let that key through.
-- The two new tables are the only ones this script owns; the rest keep
-- whatever the project already had.
--
-- `users` is the exception: it holds PIN hashes, so it is readable ONLY with
-- the service key. Set SUPABASE_SERVICE_KEY in server/.env before logging in
-- against the real table - the anon key is deliberately not enough.
-- -----------------------------------------------------------------------------
alter table public.users    enable row level security;
alter table public.machines enable row level security;
alter table public.products enable row level security;

drop policy if exists machines_read on public.machines;
create policy machines_read on public.machines
  for select to anon, authenticated using (true);

drop policy if exists machines_write on public.machines;
create policy machines_write on public.machines
  for all to service_role using (true) with check (true);

-- The presses read the product list to start a run; only the back office writes it.
drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select to anon, authenticated using (true);

drop policy if exists products_write on public.products;
create policy products_write on public.products
  for all to service_role using (true) with check (true);

-- No anon policy on users: only the service key reaches it.
drop policy if exists users_service on public.users;
create policy users_service on public.users
  for all to service_role using (true) with check (true);
