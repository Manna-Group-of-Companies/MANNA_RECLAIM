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
--
-- It has to stay the *whole* subset, which is the lesson of the moulded-stock
-- half at the bottom. This file used to carry three of 0005's columns - the ones
-- on `products` - and none of the rest, so a project repaired with it got a
-- press that could be set up and boxed and a yard that never received a piece:
-- `runs.packed_pieces` was not here to hold the count, and record_packed_stock()
-- was still the seven-argument version that cannot file a moulded group. Both
-- failures are caught and logged rather than raised at the crew, so the tablet
-- said "boxed into stock" over a yard holding nothing. Half a migration is worse
-- than none, because none is visible.
-- -----------------------------------------------------------------------------

-- Pause/resume on the shop floor, a note against a run, and the flag that says
-- this machine's output gets weighed later. Without `paused` the pause button
-- cannot hold and the card never shows the paused timer.
alter table public.runs add column if not exists paused      boolean default false;
alter table public.runs add column if not exists paused_at   timestamptz;
-- Every pause before the one it is in, added up. Without it a resumed run
-- counts the break it just took as time it ran.
alter table public.runs add column if not exists paused_ms   bigint default 0;
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

-- How many of those pieces have been boxed and filed as stock - the mirror of
-- `packed_sacks` on a bagged run. Without it the boxing bench has nowhere to put
-- its count: the write is dropped, the run keeps showing as unboxed, and the
-- next boxing sends the whole count to the yard again instead of the change.
alter table public.runs add column if not exists packed_pieces integer;

-- The presses themselves, and what they mould. `kind` had no 'press' in it, so
-- the check constraint has to be replaced before a press row will insert - a
-- check cannot be widened in place. Products are seeded with their figures null:
-- nobody has measured them into this system, and a made-up compound rate would
-- cost every press run wrong. The press sheets say "not set" until they are
-- filled in from the back office's Products screen.
alter table if exists public.machines drop constraint if exists machines_kind_check;
alter table if exists public.machines add constraint machines_kind_check
  check (kind in ('grind', 'autoclave', 'prerefiner', 'refiner', 'coarse', 'press',
                  'sleeve', 'loop'));

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

-- How a moulded product is boxed, and what one piece weighs - see
-- migrations/0005. The yard keys what a press made on the product and this pack,
-- so a project repaired by this file gets the columns the Stock page reads.
-- Both are left null: an unset pack boxes as loose pieces and says so on screen,
-- which is a thing the back office can go and fix, and a piece weight nobody has
-- measured reports no weight rather than a fabricated one.
alter table public.products add column if not exists pack_size  integer;
alter table public.products add column if not exists pack_label text;
alter table public.products add column if not exists piece_kg   numeric;

-- ---------------------------------------------------------------------------
-- Sleeve and loop - see migrations/0006.
--
-- Everything the two activities need, because half of it is worse than none: a
-- project repaired without these would show the two cards, refuse every run for
-- want of a code on the product, and - if a run did get through - drop its
-- expected count and its labour rate on the way in and file its pieces into a
-- `lot` group the kind CHECK would reject.
-- ---------------------------------------------------------------------------

-- Whether the item is moulded at all, and the code a lot's batch number is
-- built from. `code` is filled in only where it is null: one the back office has
-- already set is theirs, and renumbering under them is how a batch number stops
-- meaning anything.
alter table public.products add column if not exists moulded boolean not null default true;
alter table public.products add column if not exists code    text;

update public.products set code = 'SLEEVE' where id = 'SLEVE' and code is null;
update public.products set code = 'LOOP'   where id = 'LOOP'  and code is null;

-- What the cycle and the mould said the run should have made, kept beside what
-- was counted; and the labour rate of the day it was worked, snapshotted so a
-- raise next month prices next month.
alter table public.runs add column if not exists pieces_expected integer;
alter table public.runs add column if not exists labour_rate     numeric;

-- One lot per product per shift. The second start of a shift folds into the
-- record it already has; this is the guarantee behind that. Closed runs only -
-- a run in progress has not claimed its lot yet, and refusing the second start
-- outright would pre-empt the merge that resolves it.
create unique index if not exists runs_moulding_lot_key
  on public.runs (product, shift_date, shift)
  where kind in ('sleeve', 'loop') and ended_at is not null;

