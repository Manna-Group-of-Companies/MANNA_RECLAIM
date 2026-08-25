-- =============================================================================
-- MANNA RECLAIM - stock as SAP holds it
--
-- The yard used to be a ledger this app kept for itself: a supervisor typed
-- what had been bagged, a Postgres function moved the group, and a dispatch
-- drew it down. The plant is too busy to keep a bagging bench up to date, and a
-- figure nobody has time to type is a figure that drifts - so the packing entry
-- has been taken off the tablets and stock comes from SAP instead, read off the
-- Manna Rubber Products server by a script on the plant machine.
--
-- Two tables, because a sync is two facts: what the stock is, and whether the
-- reading of it worked.
--
-- `sap_syncs` is the run. It exists so somebody can answer "is this figure from
-- this morning or from a fortnight ago", which is the only question that
-- matters about an unattended job. A screen showing stock with no idea how old
-- it is will be believed on the day the script has been failing silently.
--
-- `sap_stock` is the snapshot, one row per item per batch per warehouse, as SAP
-- holds it. Deliberately not aggregated: the API can add it up and then explain
-- its own total, whereas a pre-totalled figure makes every later disagreement
-- between the two systems unanswerable.
--
-- Every row carries the sync that brought it. The reader takes the newest
-- finished sync and ignores the rest, so a half-written snapshot is never read
-- as the yard - and an insert that fails part way through leaves the previous
-- one standing rather than leaving nothing at all.
--
-- Nothing here replaces `stock_groups`. That table still holds what was packed
-- before the switch, and the dispatch documents are still drawn against it. The
-- two live side by side until the plant is satisfied the SAP figures are right,
-- which is a decision for the office rather than for a migration.
-- =============================================================================

create table if not exists public.sap_syncs (
  id          text primary key default gen_random_uuid()::text,
  -- When the read happened, as the plant server saw it - not when it arrived.
  -- A script that queried at 06:00 and posted at 09:00 after three retries is
  -- reporting six o'clock's stock, and the screen has to be able to say so.
  as_of       timestamptz not null,
  received_at timestamptz not null default now(),
  source      text not null default 'SAP',
  rows        integer not null default 0,
  -- What the snapshot came to, kept beside it so a run can be compared with the
  -- one before without reading either snapshot back.
  total_qty   numeric,
  -- 'ok' once every row is in. A snapshot is only read when its run says so,
  -- which is what makes a half-written one harmless.
  status      text not null default 'pending'
                check (status in ('pending', 'ok', 'failed')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists sap_syncs_recent_idx
  on public.sap_syncs (status, as_of desc);

create table if not exists public.sap_stock (
  id          text primary key default gen_random_uuid()::text,
  sync_id     text not null references public.sap_syncs (id) on delete cascade,
  -- SAP's own item code, and the key. Never invented here: an item this plant
  -- has no name for is still an item SAP is holding stock of.
  sku         text not null,
  description text,
  -- What the plant calls it - Fine, Coarse, Special DRC. Null where nobody has
  -- mapped the SAP item yet, which is a thing to fix rather than a row to drop:
  -- dropped, an unmapped grade is stock that silently does not exist.
  grade       text,
  batch       text,
  warehouse   text,
  quantity    numeric not null default 0,
  -- kg for reclaim, pieces for moulded goods. Held per row because SAP holds it
  -- per row, and a snapshot that assumed one unit would be wrong about the
  -- presses on the day somebody looks.
  unit        text not null default 'kg',
  created_at  timestamptz not null default now()
);

-- One row per item per batch per warehouse per sync. SAP answering twice for
-- the same slot is either a query that is wrong or a fact about SAP, and both
-- are worth failing loudly over rather than quietly keeping the second one.
create unique index if not exists sap_stock_slot_key
  on public.sap_stock (sync_id, sku, coalesce(batch, ''), coalesce(warehouse, ''));

create index if not exists sap_stock_sync_idx on public.sap_stock (sync_id);
create index if not exists sap_stock_grade_idx on public.sap_stock (grade);

alter table public.sap_syncs enable row level security;
alter table public.sap_stock enable row level security;

drop policy if exists sap_syncs_read on public.sap_syncs;
create policy sap_syncs_read on public.sap_syncs
  for select to anon, authenticated using (true);

drop policy if exists sap_syncs_service on public.sap_syncs;
create policy sap_syncs_service on public.sap_syncs
  for all to service_role using (true) with check (true);

drop policy if exists sap_stock_read on public.sap_stock;
create policy sap_stock_read on public.sap_stock
  for select to anon, authenticated using (true);

drop policy if exists sap_stock_service on public.sap_stock;
create policy sap_stock_service on public.sap_stock
  for all to service_role using (true) with check (true);
