-- =============================================================================
-- MANNA RECLAIM - a lot is the product AND the shift, not one string
--
-- 0006 gave sleeve and loop a batch number of their own and built it out of the
-- product, the date and the shift:
--
--   SLEEVE-03/Aug/26-day
--
-- One string carrying two facts, and every reader that wanted one of them had to
-- take the string apart. The machine-log CSV, the yard's cards, the lab's list
-- and the dispatch line each did that slightly differently, and a product code
-- with a hyphen in it would have broken all four at once.
--
-- So the number is the shift and only the shift - `03/Aug/26-day` - and the
-- product is the column beside it that it always should have been. The lot is
-- the two together:
--
--   1. `stock_groups.batch_no`, and the label rebuilt as `<product>-<batch>`.
--   2. a unique index on (product_id, batch_no) for lot groups. This is the rule
--      in the one place it cannot be forgotten: sleeve and loop worked on the
--      same shift carry the same number and must stay two rows, and two boxings
--      of the same product on the same shift must stay one.
--   3. record_packed_stock() takes the number, so packing fills it in.
--
-- WHAT THIS DOES NOT DO: it does not rewrite the numbers already on the rows.
-- Existing lots still read `SLEEVE-03/Aug/26-day`, in `runs`, in `quality_tests`
-- and in `stock_groups.label`. Splitting them is a data migration with a merge
-- in the middle of it - two lots can collapse onto one key - and that belongs in
-- a script that can be run dry, that takes a backup first, and that a person
-- reads the output of:
--
--   node scripts/lot-key-split.js            what it would do, writes nothing
--   node scripts/lot-key-split.js --apply    do it
--
-- Run this file first: the script needs the column and fills it in.
--
-- Idempotent. Run after 0006; supabase/schema.sql carries the same blocks.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The batch number as a column
--
-- On a `lot` it is half the key. On a `batch` group it is provenance - the label
-- is already `B1041-Fine` and the number is in it - and having it in a column
-- means nothing has to read a label apart to answer "what came off B1041". A
-- `pool` and a press's `product` group are not batch-identified at all and keep
-- null there, which is the honest value rather than a blank string.
-- -----------------------------------------------------------------------------
alter table public.stock_groups add column if not exists batch_no text;

create index if not exists stock_groups_batch_no_idx on public.stock_groups (batch_no);


-- -----------------------------------------------------------------------------
-- 2. One lot per product per shift
--
-- The composite key, held where it cannot be forgotten.
--
-- Two conditions on it, and both matter:
--
--   kind = 'lot'                 a press's group shares the `product_id` column
--                                and pools every shift into one row, so it has
--                                no batch number and must not be dragged into
--                                this rule.
--   both columns not null        a lot needs both halves; a row missing either
--                                is not a lot the yard can address, and letting
--                                Postgres treat nulls as distinct would quietly
--                                allow a second one.
--
-- The label is `<product_id>-<batch_no>` and is unique in its own right, so this
-- index is not the only thing standing between two rows for one lot. It is here
-- because the label is a derived string and this is the actual rule - if the two
-- ever disagree, this one is right.
--
-- Created concurrently is deliberately NOT used: this must fail loudly inside
-- the migration if the data still holds a duplicate, rather than leaving an
-- invalid index behind for somebody to find later. If it does fail, run
-- scripts/lot-key-split.js - the merge is its job.
-- -----------------------------------------------------------------------------
create unique index if not exists stock_groups_lot_key
  on public.stock_groups (product_id, batch_no)
  where kind = 'lot' and product_id is not null and batch_no is not null;


-- -----------------------------------------------------------------------------
-- 3. Packing files the number
--
-- The fourteenth argument. Everything else about this function is unchanged from
-- 0005 - see the notes there and in schema.sql - and the column is filled in on
-- insert and left alone on conflict, because a group's key does not move when
-- more is packed into it.
--
-- `coalesce` on the update rather than a plain assignment: a row created before
-- this column existed has null there, and packing into it again is what supplies
-- the number. The same rule product_id and pack_size already run on.
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
  p_qc_by         text    default null,
  p_batch_no      text    default null
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
    qc_by, qc_at, qc_source, batch_no
  )
  values (
    p_kind, p_label, p_quality, greatest(coalesce(p_delta, 0), 0),
    p_period_start, p_period_end, coalesce(p_qc_status, 'pending'),
    v_unit, p_product_id, p_pack_size, v_kg, v_day, v_day,
    case when p_qc_status is null then null else p_qc_by end,
    case when p_qc_status is null then null else now() end,
    case when p_qc_status is null then null else 'lab' end,
    nullif(p_batch_no, '')
  )
  on conflict (label) do update
    set packed_sacks = stock_groups.packed_sacks + coalesce(p_delta, 0),
        quality      = coalesce(stock_groups.quality, excluded.quality),
        product_id   = coalesce(stock_groups.product_id, excluded.product_id),
        pack_size    = coalesce(stock_groups.pack_size, excluded.pack_size),
        batch_no     = coalesce(stock_groups.batch_no, excluded.batch_no),
        kg_per_unit  = case
                         when excluded.kg_per_unit > 0 then excluded.kg_per_unit
                         else stock_groups.kg_per_unit
                       end,
        first_packed_on = least(coalesce(stock_groups.first_packed_on, v_day), v_day),
        last_packed_on  = greatest(coalesce(stock_groups.last_packed_on, v_day), v_day),
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

-- The thirteen-argument version stays callable on purpose, unlike the seven-
-- argument one 0005 dropped. The service steps back to it when PostgREST cannot
-- match the new body - see filePackedStock() in stock.service.js - so a project
-- part-way through this migration files stock without its batch number rather
-- than not at all. It can be dropped once every deployment is on 0007.
