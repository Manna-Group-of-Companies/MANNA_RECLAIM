-- =============================================================================
-- MANNA RECLAIM - what has gone out, as SAP holds it
--
-- The second SAP feed. The first is the yard, read every fifteen minutes; this
-- is three months of dispatches, read once a day, because the managing director
-- asks "what have we been shipping" and no screen here could answer: the plant
-- raises its documents in SAP, so this end has never had them.
--
-- `sap_syncs` is widened rather than copied. A run is a run whichever feed it
-- belongs to, and the three-step dance that makes a snapshot safe - open
-- pending, insert, mark ok, then retire the one before - is subtle enough that
-- two copies of it would drift, invisibly, both still answering 201.
--
-- `feed` therefore scopes everything. Without it a dispatch snapshot would
-- retire the stock one on the way past and empty the yard every morning at six:
-- a bug that only appears in production, only once a day, and looks like the
-- stock sync having failed.
--
-- One row per document LINE, never per document. A delivery of three grades is
-- three rows - "what went out as Fine" is most of what this is for, and a feed
-- aggregated at the document would have thrown that away before it arrived.
--
-- On this install the dispatch record is the invoice: it raises no delivery
-- notes at all, checked back to 2023. `doc_type` still says which on every row
-- rather than being assumed, so if the plant starts raising deliveries later
-- both arrive and can be told apart without another migration.
-- =============================================================================

-- ---- the run table learns which feed a run belongs to ----
--
-- Existing rows are the stock feed, which is the only one there has been.
alter table public.sap_syncs add column if not exists feed text not null default 'stock';

comment on column public.sap_syncs.feed is
  'Which SAP feed this run belongs to - stock or dispatch. Scopes the retire '
  'step: without it a dispatch snapshot would delete the stock one. '
  'See 0021_sap_dispatches.sql.';

-- The window the read covered, for a feed that reads a period rather than a
-- moment. Null on the stock feed, which is a snapshot of now and has no window.
alter table public.sap_syncs add column if not exists window_from date;
alter table public.sap_syncs add column if not exists window_to   date;

comment on column public.sap_syncs.window_from is
  'What the read covered, so the screen knows what it is being given rather '
  'than inferring it from the rows. Null on a feed with no window.';

drop index if exists sap_syncs_recent_idx;
create index if not exists sap_syncs_feed_recent_idx
  on public.sap_syncs (feed, status, as_of desc);

-- ---- and the dispatch lines themselves ----
create table if not exists public.sap_dispatches (
  id            text primary key default gen_random_uuid()::text,
  sync_id       text not null references public.sap_syncs (id) on delete cascade,
  -- The document, and which kind it is. Both, because a delivery note and an
  -- invoice can share a number and mean different things.
  doc_no        text not null,
  doc_type      text not null default 'invoice',
  doc_date      date,
  customer      text,
  customer_code text,
  -- SAP's own item code, and the key to the line. Never invented here.
  sku           text not null,
  description   text,
  -- What the plant calls it, off the same mapping table the stock feed uses.
  -- Null where nobody has mapped the SAP item yet - a thing to fix rather than
  -- a row to drop, since dropped it is a dispatch that silently never happened.
  grade         text,
  -- Null throughout, as things stand. This install carries no batch on any
  -- invoice line - 128 checked, none had one - even for items batch management
  -- is switched on for. Kept as a column because that is a fact about today's
  -- SAP rather than about dispatches, and the plant may switch it on.
  batch         text,
  quantity      numeric not null default 0,
  unit          text not null default 'kg',
  -- Null rather than nought where the document carries no value. A zero reads
  -- as a free delivery, which is a different thing from a value not given.
  value         numeric,
  currency      text,
  created_at    timestamptz not null default now()
);

-- One line per document per item per batch per sync. The item is in the key
-- rather than SAP's line number, because that numbering is its own business and
-- this end should not depend on it - and one invoice carrying the same item
-- twice against different batches is a real thing that must not collapse.
create unique index if not exists sap_dispatches_line_key
  on public.sap_dispatches (sync_id, doc_type, doc_no, sku, coalesce(batch, ''));

create index if not exists sap_dispatches_sync_idx on public.sap_dispatches (sync_id);
create index if not exists sap_dispatches_date_idx on public.sap_dispatches (doc_date desc);
create index if not exists sap_dispatches_grade_idx on public.sap_dispatches (grade);
create index if not exists sap_dispatches_customer_idx on public.sap_dispatches (customer);

alter table public.sap_dispatches enable row level security;

drop policy if exists sap_dispatches_read on public.sap_dispatches;
create policy sap_dispatches_read on public.sap_dispatches
  for select to anon, authenticated using (true);

drop policy if exists sap_dispatches_service on public.sap_dispatches;
create policy sap_dispatches_service on public.sap_dispatches
  for all to service_role using (true) with check (true);