-- The fourth kind of stock group: a sleeve or loop shift, keyed on its own batch
-- number, counted in pieces and certified per lot.
alter table public.stock_groups drop constraint if exists stock_groups_kind_check;
alter table public.stock_groups
  add constraint stock_groups_kind_check check (kind in ('batch', 'pool', 'product', 'lot'));

insert into public.machines
  (id, name, short, kind, group_name, sub, accent, out_weight, needs_quality, weigh, tyre, enabled, sort_order)
values
  ('PRS_P3', 'Press 3', 'P3', 'press', 'Moulding presses', 'platen, daylights, tonnage - to be measured', '#4d9fe8', false, false, false, false, true, 15),
  ('PRS_P5', 'Press 5', 'P5', 'press', 'Moulding presses', 'platen, daylights, tonnage - to be measured', '#4d9fe8', false, false, false, false, true, 16),
  -- Sleeve and loop: their own cards and their own kinds, because what they make
  -- is certified a shift at a time rather than pooled by product like a press's.
  ('SLEEVE', 'Sleeve', 'Sleeve', 'sleeve', 'Sleeve & Loop', 'batch per shift - pieces, flash and crew at stop', '#7ec9a0', false, false, false, false, false, 17),
  ('LOOP',   'Loop',   'Loop',   'loop',   'Sleeve & Loop', 'batch per shift - pieces, flash and crew at stop', '#c99ade', false, false, false, false, false, 18)
on conflict (id) do nothing;

-- ...and off the floor on a database that already has them, which the insert
-- above will not touch. See migrations/0008.
update public.machines set enabled = false where id in ('SLEEVE', 'LOOP');

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

-- What it cost to load a truck. A whole table rather than a column, so it is
-- here in full: the API verifies it at boot and a project without it reports
-- the loading half of every dispatch as missing.
--
-- This is the table only. post_dispatch() has to be replaced as well, to take
-- the loading entry inside the same transaction as the document - that part is
-- in supabase/migrations/0002_loading_activity.sql, and running that file
-- covers both. Until it is run, dispatches post as before and record no
-- loading, which the dispatch list flags rather than hides.
create table if not exists public.loading_activities (
  id                    uuid primary key default gen_random_uuid(),
  dispatch_id           text not null references public.dispatches (id) on delete cascade,
  loading_mode          text not null check (loading_mode in ('contract', 'manhour', 'mixed')),
  material_kind         text not null default 'reclaim' check (material_kind in ('reclaim', 'moulded')),
  kg_loaded             numeric not null default 0 check (kg_loaded >= 0),
  contract_rate_per_kg  numeric not null default 0 check (contract_rate_per_kg >= 0),
  manhour_labourers     integer not null default 0 check (manhour_labourers >= 0),
  manhour_hours         numeric not null default 0 check (manhour_hours >= 0),
  daily_labour_rate     numeric not null default 0 check (daily_labour_rate >= 0),
  contract_cost         numeric generated always as (kg_loaded * contract_rate_per_kg) stored,
  manhour_cost          numeric generated always as (manhour_labourers * manhour_hours * daily_labour_rate) stored,
  loading_cost          numeric generated always as (
                          (kg_loaded * contract_rate_per_kg)
                          + (manhour_labourers * manhour_hours * daily_labour_rate)
                        ) stored,
  vehicle_no            text,
  remarks               text,
  created_by            text,
  created_at            timestamptz not null default now(),
  -- Day labour is accounted wherever it worked, contract loads included, so a
  -- row claiming both `contract` and labourers is refused at the table.
  constraint loading_activities_contract_has_no_daily_labour
    check (loading_mode <> 'contract' or manhour_labourers = 0),
  constraint loading_activities_manhour_has_labour
    check (loading_mode <> 'manhour' or manhour_labourers > 0),
  constraint loading_activities_mixed_has_both
    check (loading_mode <> 'mixed' or (manhour_labourers > 0 and kg_loaded > 0)),
  -- Moulded goods have no per-kg contract, so man-hours are the only method.
  constraint loading_activities_moulded_is_manhour
    check (material_kind <> 'moulded' or loading_mode = 'manhour')
);

create unique index if not exists loading_activities_dispatch_id_key
  on public.loading_activities (dispatch_id);

