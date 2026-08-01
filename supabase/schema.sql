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


-- -----------------------------------------------------------------------------
-- 7. Stock groups, customers and priced dispatches
--
-- The same block as supabase/migrations/0001_stock_and_dispatch.sql, kept here
-- so a project brought up from this one file alone ends in the same place. Both
-- are idempotent, so running one after the other changes nothing.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Stock groups
--
-- What packing files sacks into, and what a dispatch draws them out of.
--
--   kind='batch'  a special-line batch and the grade it yielded. Its label
--                 carries both, because one batch yields several grades and the
--                 label is what the yard reads off the pallet.
--   kind='pool'   coarse. Coarse sacks are not batch-identified - the line runs
--                 for a shift, not for a batch - so they are pooled by the
--                 ten-day period they were packed in: 2026-08-H1, shown AUG-H1.
--
-- `available_sacks` is generated rather than maintained, so it cannot drift from
-- the two counts it is the difference of, and the CHECK is what makes an
-- oversell impossible at the table rather than only in the code above it.
-- -----------------------------------------------------------------------------
create table if not exists public.stock_groups (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('batch', 'pool')),
  label             text not null unique,
  quality           text,
  packed_sacks      integer not null default 0,
  dispatched_sacks  integer not null default 0,
  available_sacks   integer generated always as (packed_sacks - dispatched_sacks) stored,
  qc_status         text not null default 'pending' check (qc_status in ('pass', 'fail', 'pending')),
  -- Only a pool has a period; a batch group leaves both null.
  period_start      date,
  period_end        date,
  created_at        timestamptz not null default now(),
  constraint stock_groups_dispatched_within_packed check (dispatched_sacks <= packed_sacks),
  constraint stock_groups_counts_non_negative check (packed_sacks >= 0 and dispatched_sacks >= 0)
);

create index if not exists stock_groups_kind_idx    on public.stock_groups (kind);
create index if not exists stock_groups_quality_idx on public.stock_groups (quality);


-- -----------------------------------------------------------------------------
-- 2. Customers
--
-- The table already existed, keyed on the name, because the rate card is keyed
-- on the name and nothing else ever pointed at a customer. A dispatch does, and
-- a name is not something to hang a foreign key off - it gets corrected. So a
-- surrogate id is added alongside and the name stays the primary key, which
-- leaves customer_rates and the whole rate card working untouched.
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  name        text primary key,
  region      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.customers add column if not exists id         uuid not null default gen_random_uuid();
alter table public.customers add column if not exists phone      text;
alter table public.customers add column if not exists address    text;
alter table public.customers add column if not exists created_at timestamptz not null default now();

create unique index if not exists customers_id_key on public.customers (id);


-- -----------------------------------------------------------------------------
-- 3. Dispatch header and lines
--
-- The header columns are added to the existing `dispatches` table rather than
-- replacing it: the weighbridge rows the tablets wrote are still the plant's
-- record of what left before this, and the costing report reads them. A row
-- written from here fills the new columns and leaves the old ones null.
--
-- There is deliberately no update path. A dispatch that went out wrong is
-- corrected by a reversal document and a fresh dispatch, so the ledger says
-- what happened rather than what someone last thought had happened.
-- -----------------------------------------------------------------------------
alter table public.dispatches add column if not exists customer_id        uuid;
alter table public.dispatches add column if not exists dispatch_date      date;
alter table public.dispatches add column if not exists transport_provided boolean not null default false;
alter table public.dispatches add column if not exists transport_charge   numeric not null default 0;
alter table public.dispatches add column if not exists created_by         text;

alter table public.dispatches drop constraint if exists dispatches_customer_id_fkey;
alter table public.dispatches add constraint dispatches_customer_id_fkey
  foreign key (customer_id) references public.customers (id);

alter table public.dispatches drop constraint if exists dispatches_created_by_fkey;
alter table public.dispatches add constraint dispatches_created_by_fkey
  foreign key (created_by) references public.users (id);

create index if not exists dispatches_customer_id_idx   on public.dispatches (customer_id);
create index if not exists dispatches_dispatch_date_idx on public.dispatches (dispatch_date desc);

-- `dispatch_id` is text because `dispatches.id` is - the shop-floor tablets name
-- their own rows and always have.
create table if not exists public.dispatch_lines (
  id              uuid primary key default gen_random_uuid(),
  dispatch_id     text not null references public.dispatches (id) on delete cascade,
  stock_group_id  uuid not null references public.stock_groups (id),
  quality         text,
  sacks           integer not null check (sacks > 0),
  unit_price      numeric not null check (unit_price > 0),
  -- Derived, not stored twice: a line total that disagrees with its own sacks
  -- and price is a figure somebody would have to reconcile by hand.
  line_total      numeric generated always as (sacks * unit_price) stored,
  created_at      timestamptz not null default now()
);

