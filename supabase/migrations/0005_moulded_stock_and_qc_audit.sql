-- =============================================================================
-- MANNA RECLAIM - the whole yard on one page, and who released it
--
-- The Stock view is the manager's answer to "what is in the plant". Until now it
-- could not actually give one, for three reasons:
--
--   1. The presses were not on it at all. A press moulds finished goods out of
--      reclaim compound and counts them in pieces; nothing filed those pieces
--      anywhere, so a shift's moulding existed on the run and nowhere else. The
--      yard could be holding four thousand loops and the page would say nothing.
--
--   2. A row carried a count and no weight and no date. "AUG-H1, 60 sacks" does
--      not say when it was packed or what it weighs, which are the two things
--      asked at the gate.
--
--   3. A QC verdict moved `qc_status` and left no trace of who moved it. The
--      lab's own test row keeps its tester, but a status set by hand through
--      PATCH /stock/:id/qc kept nothing, and that is precisely the one worth
--      being able to ask about later.
--
-- So: a third kind of stock group, a unit beside every count, the weight and the
-- packing dates on the row, and the verdict signed.
--
-- Idempotent. Run after 0004; supabase/schema.sql carries the same blocks.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A product ships in a pack
--
-- `pack_size_kg` already existed and is a different figure: it is what a sack of
-- a reclaim grade weighs. A moulded product is not sold by weight - it is sold
-- by the piece, boxed some number at a time - so the pack is a count.
--
-- `piece_kg` is what one piece weighs. It is here so the yard can put a weight
-- against moulded stock, which is what a lorry is loaded by and what the loading
-- entry is costed on. Left null it simply reports no weight rather than guessing
-- one, the same way an uncosted batch reports no margin.
-- -----------------------------------------------------------------------------
alter table public.products add column if not exists pack_size  integer;
alter table public.products add column if not exists pack_label text;
alter table public.products add column if not exists piece_kg   numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_pack_size_positive') then
    alter table public.products
      add constraint products_pack_size_positive
      check (pack_size is null or pack_size > 0)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_piece_kg_positive') then
    alter table public.products
      add constraint products_piece_kg_positive
      check (piece_kg is null or piece_kg > 0)
      not valid;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 1b. A press run remembers how much of it has been boxed
--
-- The mirror of `packed_sacks` on a bagged run. Packing sends the *change* to
-- the stock group, never the total, so a press run whose piece count is
-- corrected next morning moves the yard by the difference instead of filing the
-- same pieces a second time.
-- -----------------------------------------------------------------------------
alter table public.runs add column if not exists packed_pieces integer;


-- -----------------------------------------------------------------------------
-- 2. Stock groups: a third kind, and a unit beside the counts
--
-- The three kinds are now:
--
--   batch    one grade off one special-line batch. Certified as a lot.
--   pool     the coarse line's ten-day period. Not batch-identified.
--   product  what a press moulded, keyed on the product and the pack it is
--            boxed in - LOOP-50 is loops, fifty to a pack.
--
-- `packed_sacks`, `dispatched_sacks` and `available_sacks` keep their names and
-- become counts *in whatever `unit` says*. They are not renamed, deliberately:
-- they are referenced by post_dispatch(), by the CHECK that makes an oversell
-- impossible, by every read in the server and by the client models, and a rename
-- would be a large diff whose only product is a better word. `unit` is the
-- column that says what the number means, and every serializer reads it.
--
-- `kg_per_unit` is what one of them weighs - fifty for a sack, the product's
-- `piece_kg` for a piece. Weight is derived from it rather than stored as its
-- own drifting column, so a row's weight can never disagree with its own count.
-- -----------------------------------------------------------------------------
alter table public.stock_groups add column if not exists unit            text;
alter table public.stock_groups add column if not exists product_id      text;
alter table public.stock_groups add column if not exists pack_size       integer;
alter table public.stock_groups add column if not exists kg_per_unit     numeric;
alter table public.stock_groups add column if not exists first_packed_on date;
alter table public.stock_groups add column if not exists last_packed_on  date;

-- Everything that exists today is sacks at fifty kilos, because that is all
-- there was a way to file. Backfilled before the NOT NULL goes on.
update public.stock_groups set unit        = 'sacks' where unit is null;
update public.stock_groups set kg_per_unit = 50      where kg_per_unit is null;

-- The packing dates nobody was recording. `created_at` is when the group was
-- first written, which for every existing row is the day its first sacks were
-- filed - the closest thing to the truth that exists, and better than a blank
-- column on a screen that now shows one.
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
end $$;

alter table public.stock_groups drop constraint if exists stock_groups_product_id_fkey;
alter table public.stock_groups add constraint stock_groups_product_id_fkey
  foreign key (product_id) references public.products (id);