alter table public.loading_activities enable row level security;
revoke all on public.loading_activities from anon, authenticated;
drop policy if exists loading_activities_service on public.loading_activities;
create policy loading_activities_service on public.loading_activities
  for all to service_role using (true) with check (true);

-- Release the coarse pools that were stranded at `pending`.
--
-- Nothing in the app could ever pass one: the lab tests a batch and a grade,
-- and coarse has neither, so a pool never reached the Quality tab and no screen
-- called PATCH /stock/:id/qc - while post_dispatch() refuses anything that is
-- not `pass`. Every coarse sack ever packed was unsellable through the app.
-- Coarse is now released as it is packed; this is the same release applied once
-- to the pools that predate it. A pool deliberately held stays held, and no
-- batch group is touched.
update public.stock_groups
   set qc_status = 'pass'
 where kind = 'pool'
   and qc_status = 'pending';

-- -----------------------------------------------------------------------------
-- Moulded stock - the rest of migrations/0005
--
-- The `products` columns above are one third of that migration. These are the
-- other two thirds, and without them a press cannot reach the yard at all:
--
--   product   a third kind of stock group, beside `batch` and `pool`. What a
--             press moulded, keyed on the product and the pack it is boxed in -
--             LOOP-50 is loops, fifty to a pack. The kind CHECK has to be
--             replaced before such a row will insert; a check cannot be widened
--             in place.
--   unit      what the counts count. `packed_sacks`, `dispatched_sacks` and
--             `available_sacks` keep their names and become counts in whatever
--             `unit` says - they are referenced by post_dispatch(), by the CHECK
--             that makes an oversell impossible and by every read in the server,
--             so a rename would be a large diff whose only product is a better
--             word. `unit` is what stands between "200 pieces" and a screen
--             reading two hundred sacks.
--   kg_per_unit  what one of them weighs - fifty for a sack, the product's
--             `piece_kg` for a piece. Weight is derived from it rather than
--             stored, so a row's weight can never disagree with its own count.
--
-- Existing rows are all sacks at fifty kilos, because that is all there was a
-- way to file. Backfilled before the NOT NULLs go on, so nothing is refused.
-- -----------------------------------------------------------------------------
alter table public.stock_groups add column if not exists unit            text;
alter table public.stock_groups add column if not exists product_id      text;
alter table public.stock_groups add column if not exists pack_size       integer;
alter table public.stock_groups add column if not exists kg_per_unit     numeric;
alter table public.stock_groups add column if not exists first_packed_on date;
alter table public.stock_groups add column if not exists last_packed_on  date;

-- Who released the stock and when, and whether it came from the bench or from
-- the back office overriding it. The lab's test row keeps its tester, but the
-- stock group is what post_dispatch() reads, and a status set by hand through
-- PATCH /stock/:id/qc used to leave no record of anything at all.
alter table public.stock_groups add column if not exists qc_by     text;
alter table public.stock_groups add column if not exists qc_at     timestamptz;
alter table public.stock_groups add column if not exists qc_source text;

update public.stock_groups set unit        = 'sacks' where unit is null;
update public.stock_groups set kg_per_unit = 50      where kg_per_unit is null;
update public.stock_groups
   set first_packed_on = created_at::date
 where first_packed_on is null;
update public.stock_groups
   set last_packed_on = greatest(created_at::date, coalesce(period_end, created_at::date))
 where last_packed_on is null;

alter table public.stock_groups alter column unit        set default 'sacks';
alter table public.stock_groups alter column kg_per_unit set default 50;
alter table public.stock_groups alter column unit        set not null;
alter table public.stock_groups alter column kg_per_unit set not null;

