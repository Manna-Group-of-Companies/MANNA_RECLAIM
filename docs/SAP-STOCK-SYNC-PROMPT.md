# Prompt — SAP stock sync for MANNA RECLAIM

Paste everything below the line into Claude Code **on the plant server**, in an
empty folder you are happy to keep the script in.

It is written to be read by an agent that has never seen this plant, so it says
more than a person would need. That is deliberate: the one thing that must not
happen is a script that quietly reports the wrong stock, and most of the words
here are about how that would happen.

Two things to have ready before you paste it:

* `login.json` in that folder, holding the connection details for the Manna
  Rubber Products server. The prompt tells the script to read it and never to
  hard-code anything from it.
* Whether the plant server can reach `https://manna-reclaim.onrender.com`. It
  probably can, but the script has to work either way and the prompt says so.

**Run it in two sittings.** The first ends with a written description of what SAP
actually holds — nobody here knows yet, and a script written before that is a
guess. Send me that description and I will tell you the exact shape to post.
The second sitting turns the reader into the sync.

---

You are working on the plant-floor half of a stock sync. There is a second
system — MANNA RECLAIM, a rubber-reclaim plant management app — which until now
kept its own yard ledger from packing entries typed by supervisors. That has been
switched off: the plant is too busy to keep a bagging bench up to date, and the
figures had drifted. Stock will come from SAP instead, and this script is what
carries it.

Write a single Python script, `sap_stock_sync.py`, plus a `requirements.txt` and
a short `README.md`. Python 3.10 or newer. No frameworks.

## What it has to do

1. Connect to the Manna Rubber Products server using the details in
   `login.json`, which sits next to the script.
2. Read the current stock on hand.
3. Report it, in the shape given under **Output** below.
4. Be safe to run every fifteen minutes, unattended, for years.

## Phase one — find out what is there, and stop

Do not write the sync yet. Nobody on either side of this knows how SAP is laid
out here, and a script written against a guess is worse than no script: it will
run, it will report numbers, and nothing about it will look wrong.

So the first deliverable is `explore_sap.py` and a written answer. It should:

* Read `login.json` and connect. Support both of the shapes SAP Business One
  comes in and detect which this is rather than asking:
  * **SQL Server** — use `pyodbc` with the ODBC Driver 18 (fall back to 17), or
    `pymssql` if no driver is installed. Database names are usually like `SBO_*`.
  * **SAP HANA** — use `hdbcli`. Schema usually `SBO*` or the company db name.
  If `login.json` names a driver or dialect, honour it; otherwise try SQL Server
  first, since that is much the commoner on-premises deployment.
* List the tables that look like they carry stock, and for each one the row
  count and the column names. In SAP Business One the ones that matter are
  normally:
  * `OITM` — the item master. Item code, description, item group, UoM.
  * `OITW` — item per warehouse. `OnHand`, `IsCommited`, `OnOrder`.
  * `OWHS` — the warehouse list, so a code can be given a name.
  * `OBTN` / `OBTQ` / `OITL` / `OITT` — batch numbers and where they sit, if the
    plant tracks batches. Many do not.
  * `OINM` — the inventory transaction journal, if a movement history is wanted
    later. Not needed now.
  Do not assume these exist. List what is actually there and say which of the
  above you found.
* Print twenty sample rows of the most promising stock query, with real values.
* Say plainly, in the written answer:
  * Which tables and columns hold on-hand quantity.
  * What the unit of measure is, per item, and whether it is consistent.
  * Whether stock is tracked by batch, by warehouse, by both, or by neither.
  * Whether there is a "reclaim" item group or naming convention that separates
    what this plant makes from everything else Manna Rubber Products holds.
  * How many distinct items carry a non-zero on-hand quantity.
  * Anything that looks like a duplicate, a negative quantity, or a unit that
    changes between rows for the same item. These are the things that will make
    the sync wrong later, and they are much easier to see now.

**Stop there and hand that back.** Do not carry on to phase two until somebody
has read it and told you the target shape.

While exploring, use read-only credentials if `login.json` offers them, and
never issue anything but `SELECT`. This is a live business system belonging to
another company in the group. Nothing in this task requires a write of any kind,
so a write is a bug however it got there.

## Phase two — the sync itself

Once the shape is known, `sap_stock_sync.py` should:

