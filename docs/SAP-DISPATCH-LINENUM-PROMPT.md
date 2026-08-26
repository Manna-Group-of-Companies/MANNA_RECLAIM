# Prompt — send `lineNum`, log the syncId, re-run dispatch

For the Claude on the plant server, after the dispatch run came back 400.

Two small edits and a re-run. Paste everything below the line.

---

You are on the Manna plant server, in the folder holding `sap_stock_sync.py` and
`sap_dispatch_sync.py`. Your last session ran both: stock returned 201 and
matched, dispatch returned 400 with

> invoice 149 has I-10061 twice against the same batch

You investigated that properly and were right on every point — it is real data,
not a script bug: DocEntry 1931 genuinely carries item I-10061 on two lines,
2000 kg and 1000 kg, and no invoice line on this install carries a batch.

**The receiving API was wrong, and has been fixed.** It keyed a dispatch line on
document + item + batch, which on this install cannot tell two lines of the same
item apart. It now accepts and keys on SAP's own line number. Three things to do.

## 1. Send `lineNum` on every dispatch line

Add it to each row of the document `sap_dispatch_sync.py` posts:

```json
{
  "docNo": "149",
  "lineNum": 0,
  "docType": "invoice",
  "docDate": "2026-06-18",
  "…": "…"
}
```

It is `INV1.LineNum` — SAP's own line number within the document, which the
Service Layer exposes as `LineNum` on each entry of `DocumentLines`. Send it as
an integer, on every line, including documents that only have one. It is the
only thing that tells two lines of the same item apart, so a document with a
repeated item cannot be stored without it.

Do not invent it, do not use the array index of your own list, and do not fall
back to a counter if it is missing — if `LineNum` is absent on a line, say so
and stop, because a made-up line number would store two real lines as one or one
line as two and nothing downstream could tell.

## 2. Log the syncId and asOf

`log_send_confirmation()` logs `data.rows` and `data.totals` from the response
and drops `data.syncId` and `data.asOf`, which the API also returns. There is
currently no record anywhere of which sync a given run produced, so a question
in three months about a particular figure has nothing to join on.

Add both to the same line. Something like:

```python
log.info(
    "stored %s rows, %s, syncId=%s, asOf=%s",
    data["rows"], data["totals"]["byUnit"], data["syncId"], data["asOf"],
)
```

Do it for both scripts — stock has the same gap.

## 3. Re-run the dispatch sync

```
python sap_dispatch_sync.py
```

Expect `201`. The last read was 122 in-scope lines off 100 invoices in a 90-day
window, so `data.rows` should be about that. Report:

* the status,
* `data.rows` beside the count you sent — if they differ, say so rather than
  reporting success,
* `data.totals.byUnit` beside your own per-unit totals,
* `data.window` beside the window you queried,
* `data.syncId`.

If it comes back 400 again, send the message verbatim. The wording changed with
the fix and now names what to do, so the new message will say something
different from the old one.

## Do not create the scheduled tasks

Your last session was right to stop there, and the classifier was right to block
it: registering a SYSTEM-level, highest-privilege, run-whether-logged-on task is
persistence-establishing and belongs to whoever owns the machine. It is being
done by hand from an Administrator prompt. Leave it alone.

## And one thing to report, without changing anything

The stock feed landed 137 rows and 18,342 kg of it carries no grade — the
third-largest holding on the plant. All three items are mesh-graded crumb:

```
I-10066  Powder of Hardened Rubber From Scrap -20 Mesh   12,202 kg
I-10068  Powder of Hardened Rubber From Scrap -40 Mesh    4,290 kg
I-10067  Powder of Hardened Rubber From Scrap -30 Mesh    1,850 kg
```

The plant's grade list has no name for mesh-graded crumb, so the mapping table
leaves them null and the app shows them as unmapped — deliberately, since
hidden they would be eighteen tonnes that silently do not exist.

Separately, the feed is sending both `SuperFine` and `SuperFine (Special)` as
grades — 14,150 kg and 24,088 kg. If those are two names for one thing they will
total separately on every screen.

For both, report rather than decide:

* What SAP's item group and description say about each of the three mesh items,
  and whether SAP treats them as one family or three.
* Which SAP items your mapping table currently sends as `SuperFine` and which as
  `SuperFine (Special)`, and what SAP calls each.

Do not change the mapping. Somebody at the plant has to say what these are
called, and that is not a decision to make from the item master.