alter table public.stock_groups drop constraint if exists stock_groups_kind_check;
alter table public.stock_groups
  add constraint stock_groups_kind_check check (kind in ('batch', 'pool', 'product'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_groups_unit_check') then
    alter table public.stock_groups
      add constraint stock_groups_unit_check check (unit in ('sacks', 'pieces'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_groups_kg_per_unit_non_negative') then
    alter table public.stock_groups
      add constraint stock_groups_kg_per_unit_non_negative check (kg_per_unit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_groups_pack_size_positive') then
    alter table public.stock_groups
      add constraint stock_groups_pack_size_positive
      check (pack_size is null or pack_size > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_groups_qc_source_check') then
    alter table public.stock_groups
      add constraint stock_groups_qc_source_check
      check (qc_source is null or qc_source in ('lab', 'manual'));
  end if;
end $$;

alter table public.stock_groups drop constraint if exists stock_groups_product_id_fkey;
alter table public.stock_groups add constraint stock_groups_product_id_fkey
  foreign key (product_id) references public.products (id);

alter table public.stock_groups drop constraint if exists stock_groups_qc_by_fkey;
alter table public.stock_groups add constraint stock_groups_qc_by_fkey
  foreign key (qc_by) references public.users (id);

create index if not exists stock_groups_product_id_idx on public.stock_groups (product_id);

-- What the number on a dispatch line counts. `sacks` keeps its name and becomes
-- the quantity in the group's unit - `line_total` is generated from it, so a
-- second quantity column would have to be kept in step with the one the money
-- comes from. The unit is copied off the group by post_dispatch() and never
-- taken from the request: a client that could name its own unit could buy pieces
-- at a sack price.
alter table public.dispatch_lines add column if not exists unit text;

update public.dispatch_lines set unit = 'sacks' where unit is null;

alter table public.dispatch_lines alter column unit set default 'sacks';
alter table public.dispatch_lines alter column unit set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dispatch_lines_unit_check') then
    alter table public.dispatch_lines
      add constraint dispatch_lines_unit_check check (unit in ('sacks', 'pieces'));
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Packing files stock, whatever it is counted in
--
-- Called with the *change* in a run's packed figure, never the total, so a
-- figure corrected next morning moves the group by the difference instead of
-- filing the same output twice. What the thirteen-argument version adds is
-- everything a row now has to carry: the unit, the product and pack a moulded
-- group is keyed on, what one of them weighs, the day they were packed, and who
-- the verdict came from when packing already knows it.
--
-- The packing dates come from `p_packed_on` rather than from now(), because the
-- Packing tab is also where yesterday's figure gets corrected and the correction
-- must not move the group's dates to today. `first_packed_on` only ever moves
-- earlier and `last_packed_on` only ever moves later, so a group packed across
-- three days reads as the span it was.
-- -----------------------------------------------------------------------------
create or replace function public.record_packed_stock(
  p_kind          text,
  p_label         text,
  p_quality       text,
  p_delta         integer,
  p_period_start  date    default null,
  p_period_end    date    default null,
  p_qc_status     text    default null,
  p_unit          text    default 'sacks',
  p_product_id    text    default null,
  p_pack_size     integer default null,
  p_kg_per_unit   numeric default null,
  p_packed_on     date    default null,
  p_qc_by         text    default null
) returns public.stock_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.stock_groups;
  v_unit  text := coalesce(nullif(p_unit, ''), 'sacks');
  v_kg    numeric := coalesce(p_kg_per_unit, case when v_unit = 'sacks' then 50 else 0 end);
  v_day   date := coalesce(p_packed_on, current_date);
begin
  insert into public.stock_groups (
    kind, label, quality, packed_sacks, period_start, period_end, qc_status,
    unit, product_id, pack_size, kg_per_unit, first_packed_on, last_packed_on,
    qc_by, qc_at, qc_source
  )
  values (
    p_kind, p_label, p_quality, greatest(coalesce(p_delta, 0), 0),
    p_period_start, p_period_end, coalesce(p_qc_status, 'pending'),
    v_unit, p_product_id, p_pack_size, v_kg, v_day, v_day,
    case when p_qc_status is null then null else p_qc_by end,
    case when p_qc_status is null then null else now() end,
    case when p_qc_status is null then null else 'lab' end
  )
  on conflict (label) do update
    set packed_sacks = stock_groups.packed_sacks + coalesce(p_delta, 0),
        quality      = coalesce(stock_groups.quality, excluded.quality),
        -- The identity of the group, filled in where it was never set. A row
        -- created before 0005 has no product and no pack against it; packing
        -- into it again is what supplies them.
        product_id   = coalesce(stock_groups.product_id, excluded.product_id),
        pack_size    = coalesce(stock_groups.pack_size, excluded.pack_size),
        kg_per_unit  = case
                         when excluded.kg_per_unit > 0 then excluded.kg_per_unit
                         else stock_groups.kg_per_unit
                       end,
        first_packed_on = least(coalesce(stock_groups.first_packed_on, v_day), v_day),
        last_packed_on  = greatest(coalesce(stock_groups.last_packed_on, v_day), v_day),
        -- The lab's verdict is the lab's to change. Packing only ever fills it
        -- in where nothing has been recorded yet.
        qc_status    = case
                         when p_qc_status is null then stock_groups.qc_status
                         when stock_groups.qc_status = 'pending' then p_qc_status
                         else stock_groups.qc_status
                       end,
        qc_by        = case
                         when p_qc_status is null then stock_groups.qc_by
                         when stock_groups.qc_status = 'pending' then p_qc_by
                         else stock_groups.qc_by
                       end,
        qc_at        = case
                         when p_qc_status is null then stock_groups.qc_at
                         when stock_groups.qc_status = 'pending' then now()
                         else stock_groups.qc_at
                       end,
        qc_source    = case
                         when p_qc_status is null then stock_groups.qc_source
                         when stock_groups.qc_status = 'pending' then 'lab'
                         else stock_groups.qc_source
                       end
  returning * into v_group;

  return v_group;
end;
$$;

-- The seven-argument version would otherwise stay callable beside this one, and
-- PostgREST would route a body without the new keys to it - stock filed with no
-- unit, no weight and no dates, silently.
drop function if exists public.record_packed_stock(text, text, text, integer, date, date, text);

revoke all on function public.record_packed_stock(
  text, text, text, integer, date, date, text, text, text, integer, numeric, date, text
) from public, anon, authenticated;
grant execute on function public.record_packed_stock(
  text, text, text, integer, date, date, text, text, text, integer, numeric, date, text
) to service_role;


-- -----------------------------------------------------------------------------
-- Posting a dispatch, in the group's own unit
--
-- Replaced here as well, and it has to be: the loading entry above is written by
-- this function, inside the same transaction as the document, because a dispatch
-- that went out with no record of what it cost to load is the gap the table is
-- there to close. The older versions know nothing about either the loading job
-- or the unit.
--
-- The refusals are unchanged and are the point of it: a group that is not `pass`
-- cannot leave the yard however the request was made, and the conditional UPDATE
-- is what makes two vehicles loading the same pool queue rather than both
-- reading the same availability. What is added is one line - the unit is copied
-- off the group onto the dispatch line - and one refusal, STOCK_UNIT, for a
-- request whose unit does not match the stock it names. That is a client that
-- has gone stale about what it is selling, and pricing pieces at a sack rate is
-- exactly the mistake worth refusing rather than absorbing.
-- -----------------------------------------------------------------------------
create or replace function public.post_dispatch(
  p_id                 text,
  p_customer_id        uuid,
  p_dispatch_date      date,
  p_transport_provided boolean,
  p_transport_charge   numeric,
  p_remarks            text,
  p_created_by         text,
  p_lines              jsonb,
  p_loading            jsonb default null
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
  v_unit       text;
  v_touched    integer;
  v_lines      integer := 0;
  v_goods      numeric := 0;
  v_kg         numeric := 0;
  v_mode       text;
  v_material   text;
  v_labourers  integer;
  v_hours      numeric;
  v_load_kg    numeric;
  v_loading    numeric := 0;
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

  -- Sorted, so two dispatches that share groups always take their locks in
  -- the same order. Unsorted, one could hold A and want B while the other
  -- holds B and wants A - a deadlock, which Postgres would break by aborting
  -- one of them with an error that says nothing about stock.
  for v_line in
    select t.value from jsonb_array_elements(p_lines) as t(value)
     order by (t.value ->> 'stock_group_id')
  loop
    v_sacks := (v_line ->> 'sacks')::integer;
    v_price := (v_line ->> 'unit_price')::numeric;
    v_unit  := v_line ->> 'unit';

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

    -- Advisory on the way in and authoritative on the way out: the line is
    -- written with the group's unit whatever the request said, and a request
    -- that said something else is refused rather than quietly corrected.
    if v_unit is not null and v_unit <> v_group.unit then
      raise exception 'STOCK_UNIT:%', v_group.label using errcode = 'P0001';
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

    insert into public.dispatch_lines (dispatch_id, stock_group_id, quality, sacks, unit, unit_price)
    values (
      p_id, v_group.id, coalesce(v_line ->> 'quality', v_group.quality),
      v_sacks, v_group.unit, v_price
    );

    v_lines := v_lines + 1;
    v_goods := v_goods + (v_sacks * v_price);
    -- What the document weighs, from the group's own per-unit weight. This is
    -- what the loading job is costed on when the form did not send a weighbridge
    -- figure, and it is the only way a moulded load has a kg at all.
    v_kg    := v_kg + (v_sacks * coalesce(v_group.kg_per_unit, 0));
  end loop;

  -- -- the loading job --------------------------------------------------------
  if p_loading is not null and p_loading <> 'null'::jsonb then
    v_material  := coalesce(p_loading ->> 'material_kind', 'reclaim');
    v_labourers := coalesce((p_loading ->> 'manhour_labourers')::integer, 0);
    v_hours     := coalesce((p_loading ->> 'manhour_hours')::numeric, 0);
    v_load_kg   := coalesce((p_loading ->> 'kg_loaded')::numeric, 0);
    v_mode      := coalesce(p_loading ->> 'loading_mode', 'contract');

    -- Moulded goods have no per-kg contract behind them, so man-hours are the
    -- only method available and the contract half is discarded outright rather
    -- than costed against a rate that does not apply.
    if v_material = 'moulded' then
      v_mode    := 'manhour';
      v_load_kg := 0;
    elsif v_labourers > 0 and v_hours > 0 then
      -- Day labour worked on this load. On a contract job that makes it mixed;
      -- a job that recorded no kg at all was only ever man-hour work.
      v_mode := case when v_load_kg > 0 and v_mode <> 'manhour' then 'mixed' else 'manhour' end;
    else
      -- Nobody on the day-labour side, so there is nothing to mix in. An entry
      -- claiming otherwise is corrected rather than trusted.
      v_mode      := 'contract';
      v_labourers := 0;
      v_hours     := 0;
    end if;

    insert into public.loading_activities (
      dispatch_id, loading_mode, material_kind, kg_loaded, contract_rate_per_kg,
      manhour_labourers, manhour_hours, daily_labour_rate,
      vehicle_no, remarks, created_by
    ) values (
      p_id, v_mode, v_material, v_load_kg,
      coalesce((p_loading ->> 'contract_rate_per_kg')::numeric, 0),
      v_labourers, v_hours,
      coalesce((p_loading ->> 'daily_labour_rate')::numeric, 0),
      p_loading ->> 'vehicle_no', p_loading ->> 'remarks', p_created_by
    )
    returning loading_cost into v_loading;
  end if;

  return jsonb_build_object(
    'id', p_id,
    'lines', v_lines,
    'goods_total', v_goods,
    'kg', v_kg,
    'transport_charge', coalesce(p_transport_charge, 0),
    'loading_cost', coalesce(v_loading, 0),
    'total', v_goods + coalesce(p_transport_charge, 0)
  );
end;
$$;

-- The eight-argument version took no loading entry. Left in place it would stay
-- callable beside this one, and a dispatch posted through it would record the
-- document and none of what it cost to load.
drop function if exists public.post_dispatch(text, uuid, date, boolean, numeric, text, text, jsonb);

revoke all on function public.post_dispatch(
  text, uuid, date, boolean, numeric, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.post_dispatch(
  text, uuid, date, boolean, numeric, text, text, jsonb, jsonb
) to service_role;


-- -----------------------------------------------------------------------------
-- The labour rate, with the date it came into force
--
-- The other table the boot check reports missing. One row per change rather than
-- one row edited in place, so a run is costed at the rate in force on the day it
-- was worked and a closed month stays closed. The plant hires by the day, so a
-- row may give the day wage and the shift it covers instead of a per-hour
-- figure - see migrations/0004 and rate.service.js.
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

drop policy if exists labour_rates_read on public.labour_rates;
create policy labour_rates_read on public.labour_rates
  for select to anon, authenticated using (true);

drop policy if exists labour_rates_service on public.labour_rates;
create policy labour_rates_service on public.labour_rates
  for all to service_role using (true) with check (true);

-- The picking gang's note, from migrations/0004. The columns beside it are
-- already above; this is the one the boot check still reports.
alter table public.runs add column if not exists pickcut_remarks text;


-- PostgREST caches the table shapes; this makes it pick the new columns up
-- straight away instead of on its next reload.
notify pgrst, 'reload schema';