create index if not exists dispatch_lines_dispatch_id_idx    on public.dispatch_lines (dispatch_id);
create index if not exists dispatch_lines_stock_group_id_idx on public.dispatch_lines (stock_group_id);


-- -----------------------------------------------------------------------------
-- 4. Products - what is sold, and what it costs to make
--
-- The table was created for what the moulding presses mould, and those columns
-- stay exactly as they were. What is added here is the other half of a product
-- record: the code it is ordered under, the grade and sack size it ships in, the
-- machine it comes off, and the cost inputs behind a unit of it.
-- -----------------------------------------------------------------------------
alter table public.products add column if not exists code              text;
alter table public.products add column if not exists quality           text;
alter table public.products add column if not exists pack_size_kg      numeric;
alter table public.products add column if not exists machine_id        text;
alter table public.products add column if not exists raw_material_cost numeric;
alter table public.products add column if not exists firewood_cost     numeric;
alter table public.products add column if not exists power_kwh         numeric;
alter table public.products add column if not exists labour_cost       numeric;
alter table public.products add column if not exists machine_hours     numeric;

create unique index if not exists products_code_key on public.products (code);

alter table public.products drop constraint if exists products_machine_id_fkey;
alter table public.products add constraint products_machine_id_fkey
  foreign key (machine_id) references public.machines (id);


-- -----------------------------------------------------------------------------
-- 5. Machines - the presses have dimensions
--
-- `kind` is what the whole server switches on (does it weigh, does it need
-- quality, does it log bearings) and is not touched. `type` is the finer name
-- the back office lists a machine under - a cracker and a grinder are both
-- `kind='grind'` to the run rules and two different machines to anyone standing
-- in front of them. The platen columns are null on everything but a press.
-- -----------------------------------------------------------------------------
alter table public.machines add column if not exists type             text;
alter table public.machines add column if not exists platen_length_mm numeric;
alter table public.machines add column if not exists platen_width_mm  numeric;
alter table public.machines add column if not exists platen_count     integer;
alter table public.machines add column if not exists capacity_kg      numeric;

-- Seed `type` from what each machine already is, so the column is useful the
-- moment it exists rather than blank until someone fills it in by hand.
update public.machines
   set type = case
                when id = 'CRK' then 'cracker'
                when kind = 'grind' then 'grinder'
                when kind = 'coarse' then 'refiner'
                else kind
              end
 where type is null;


-- -----------------------------------------------------------------------------
-- 6. Packing files sacks into a stock group
--
-- Called with the *change* in a run's packed count, not its total, so re-packing
-- a run to correct the figure moves the group by the difference instead of
-- counting the sacks twice. A negative delta is how a correction downwards gets
-- there; the table's own CHECK refuses one that would drop packed below what has
-- already gone out.
-- -----------------------------------------------------------------------------
create or replace function public.record_packed_stock(
  p_kind          text,
  p_label         text,
  p_quality       text,
  p_delta         integer,
  p_period_start  date default null,
  p_period_end    date default null,
  p_qc_status     text default null
) returns public.stock_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.stock_groups;
begin
  insert into public.stock_groups (kind, label, quality, packed_sacks, period_start, period_end, qc_status)
  values (
    p_kind, p_label, p_quality, greatest(coalesce(p_delta, 0), 0),
    p_period_start, p_period_end, coalesce(p_qc_status, 'pending')
  )
  on conflict (label) do update
    set packed_sacks = public.stock_groups.packed_sacks + coalesce(p_delta, 0),
        quality      = coalesce(public.stock_groups.quality, excluded.quality),
        -- The lab's verdict is the lab's to change. Packing only ever fills it
        -- in where nothing has been recorded yet.
        qc_status    = case
                         when p_qc_status is null then public.stock_groups.qc_status
                         when public.stock_groups.qc_status = 'pending' then p_qc_status
                         else public.stock_groups.qc_status
                       end
  returning * into v_group;

  return v_group;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7. Posting a dispatch
