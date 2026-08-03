-- =============================================================================
-- MANNA RECLAIM - loading activity costing
--
-- Every dispatch involves a loading job, and until now the plant costed it by
-- multiplying the whole window's output by a per-kg rate on the Costing tab.
-- That is wrong twice over: it charges loading to production, and it reprices
-- history every time somebody edits the rate.
--
-- Loading is a cost to serve. It happens after the reclaim exists, so it does
-- not belong in the rupees-per-kg the batch is carrying - that figure is frozen
-- when the batch consumes crumb. Loading joins at dispatch, beside transport:
--
--   dispatch margin = goods sold
--                   - kg x the batch's frozen rupees-per-kg
--                   - loading cost
--                   - transport, when we provided it
--
-- This is the opposite of picking, which sits upstream of production and does
-- correctly flow into rupees-per-kg crumb and then rupees-per-kg reclaim.
--
-- Idempotent: everything is `if not exists` or `create or replace`. Run it in
-- the Supabase SQL editor after 0001. supabase/schema.sql carries the same
-- block, so a project that runs that file alone ends up in the same place.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Loading activities
--
-- One row is one loading job - one truck - not one dispatch line. A truck is
-- loaded with whatever qualities are going to that customer that day, and the
-- gang is paid for the job rather than per quality, so tying the cost to a
-- single line would mean inventing a split at the point of entry. The split is
-- done at read time instead, by kg, in services/loading.service.js.
--
-- The two rate columns are snapshots. They are copied off the settings when the
-- entry is written and never read again, because revising a rate must not
-- silently change last month's numbers. The three cost columns are generated
-- from them, so a stored total cannot drift from the figures it is the sum of.
--
--   contract portion = kg loaded x contract rate per kg
--   manhour portion  = labourers x hours x daily labour rate
--   loading cost     = the two added
--
-- The daily rate is per labourer per hour. The plant pays a day wage, but a
-- loading job is an hour or two of it, so the hourly figure is what the entry
-- multiplies and what the settings hold.
-- -----------------------------------------------------------------------------
create table if not exists public.loading_activities (
  id                    uuid primary key default gen_random_uuid(),
  dispatch_id           text not null references public.dispatches (id) on delete cascade,

  loading_mode          text not null check (loading_mode in ('contract', 'manhour', 'mixed')),
  material_kind         text not null default 'reclaim' check (material_kind in ('reclaim', 'moulded')),

  -- The contract half.
  kg_loaded             numeric not null default 0 check (kg_loaded >= 0),
  contract_rate_per_kg  numeric not null default 0 check (contract_rate_per_kg >= 0),

  -- The day-labour half.
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

  /*
   * The rule this whole feature exists to enforce, at the table.
   *
   * Any day-labour worker on any loading job has to have their time accounted
   * in man-hours, including on a load that is normally contract-rated. So a row
   * that says `contract` and also carries labourers is a contradiction, and is
   * refused here rather than trusted to have been caught upstream. The API
   * coerces such a payload to `mixed` before it ever gets this far - see
   * loadingEntry() - and this constraint is what makes that coercion the only
   * way in rather than a courtesy.
   */
  constraint loading_activities_contract_has_no_daily_labour
    check (loading_mode <> 'contract' or manhour_labourers = 0),

  -- The mirror of it: a man-hour job that recorded nobody has costed nothing,
  -- and a mixed job is only mixed if it actually has both halves.
  constraint loading_activities_manhour_has_labour
    check (loading_mode <> 'manhour' or manhour_labourers > 0),
  constraint loading_activities_mixed_has_both
    check (loading_mode <> 'mixed' or (manhour_labourers > 0 and kg_loaded > 0)),

  -- Moulded goods have no per-kg loading contract, so man-hours are the only
  -- method available for them. Nothing else may be costed against a rate that
  -- does not exist.
  constraint loading_activities_moulded_is_manhour
    check (material_kind <> 'moulded' or loading_mode = 'manhour')
);

create index if not exists loading_activities_dispatch_id_idx
  on public.loading_activities (dispatch_id);

-- One loading job per dispatch as things stand - a dispatch is one truck. The
-- index is unique so a double post cannot leave two entries costing the same
-- load twice; lifting it is what a multi-truck dispatch would need.
create unique index if not exists loading_activities_dispatch_id_key
  on public.loading_activities (dispatch_id);