**Read** the on-hand stock in one query where possible. If items and batches
need two, do two, but do not query per item in a loop — an item-at-a-time loop
over a live ERP is how a fifteen-minute job becomes a forty-minute one and starts
overlapping itself.

**Map** each row into this shape, which is what the receiving end will take:

```json
{
  "source": "SAP",
  "asOf": "2026-08-25T11:30:00+05:30",
  "rows": [
    {
      "sku": "RCL-FINE-50",
      "description": "Reclaim Rubber Fine 50kg",
      "grade": "Fine",
      "batch": "3140",
      "warehouse": "FG01",
      "quantity": 4250.0,
      "unit": "kg"
    }
  ]
}
```

* `sku` is SAP's own item code, and it is the key. Never invent one.
* `grade` maps SAP's item to what this plant calls a grade. The plant's grades
  are exactly: `Special`, `SuperFine`, `Fine`, `Medium`, `DRC`, `Special DRC`,
  `Coarse`, `Sillsheet`. Put the mapping in a table at the top of the file, one
  line per SAP item code or pattern, so it can be corrected by somebody who
  knows the plant and not only by somebody who knows Python. An item that maps
  to nothing keeps `grade: null` and is still sent — a grade nobody has mapped
  is a thing to fix, and dropping the row hides it.
* `quantity` is a number, never a string, and it is in `unit`. If SAP holds a
  different unit for the same material in different rows, convert to kilograms
  and say so in the README, rather than sending a mixture. Reclaim is sold by
  weight; moulded goods are counted in pieces and keep `unit: "pieces"`.
* `batch` and `warehouse` are null where SAP does not track them. Null is a
  real answer and different from an empty string.
* `asOf` is when the read happened, with a timezone. Not the time it was sent.

**Send** it. Two destinations, and the script decides by what is configured:

* If `login.json` (or a second `target.json` — your choice, say which in the
  README) holds an API base URL and a token, POST the document as JSON with the
  token as `Authorization: Bearer <token>`. Retry on a network failure and on a
  5xx: three attempts, backing off 2s, 8s, 30s. Do not retry a 4xx — that is the
  document being wrong, and sending it again will not fix it.
* Otherwise write it to `out/stock-<timestamp>.json`, and keep the last 200
  files. This is the mode to develop in, and it is also the fallback if the
  plant server cannot reach the internet.

Write both from the start. The file mode is what makes this testable without
touching either live system.

**Be honest when it fails.** Log to `logs/sap_stock_sync.log`, rotating, keeping
30 days. Every run logs one line saying what happened: how many rows, how many
kilograms, how long the query took, and where it went. A run that read nothing
logs a warning and **does not send an empty document** — an empty stock report
and a failed connection look identical downstream, and "the yard is empty" is a
sentence that must never be said by accident. Exit non-zero on failure so a
scheduler can see it.

**Never crash the plant's ERP.** One connection, opened and closed per run. A
query timeout of 60 seconds. If a run is still going when the next is due, the
new one exits immediately rather than piling up — a lock file next to the script
is enough.

## Things worth getting right

*Do not filter to "reclaim items" by a hard-coded list of item codes.* Use the
item group or a naming convention if there is one, and put whichever you choose
in one named constant at the top with a comment saying what it means. A new
product added in SAP next year must appear here without anybody editing Python.

*Do not aggregate before sending.* Send the rows as SAP holds them — per item,
per batch, per warehouse. The receiving end can add them up and can then explain
its own totals. A script that sends pre-totalled figures makes every later
disagreement unanswerable.

*Do not deduplicate silently.* If two rows come back for the same item, batch
and warehouse, that is a fact about the query, and either the query is wrong or
SAP holds it twice. Log it, send both, and say so in the README.

*Zero is a row.* An item that had stock yesterday and none today must be sent
with `quantity: 0`, not left out. Left out, it reads as "no news" and the last
figure stands for ever. If the query naturally drops zero rows, add the items
that were non-zero on the previous run back in at zero.

## What to hand back

At the end of phase two: the script, `requirements.txt`, and a README that says
how to install it, how to schedule it (Windows Task Scheduler or cron, whichever
the server runs), what `login.json` must contain, and — the important part —
what the grade mapping is and how to change it.

Also print one sample of the real output document, with real numbers in it, so
it can be checked against what the yard actually holds before anything is
believed.
