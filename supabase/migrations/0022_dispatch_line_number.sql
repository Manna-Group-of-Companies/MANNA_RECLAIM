-- =============================================================================
-- MANNA RECLAIM - a dispatch line needs a line's identity
--
-- 0021 keyed a dispatch line on the document, the item and the batch, and said
-- in as many words why the line number was left out: "SAP's line numbering is
-- its own business and this end should not depend on it".
--
-- That was wrong, and the plant's own data said so on the first real run. The
-- whole three-month window was refused over invoice 149 (DocEntry 1931, 18 June
-- 2026), which carries item I-10061 on two separate lines - 2000 kg and 1000 kg,
-- same warehouse, and no batch on either, because no invoice line on this
-- install carries one. Two genuine lines that the key could not tell apart.
--
-- The reasoning behind leaving it out was about not making the line number the
-- primary key, which still holds. But two lines of the same item on one document
-- have nothing else to distinguish them - not the item, not the batch, not the
-- warehouse - so the line number is not an implementation detail here, it is the
-- only identity a line has. SAP has it (`INV1.LineNum`); this end was declining
-- to be told.
--
-- Nullable, and the fallback is the old key. A feed that does not send a line
-- number still gets the duplicate check it had - and when two rows collide under
-- that key the message now says to send `lineNum`, which turns a dead end into
-- an instruction. Refusing is still right in that case: without a line number
-- those two rows are genuinely indistinguishable, and storing both would as
-- easily be doubling a figure as recording a fact.
-- =============================================================================

alter table public.sap_dispatches add column if not exists line_num integer;

comment on column public.sap_dispatches.line_num is
  'SAP''s own line number on the document (INV1.LineNum). The only thing that '
  'tells two lines of the same item apart - this install carries no batch on '
  'any invoice line, so item and batch together are not enough. Null where the '
  'feed does not send one. See 0022_dispatch_line_number.sql.';

-- The old key could not hold invoice 149. This one can, and still refuses a
-- genuine duplicate: two rows with the same line number are the same line.
drop index if exists sap_dispatches_line_key;

create unique index if not exists sap_dispatches_line_key
  on public.sap_dispatches (
    sync_id, doc_type, doc_no, coalesce(line_num, -1), sku, coalesce(batch, '')
  );
