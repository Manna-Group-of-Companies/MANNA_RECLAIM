-- =============================================================================
-- MANNA RECLAIM - stock groups, customers, priced dispatches
--
-- The plant used to record a dispatch as a single row off the weighbridge slip:
-- a customer name, a grade, a weight. That says what left, but never what it
-- left *from*, so nothing could tell how much of a batch was still in the yard
-- and the same sacks could go out twice.
--
-- This adds the missing middle. Packing files sacks into a `stock_group` - one
-- per batch and grade on the special line, one per ten-day period on the coarse
-- line, which is not batch-identified - and a dispatch draws them down through
-- lines that name the group, the count and the price. The draw-down happens
-- inside post_dispatch() below, so two vehicles loading the same pool cannot
-- both take the last sacks.
--
-- Idempotent: everything is `if not exists` or `create or replace`. Run it in
-- the Supabase SQL editor. supabase/schema.sql carries the same block, so a
-- project that runs that file alone ends up in the same place.
-- =============================================================================


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
    set packed_sacks = stock_groups.packed_sacks + coalesce(p_delta, 0),
        quality      = coalesce(stock_groups.quality, excluded.quality),
        -- The lab's verdict is the lab's to change. Packing only ever fills it
        -- in where nothing has been recorded yet.
        qc_status    = case
                         when p_qc_status is null then stock_groups.qc_status
                         when stock_groups.qc_status = 'pending' then p_qc_status
                         else stock_groups.qc_status
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