--
-- Header and lines in one transaction, with the stock draw-down inside it.
--
-- Each group is taken `for update` before it is read, so two vehicles loading
-- the same coarse pool queue behind one another instead of both reading the
-- same availability and both being allowed. The draw-down itself is a
-- conditional UPDATE - it only matches while the sacks are actually there - and
-- touching no row is raised, which rolls the whole document back. Nothing is
-- ever partially dispatched.
--
-- The two raises the API translates carry the offending group's label after a
-- marker, because that is the only part of the message a screen can point at.
-- -----------------------------------------------------------------------------
create or replace function public.post_dispatch(
  p_id                 text,
  p_customer_id        uuid,
  p_dispatch_date      date,
  p_transport_provided boolean,
  p_transport_charge   numeric,
  p_remarks            text,
  p_created_by         text,
  p_lines              jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line       jsonb;
  v_group      public.stock_groups;
  v_sacks      integer;
  v_price      numeric;
  v_touched    integer;
  v_lines      integer := 0;
  v_goods      numeric := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'A dispatch needs at least one line' using errcode = '22023';
  end if;

  insert into public.dispatches (
    id, customer_id, dispatch_date, transport_provided, transport_charge,
    remarks, created_by, dispatched_at
  ) values (
    p_id, p_customer_id, p_dispatch_date,
    coalesce(p_transport_provided, false), coalesce(p_transport_charge, 0),
    p_remarks, p_created_by, p_dispatch_date
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sacks := (v_line ->> 'sacks')::integer;
    v_price := (v_line ->> 'unit_price')::numeric;

    select * into v_group
      from public.stock_groups
     where id = (v_line ->> 'stock_group_id')::uuid
       for update;

    if not found then
      raise exception 'STOCK_MISSING:%', (v_line ->> 'stock_group_id') using errcode = 'P0002';
    end if;

    if v_group.qc_status <> 'pass' then
      raise exception 'STOCK_QC:%', v_group.label using errcode = 'P0001';
    end if;

    if v_price is null or v_price <= 0 then
      raise exception 'STOCK_PRICE:%', v_group.label using errcode = '22023';
    end if;

    if v_sacks is null or v_sacks <= 0 then
      raise exception 'STOCK_SACKS:%', v_group.label using errcode = '22023';
    end if;

    update public.stock_groups
       set dispatched_sacks = dispatched_sacks + v_sacks
     where id = v_group.id
       and packed_sacks - dispatched_sacks >= v_sacks;

    get diagnostics v_touched = row_count;
    if v_touched = 0 then
      raise exception 'STOCK_SHORT:%', v_group.label using errcode = 'P0001';
    end if;

    insert into public.dispatch_lines (dispatch_id, stock_group_id, quality, sacks, unit_price)
    values (p_id, v_group.id, coalesce(v_line ->> 'quality', v_group.quality), v_sacks, v_price);

    v_lines := v_lines + 1;
    v_goods := v_goods + (v_sacks * v_price);
  end loop;

  return jsonb_build_object(
    'id', p_id,
    'lines', v_lines,
    'goods_total', v_goods,
    'transport_charge', coalesce(p_transport_charge, 0),
    'total', v_goods + coalesce(p_transport_charge, 0)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 8. Access
--
-- Who a customer is, what they paid and what left the yard is commercial
-- information, and the browser holds a publishable key. So these three tables
-- are reachable with the service key and with nothing else: RLS on, every grant
-- to anon and authenticated revoked, and one policy naming service_role.
--
-- `stock_groups` is the same story - it carries no price and no customer, but a
-- supervisor reads it through the API's own summary endpoint, never directly.
-- -----------------------------------------------------------------------------
alter table public.customers      enable row level security;
alter table public.dispatches     enable row level security;
alter table public.dispatch_lines enable row level security;
alter table public.stock_groups   enable row level security;

revoke all on public.customers      from anon, authenticated;
revoke all on public.dispatches     from anon, authenticated;
revoke all on public.dispatch_lines from anon, authenticated;
revoke all on public.stock_groups   from anon, authenticated;

drop policy if exists customers_service on public.customers;
create policy customers_service on public.customers
  for all to service_role using (true) with check (true);

drop policy if exists dispatches_service on public.dispatches;
create policy dispatches_service on public.dispatches
  for all to service_role using (true) with check (true);

drop policy if exists dispatch_lines_service on public.dispatch_lines;
create policy dispatch_lines_service on public.dispatch_lines
  for all to service_role using (true) with check (true);

drop policy if exists stock_groups_service on public.stock_groups;
create policy stock_groups_service on public.stock_groups
  for all to service_role using (true) with check (true);

-- The two functions run as their owner so they can write past RLS, which means
-- they must not be callable by a browser key either.
revoke all on function public.record_packed_stock(text, text, text, integer, date, date, text) from public, anon, authenticated;
revoke all on function public.post_dispatch(text, uuid, date, boolean, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_packed_stock(text, text, text, integer, date, date, text) to service_role;
grant execute on function public.post_dispatch(text, uuid, date, boolean, numeric, text, text, jsonb) to service_role;