-- -----------------------------------------------------------------------------
-- 2. Posting a dispatch, now with its loading job
--
-- Replaces the 0001 function. Same signature plus `p_loading`, so the header,
-- the lines, the stock draw-down and the loading entry are one transaction: a
-- dispatch that went out with no record of what it cost to load is the gap this
-- is here to close, and writing the two separately is how that gap reappears.
--
-- The mode is settled here as well as in the API. `p_loading` arrives already
-- coerced, but this function is what the table trusts, and a load that names
-- day labour on a contract job is corrected rather than refused - the labour
-- happened, and rejecting the document would only teach the office to leave the
-- labourers out.
--
-- Passing no `p_loading` writes no entry. That is a dispatch with no loading
-- recorded at all, which is a real thing that happens when the customer's own
-- crew loads their own vehicle - it is reported as a gap by the dispatch list
-- rather than invented as a zero.
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
  v_touched    integer;
  v_lines      integer := 0;
  v_goods      numeric := 0;
  v_mode       text;
  v_material   text;
  v_labourers  integer;
  v_hours      numeric;
  v_kg         numeric;
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

  -- -- the loading job --------------------------------------------------------
  if p_loading is not null and p_loading <> 'null'::jsonb then
    v_material  := coalesce(p_loading ->> 'material_kind', 'reclaim');
    v_labourers := coalesce((p_loading ->> 'manhour_labourers')::integer, 0);
    v_hours     := coalesce((p_loading ->> 'manhour_hours')::numeric, 0);
    v_kg        := coalesce((p_loading ->> 'kg_loaded')::numeric, 0);
    v_mode      := coalesce(p_loading ->> 'loading_mode', 'contract');

    -- Moulded goods have no per-kg contract behind them, so man-hours are the
    -- only method available and the contract half is discarded outright rather
    -- than costed against a rate that does not apply.
    if v_material = 'moulded' then
      v_mode := 'manhour';
      v_kg   := 0;
    elsif v_labourers > 0 and v_hours > 0 then
      -- Day labour worked on this load. On a contract job that makes it mixed;
      -- a job that recorded no kg at all was only ever man-hour work.
      v_mode := case when v_kg > 0 and v_mode <> 'manhour' then 'mixed' else 'manhour' end;
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
      p_id, v_mode, v_material, v_kg,
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
    'transport_charge', coalesce(p_transport_charge, 0),
    'loading_cost', coalesce(v_loading, 0),
    'total', v_goods + coalesce(p_transport_charge, 0)
  );
end;
$$;

-- The 0001 eight-argument version would otherwise stay callable beside the new
-- one, and PostgREST would happily route a body without `p_loading` to it - a
-- dispatch posted with its loading silently dropped.
drop function if exists public.post_dispatch(text, uuid, date, boolean, numeric, text, text, jsonb);


-- -----------------------------------------------------------------------------
-- 3. Release the coarse pools that were stranded
--
-- A coarse pool was created `pending` and there was no path in the application
-- that could ever make it `pass`: the lab tests a batch and a grade, and coarse
-- has neither - the line runs for a shift and the sacks pool by period. So it
-- never appeared on the Quality tab, applyLabVerdict() refused it by name, the
-- qc-sync script covers batch groups only, and no screen called
-- PATCH /stock/:id/qc. Meanwhile post_dispatch() refuses anything that is not
-- `pass`. Every coarse sack ever packed was therefore unsellable through the
-- app, sitting in the yard reading "awaiting the lab".
--
-- Coarse is now released as it is packed - see recordPacking() in
-- stock.service.js - and this is the same release applied once to the pools
-- that predate it.
--
-- Only `pending` pools, and only pools. A pool somebody deliberately put on
-- hold stays on hold, and no batch group is touched: a batch has a lab verdict
-- and this must not invent one.
-- -----------------------------------------------------------------------------
update public.stock_groups
   set qc_status = 'pass'
 where kind = 'pool'
   and qc_status = 'pending';


-- -----------------------------------------------------------------------------
-- 4. Access
--
-- What a load cost to put on a truck is commercial information, and the browser
-- holds a publishable key. Same treatment as the rest of the dispatch tables:
-- reachable with the service key and with nothing else.
-- -----------------------------------------------------------------------------
alter table public.loading_activities enable row level security;

revoke all on public.loading_activities from anon, authenticated;

drop policy if exists loading_activities_service on public.loading_activities;
create policy loading_activities_service on public.loading_activities
  for all to service_role using (true) with check (true);

revoke all on function public.post_dispatch(text, uuid, date, boolean, numeric, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.post_dispatch(text, uuid, date, boolean, numeric, text, text, jsonb, jsonb) to service_role;