create index if not exists stock_groups_product_id_idx on public.stock_groups (product_id);


-- -----------------------------------------------------------------------------
-- 3. The verdict, signed
--
-- Who released the stock and when. The lab's test row already keeps its tester,
-- but the stock group is what post_dispatch() actually reads, and a status set
-- by hand through PATCH /stock/:id/qc left no record of anything at all - which
-- is the case somebody eventually needs to ask about.
--
-- `qc_source` tells the two apart: `lab` is a verdict pushed across from a test
-- that was filed, `manual` is the back office overriding it. Both are legitimate
-- and they are not the same event.
-- -----------------------------------------------------------------------------
alter table public.stock_groups add column if not exists qc_by     text;
alter table public.stock_groups add column if not exists qc_at     timestamptz;
alter table public.stock_groups add column if not exists qc_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_groups_qc_source_check') then
    alter table public.stock_groups
      add constraint stock_groups_qc_source_check
      check (qc_source is null or qc_source in ('lab', 'manual'));
  end if;
end $$;

alter table public.stock_groups drop constraint if exists stock_groups_qc_by_fkey;
alter table public.stock_groups add constraint stock_groups_qc_by_fkey
  foreign key (qc_by) references public.users (id);


-- -----------------------------------------------------------------------------
-- 4. A dispatch line says what its number counts
--
-- `sacks` keeps its name and becomes the quantity in the group's unit, for the
-- same reason as above - and because `line_total` is generated from it, so a
-- second quantity column would have to be kept in step with the one the money is
-- computed from. `unit` is copied off the group by post_dispatch() and never
-- taken from the request: a client that could name its own unit could buy
-- pieces at a sack price.
-- -----------------------------------------------------------------------------
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
-- 5. Packing files stock, whatever it is counted in
--
-- Still called with the *change*, not the total - see the note in 0001. What is
-- new is everything the row now has to carry: the unit, the product and pack a
-- moulded group is keyed on, what one of them weighs, the day they were packed,
-- and who the verdict came from when packing already knows it.
--
-- The packing dates are set from `p_packed_on` rather than from now(), because
-- the Packing tab is also where yesterday's figure gets corrected, and the
-- correction must not move the group's dates to today. `first_packed_on` only
-- ever moves earlier and `last_packed_on` only ever moves later, so a group
-- packed across three days reads as the span it was.
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
        -- created before this migration has no product and no pack against it;
        -- packing into it again is what supplies them.
        product_id   = coalesce(stock_groups.product_id, excluded.product_id),
        pack_size    = coalesce(stock_groups.pack_size, excluded.pack_size),
        kg_per_unit  = case
                         when excluded.kg_per_unit > 0 then excluded.kg_per_unit
                         else stock_groups.kg_per_unit
                       end,
        -- The span the group was packed across. Only ever widens, so correcting
        -- a figure days later does not move the dates to the day of the
        -- correction.
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


-- -----------------------------------------------------------------------------
-- 6. Posting a dispatch, in the group's own unit
--
-- The refusals are unchanged and are the point of the function: a group that is
-- not `pass` cannot leave the yard however the request was made, and the
-- conditional UPDATE is what makes two vehicles loading the same pool queue
-- rather than both reading the same availability.
--
-- What is added is one line - the unit is copied off the group onto the line -
-- and one refusal, STOCK_UNIT, for a request whose unit does not match the
-- stock it names. That is a client that has gone stale about what it is
-- selling, and pricing pieces at a sack rate is exactly the mistake worth
-- refusing rather than absorbing.
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
    -- what the loading job is costed on when the form did not send a
    -- weighbridge figure, and it is the only way a moulded load has a kg at all.
    v_kg    := v_kg + (v_sacks * coalesce(v_group.kg_per_unit, 0));
  end loop;

  -- -- the loading job --------------------------------------------------------
  -- In the same transaction as the document, because a dispatch that went out
  -- with no record of what it cost to load is the gap this is here to close,
  -- and writing the two separately is how that gap reappears.
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


-- -----------------------------------------------------------------------------
-- 7. Grants
--
-- The signature changed, so the old grant no longer covers the function. Both
-- stay service-role only: one moves stock levels and the other decides whether
-- goods may be sold, and neither is something a browser key gets to call.
-- -----------------------------------------------------------------------------
revoke all on function public.record_packed_stock(
  text, text, text, integer, date, date, text, text, text, integer, numeric, date, text
) from public, anon, authenticated;
grant execute on function public.record_packed_stock(
  text, text, text, integer, date, date, text, text, text, integer, numeric, date, text
) to service_role;

revoke all on function public.post_dispatch(
  text, uuid, date, boolean, numeric, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.post_dispatch(
  text, uuid, date, boolean, numeric, text, text, jsonb, jsonb
) to service_role;
