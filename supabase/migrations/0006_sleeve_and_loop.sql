-- =============================================================================
-- MANNA RECLAIM - sleeve and loop, and the lots they are made in
--
-- Sleeve and loop were being made and recorded nowhere. The nearest thing the
-- app had was the moulding presses, and putting them there would have been
-- wrong in both directions: a press is keyed on the product and the pack it is
-- boxed in, so every pack of loops the plant has ever made pools into one row
-- and one lab verdict moves all of it. Sleeve and loop are made a shift at a
-- time and certified a shift at a time, which is how reclaim works, not how a
-- press does.
--
-- So they are their own activities, with their own cards, and what they make is
-- a lot:
--
--   1. two machine kinds, `sleeve` and `loop`, and the two machines themselves.
--   2. a batch number nobody types - the product, the shift date and the shift,
--      which is the only three things that identify a lot of them. One lot per
--      product per shift, held by a unique index rather than by everyone
--      remembering.
--   3. a fourth kind of stock group, `lot`: moulded goods counted in pieces like
--      a press's, but keyed on that batch number and certified per lot like a
--      batch of reclaim. Only a pass leaves the yard, which is post_dispatch()'s
--      rule already and is not touched here.
--
-- Idempotent. Run after 0005; supabase/schema.sql carries the same blocks.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Two more kinds of machine
--
-- `kind` is what the run rules switch on, and sleeve and loop answer them
-- differently from everything already on the list: no meters, no bearings, no
-- hour meter, nothing for the Weigh tab - and, unlike a press, a batch number of
-- their own and a lot to certify. A check constraint cannot be widened in place,
-- so it is dropped and rewritten, the way 0001 did for the presses.
-- -----------------------------------------------------------------------------
alter table public.machines drop constraint if exists machines_kind_check;
alter table public.machines add constraint machines_kind_check
  check (kind in ('grind', 'autoclave', 'prerefiner', 'refiner', 'coarse', 'press', 'sleeve', 'loop'));

insert into public.machines
  (id, name, short, kind, type, group_name, sub, accent, capacity, out_weight, needs_quality, weigh, tyre, def_tyre, enabled, sort_order)
values
  ('SLEEVE', 'Sleeve', 'Sleeve', 'sleeve', 'sleeve', 'Sleeve & Loop',
   'batch per shift - pieces, flash and crew at stop', '#7ec9a0',
   null, false, false, false, false, null, true, 17),
  ('LOOP',   'Loop',   'Loop',   'loop',   'loop',   'Sleeve & Loop',
   'batch per shift - pieces, flash and crew at stop', '#c99ade',
   null, false, false, false, false, null, true, 18)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. A product says whether it is moulded
--
-- Cavities and a cycle time are facts about a mould. A sleeve that is cut rather
-- than moulded has neither, and asking the floor for them would either get a
-- guess or get skipped - so the product carries the answer once and the run
-- sheet asks accordingly.
--
-- Default true, because every product on the list today is something a press
-- moulds. A plant that starts making an unmoulded item unticks it on the master.
-- -----------------------------------------------------------------------------
alter table public.products add column if not exists moulded boolean not null default true;

-- The prefix a lot's batch number is built from. `code` already existed as what
-- a product is ordered under and is unique across the list, which is exactly
-- what a batch number needs - so it is filled in rather than a second column
-- added beside it. Only where it is null: a code the back office has already set
-- is theirs, and renumbering under them is how a batch number stops meaning
-- anything.
update public.products set code = 'SLEEVE' where id = 'SLEVE' and code is null;
update public.products set code = 'LOOP'   where id = 'LOOP'  and code is null;


-- -----------------------------------------------------------------------------
-- 3. What a sleeve or loop run records
--
-- `pieces` already exists - it is what a press counts - and stays the figure of
-- record: what the crew actually counted off the bench. `pieces_expected` is
-- what the cycle and the mould say it should have been, worked out from the run
-- time as the run is logged and kept beside the actual so the two can be
-- compared later by anyone, not only by whoever was standing there.
--
-- It is deliberately not derived on read. The cycle time and the cavities are
-- the run's own snapshot and could be corrected afterwards, and a variance that
-- silently re-computed itself would stop being evidence of anything.
--
-- `labour_rate` is the same idea one layer down: the rupees-per-labourer-hour in
-- force on the day this was worked, copied onto the run so a rate raised next
-- month prices the next shift and leaves this one where it is. A press does not
-- carry one because a press is not costed on labour at all; these are.
-- -----------------------------------------------------------------------------
alter table public.runs add column if not exists pieces_expected integer;
alter table public.runs add column if not exists labour_rate     numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'runs_pieces_expected_non_negative') then
    alter table public.runs
      add constraint runs_pieces_expected_non_negative
      check (pieces_expected is null or pieces_expected >= 0)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'runs_labour_rate_non_negative') then
    alter table public.runs
      add constraint runs_labour_rate_non_negative
      check (labour_rate is null or labour_rate >= 0)
      not valid;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 4. One lot per product per shift
--
-- The batch number is the product, the shift date and the shift, so two logged
-- runs of the same product in the same shift would be two rows claiming the same
-- lot. They are not: the second start folds into the record the shift already
-- has and lifts `passes`, which is the same rule the coarse and grinding lines
-- run on - see run.service's shiftRecordFor().
--
-- This is the guarantee behind that, in the one place that cannot be forgotten.
-- Two conditions on it, and both matter:
--
--   kind in ('sleeve','loop')   presses share the `product` column and pool by
--                               product and pack rather than by shift, so a
--                               press moulding the same product twice in a shift
--                               is two legitimate rows.
--   ended_at is not null        a run in progress has not claimed its lot yet.
--                               Without this the index would refuse the second
--                               start outright, before the merge that resolves
--                               it has had a chance to happen.
-- -----------------------------------------------------------------------------
create unique index if not exists runs_moulding_lot_key
  on public.runs (product, shift_date, shift)
  where kind in ('sleeve', 'loop') and ended_at is not null;


-- -----------------------------------------------------------------------------
-- 5. A fourth kind of stock group
--
--   batch    one grade off one special-line batch. Certified as a lot.
--   pool     the coarse line's ten-day period. Not batch-identified.
--   product  what a press moulded, keyed on the product and the pack.
--   lot      what a sleeve or loop shift made, keyed on its batch number.
--
-- `lot` is counted in pieces like a `product` group and certified per label like
-- a `batch` one, which is why it is neither of them. The label is the batch
-- number itself - SLEEVE-03/Aug/26-day - so the yard, the lab and the run all
-- name the goods the same way, and `label` being unique is what makes a second
-- shift's boxing append to the lot instead of opening a second row.
-- -----------------------------------------------------------------------------
alter table public.stock_groups drop constraint if exists stock_groups_kind_check;
alter table public.stock_groups
  add constraint stock_groups_kind_check check (kind in ('batch', 'pool', 'product', 'lot'));
