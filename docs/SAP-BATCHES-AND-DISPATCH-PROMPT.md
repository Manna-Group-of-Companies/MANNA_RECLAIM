# Prompt — batches on the stock feed, and the dispatch feed

Paste everything below the line into Claude Code **on the plant server**, in the
folder that already holds `sap_stock_sync.py`, `login.json` and `target.json`.

Two jobs in it. The first is a question about the stock feed that is already
working — whether the batch numbers are coming through, and whether they can.
The second is a new feed for dispatches, which the managing director's screen
needs three months of.

Same two-sitting shape as last time, and for the same reason: the first sitting
finds out what SAP holds and stops. Nobody at this end knows how dispatches are
laid out on that box, and a script written against a guess runs, reports
numbers, and looks entirely fine while being wrong.

---

You already have `sap_stock_sync.py` working against SAP Business One and
posting to MANNA RECLAIM. Two things now.

## Part one — batches on the stock feed

The stock document has a `batch` field per row and the API stores it. What
nobody here knows is whether your query is filling it in, and whether SAP has it
to give.

This matters because of how the plant works, and the two lines are different:

* **The special line** is batch-identified. A charge goes into an autoclave
  under a number, is refined into several grades, and is sold out of that batch.
  Somebody asks "is 3140 still in the yard" and "has the lab passed 3142" — both
  are questions about a number, and stock with no batch against it cannot answer
  either.
* **The coarse line** is *not* batch-identified. It runs for a shift rather than
  for a charge, and its sacks are not tracked to a number. Coarse stock is
  expected to arrive with `batch: null` and clubs into one figure. That is
  correct, not a gap.

So, first: answer these, with evidence rather than assumption.

1. Is `batch` currently populated on any row your script sends? How many of the
   137 rows carry one, and how many are null?
2. Does SAP track batch numbers on these items at all? In SAP Business One that
   is normally `OBTN` (the batch master) and `OBTQ` (batch quantities per item
   per warehouse), with `OITM.ManBtchNum` saying whether an item is batch-managed
   at all. Check which of the reclaim items have it switched on.
3. If batches are tracked, join them in so each row is per item **per batch** per
   warehouse, and the quantity is that batch's quantity — not the item total
   repeated against each batch, which is the mistake that shape invites and
   which would multiply the yard by the number of batches in it.
4. Confirm which items come back with batches and which do not, and say whether
   that split matches special-line-yes / coarse-no. If a coarse item turns out to
   be batch-managed in SAP, say so — the plant believes it is not, and if SAP
   disagrees somebody wants to know which is right.
5. Do the batch numbers in SAP look like the plant's own — 3140, 3142, H-3143?
   If SAP carries its own internal batch ids that are not what the shop floor
   writes on a sack, say what both look like. A number the yard cannot recognise
   is worse than no number.

Send that answer back before changing anything, then make the change.

## Part two — the dispatch feed

The managing director needs the last three months of dispatches, and they are to
come from SAP the same way stock does. This is a second document and a second
endpoint; do not put it in the stock one.

### Sitting one: find out what is there, and stop

Write `explore_dispatch.py`. It should:

* Find the tables that hold outbound deliveries and invoices. In SAP Business
  One that is normally:
  * `ODLN` / `DLN1` — delivery notes, header and lines.
  * `OINV` / `INV1` — A/R invoices, header and lines.
  * `ORDR` / `RDR1` — sales orders. Probably not what is wanted, but say whether
    the plant raises them.
  * `OCRD` — the business partner master, for the customer name.
  * `OITL` / `ITL1` — the batch/serial transaction log, which is how a delivery
    line is tied back to the batch it went out of.
* Report, for the last three months: how many delivery notes, how many invoices,
  and whether the two are one-to-one. **This is the question that decides the
  whole feed.** A plant that delivers and invoices separately will double-count
  its dispatches if both are read, and which one is "the dispatch" is a decision
  somebody here has to make with the numbers in front of them.
* Say whether a delivery line carries the batch it came out of, and how.
* Print twenty real rows of the most promising query, with real customer names,
  dates, grades, quantities and values.
* Say whether quantities are in kilograms, and whether the item on a delivery
  line is the same item code the stock feed sends.

**Stop there and hand that back.** Do not write the sync until somebody has
chosen between deliveries and invoices.

### Sitting two: the feed

Once that is settled, add `sap_dispatch_sync.py` — or a second mode on the
existing script, whichever you judge cleaner; say which and why.

Document shape, which mirrors the stock one on purpose so both ends have one
vocabulary:

```json
{
  "source": "SAP",
  "asOf": "2026-08-26T06:00:00+05:30",
  "from": "2026-05-26",
  "to": "2026-08-26",
  "rows": [
    {
      "docNo": "DN-2026-00841",
      "docType": "delivery",
      "docDate": "2026-08-24",
      "customer": "Some Rubber Works Pvt Ltd",
      "customerCode": "C00042",
      "sku": "RCL-FINE-50",
      "description": "Reclaim Rubber Fine 50kg",
      "grade": "Fine",
      "batch": "3140",
      "quantity": 4250.0,
      "unit": "kg",
      "value": 318750.0,
      "currency": "INR"
    }
  ]
}
```

* One row per **document line**, not per document. A delivery of three grades is
  three rows. Aggregated per document, the plant cannot ask what went out as
  Fine, which is most of what this is for.
* `docNo` and `docType` together identify it. Both, because a delivery and an
  invoice can share a number and mean different things.
* `grade` uses the same mapping table as the stock feed. One table, imported by
  both — two copies drift, and then the same item is Fine in one report and
  Medium in the other.
* `value` and `currency` are optional. Send them if the document carries them.
  If commercial values are something the plant does not want on this feed, say
  so and leave both out rather than sending zeros — a zero reads as a free
  delivery.
* `from` and `to` are the window the query covered, so the receiving end knows
  what it is being given rather than inferring it from the rows.

Post it to `POST /sync/sap-dispatch`, same base URL, same bearer token, same
retry rules and the same status-code meanings as the stock feed.

**Send the whole window every time, not just what is new.** Three months of
delivery lines is a small document, documents get cancelled and corrected after
the fact, and a feed that only ever appends carries every cancellation as a
delivery that still happened. Each post replaces the window.

Run it **once a day**, not every fifteen minutes. Dispatches are not a live
figure the way stock is, and a three-month window re-read every quarter hour is
load on somebody else's ERP for no gain.

## Things to get right in both

*Read-only.* `SELECT` and nothing else, exactly as before. That is another
company's live business system.

*Never send an empty document.* Same rule and same reason as the stock feed:
"no dispatches in three months" and "the query is broken" are the same document
and only one of them is a fact. Log it as a failed run and skip the post.

*Do not aggregate.* One row per line, as SAP holds it. The receiving end can add
it up and then explain its own total.

*Log what the API says it stored*, not just that you sent it — `data.rows` and
`data.totals` off the 201, beside your own count, so a mismatch is visible.

## What to hand back

From sitting one: the written answer on batches, and the written answer on
deliveries versus invoices with the counts behind it.

From sitting two: the script, and one real sample document with real numbers in
it so it can be checked against what the office knows went out.
