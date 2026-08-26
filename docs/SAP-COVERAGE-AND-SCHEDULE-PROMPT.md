# Prompt — cover both feeds up to today, and get the schedule running

Two things: the dispatch window stops seven weeks short of today and nobody
knows why yet, and neither feed is on a schedule so both only move when somebody
runs them by hand.

Paste everything below the line into Claude on the plant server.

---

You are on the Manna plant server, in the folder holding `sap_stock_sync.py` and
`sap_dispatch_sync.py`. Both work: stock posted 137 rows / 109,023 kg, and
dispatch posted 119 lines / 373,205 kg / ₹1,36,40,572 after `lineNum` was added.
Nothing is broken. Two things are unfinished.

## 1. The dispatch window stops on 8 July, and it should reach today

The 119 lines that landed span **28 May to 8 July 2026**, and they were read on
**26 August**. That is seven weeks at the end of a ninety-day window with no
dispatch in it at all.

That is either true or a bug, and the two look identical from this end. Find out
which, read-only, before changing anything:

1. Query SAP directly for invoices dated after 8 July 2026. How many are there,
   and what do they total? If the answer is none, the plant genuinely stopped
   invoicing and everything below is moot — say so and stop.
2. If there are invoices after 8 July, work out why the sync did not send them.
   The likely candidates, in the order worth checking:
   * A `$filter` on `DocDate` that is being compared against the wrong field, or
     as a string rather than a date.
   * Pagination stopping early — you follow `@odata.nextLink`, but confirm it is
     followed on *this* query and not only on the stock one, and that no
     `$top` caps it.
   * An item-group filter that excludes what the plant has been shipping
     recently. If the mix changed in July, a filter that was right in May can
     silently drop everything since.
   * The window being computed from something other than today — a hard-coded
     end date, or a date arithmetic bug.
3. Say which it was, with the evidence, then fix it.

**Both feeds must reach today.** For dispatch that means the window ends on the
day the script runs, not on a date fixed when it was written. For stock it
already does, being a snapshot of now — but confirm nothing in it is pinned to a
date either.

Re-run dispatch once fixed. Expect `data.window.to` to be today's date and the
newest `docDate` in the rows to be within days of it.

## 2. Neither feed is on a schedule

The database has exactly two runs, both the ones you started by hand. On a
fifteen-minute schedule there would be dozens. The scheduled tasks were never
created — your earlier session was blocked from registering them, correctly:
a SYSTEM-level, highest-privilege, run-whether-logged-on task is
persistence-establishing and is not something an agent should register
unattended.

So do not try to create them. Instead:

* Check whether they exist now, in case somebody has added them since:
  `schtasks /query /fo LIST /v | findstr /i "MANNA SAP"`
* If they do, report the last run time and last result for each, and whether the
  result codes indicate success.
* If they do not, **print the exact commands to create them**, filled in with
  the real folder path and the real Python launcher path on this machine, ready
  for a person to paste into an Administrator PowerShell. Do not run them.

The shape they should have:

* stock — every 15 minutes
* dispatch — once a day, early morning
* both — run whether the user is logged on or not, highest privileges, working
  directory set to this folder, and stopped if a run exceeds 10 minutes

The working directory is the part that gets missed. A scheduled task starts in
`System32` by default, so a script reading `login.json` and `target.json` by
relative path finds neither and exits — and the task history records that as a
completed run. That failure looks exactly like success, which is why the command
you print must set it explicitly.

## What to report

1. Whether SAP has invoices after 8 July, and how many.
2. If it does: what was dropping them, and the dispatch re-run result — status,
   `data.rows` beside your own count, `data.window`, `data.syncId`.
3. The scheduled task status, or the exact commands for a person to run.

Read-only against SAP throughout, as before.
