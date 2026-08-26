# Prompt — run both SAP syncs and report back

For a fresh Claude on the plant server, after the previous session was closed.
It has no memory of the earlier work, so this says where everything is and what
it is for.

Open Claude Code in the folder holding `sap_stock_sync.py`, and paste everything
below the line.

---

You are on the Manna plant server. Two Python scripts in this folder were
written in an earlier session and are finished and tested; nothing needs
building. They feed a second system, MANNA RECLAIM, which is the plant's own
management app.

* `sap_stock_sync.py` — reads current on-hand reclaim stock from SAP Business
  One via the Service Layer and posts it. Meant to run every 15 minutes.
* `sap_dispatch_sync.py` — reads the last three months of dispatch documents
  (invoices; this install raises no delivery notes) and posts them. Meant to run
  once a day.
* `login.json` — the SAP connection details.
* `target.json` — the MANNA RECLAIM API base URL and the bearer token.

Read all four before running anything, so you know what they do rather than
assuming from the names.

## The receiving end is ready — this was the blocker and it is cleared

As of now, confirmed from the other side:

* `https://manna-reclaim.onrender.com/api/v1` is deployed and current.
* `POST /api/v1/sync/sap-stock` and `POST /api/v1/sync/sap-dispatch` both exist.
  An unauthenticated POST to either returns `401 "Send the sync token as:
  Authorization: Bearer <token>"`, and a wrong token returns `403 "That sync
  token is not the one."` — so the gate is live and comparing.
* The database tables are in place and empty. Nothing has been posted yet.

Earlier sessions saw `404` and then `503` from these routes. Both are fixed. If
you see either again, stop and say so rather than working around it — they mean
the deploy or the token has gone backwards, and neither is fixable from here.

## What to do

**1. Run `sap_stock_sync.py` once, in the foreground, and watch it.**

Expect `201`. The body looks like:

```json
{
  "success": true,
  "message": "Stored 137 stock rows",
  "data": {
    "syncId": "…",
    "asOf": "2026-08-26T…",
    "receivedAt": "2026-08-26T…",
    "rows": 137,
    "totals": { "rows": 137, "byUnit": { "kg": 109023 } }
  }
}
```

**2. Run `sap_dispatch_sync.py` once, the same way.**

Same shape, plus `data.window` — the `from`/`to` the query covered. The last
session read 119 in-scope lines off 100 invoices.

**3. Confirm the schedule is registered**, since these are meant to run
unattended. Check Windows Task Scheduler for both tasks, and report whether they
exist, when each last ran, and what result it reported. If either is missing,
create it:

* stock — every 15 minutes
* dispatch — once a day
* both — *Run whether user is logged on or not*, highest privileges, "Start in"
  set to this folder, and stop the task if it runs longer than 10 minutes

## What to report back

For each script:

* The HTTP status.
* **`data.rows` from the API beside the number of rows your script sent.** If
  they differ, something was dropped — say so plainly rather than reporting
  success.
* `data.totals.byUnit` beside your own per-unit totals. Compare per unit; never
  add kilograms to pieces.
* `data.syncId`, so a question about that particular run can be asked later.
* For dispatch, `data.window` beside the window you queried.

If anything is not 201, report the status **and the message** — the message is
written to say what to do, and the code alone is not:

| | |
|---|---|
| **422** | wrong shape; the message names the field. Do not retry. |
| **400** | well-formed and wrong — an empty `rows`, or the same item twice on one document/batch. Do not retry. |
| **401 / 403** | token missing or wrong. Do not retry. |
| **503** | the token is not configured on the API. Should not happen now. |
| **5xx / network** | retry 3×, backing off 2s / 8s / 30s. |

## Two things to check while you are in there

**Does the script log out of the Service Layer?** It must call
`POST /b1s/v1/Logout` in a `finally` block, so it happens on the failure path
too. Service Layer sessions last about 30 minutes and are finite; a script that
logs in every 15 minutes and never logs out leaves ~96 a day behind, against the
same pool people log in through. The failure that produces is the worst kind:
the sync keeps working perfectly and one morning somebody in accounts cannot get
into SAP. If the logout is missing or only on the happy path, fix it and say so.

**Does it follow `@odata.nextLink`?** The Service Layer default page is 20 rows.
A script that stops at the first page reads 20 of 137 and reports them as the
whole yard — a wrong figure that looks entirely correct. It read 137 last time
so it is probably handling this, but confirm which way: following the link, or
setting `Prefer: odata.maxpagesize`. Following the link is safer, because it
stays right if somebody changes the page size on the server.

Do not change anything else. `SELECT`-equivalent reads only — this is another
company's live business system and nothing here needs a write.
