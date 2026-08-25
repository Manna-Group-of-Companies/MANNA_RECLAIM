# What the sync costs the plant server, and how to keep it cheap

Written after the plant server chose the **SAP Business One Service Layer**
rather than a direct SQL connection. That was the right call — it needs no
database credentials and no ODBC driver, and it cannot write by accident — but
it behaves differently from the direct-SQL shape the first prompt assumed, and
the differences are all in how it behaves over months rather than in one run.

## The shape of it

Three machines, and only one of them is doing any work.

```
 plant server              SAP B1 server                  the internet
 ────────────              ─────────────                  ────────────
 python script  ──HTTPS──▶ Service Layer :50000
                           └─▶ SQL Server / HANA
                ◀─JSON────

                ──HTTPS──▶ manna-reclaim.onrender.com ──▶ Supabase
```

The Python process reads, reshapes and posts. It holds one snapshot in memory,
writes a log line, and exits. It is a courier, not a workload — which is why the
answer to "how big a machine" is almost always "the one you already have".

## What one run actually does

For the stock feed, every fifteen minutes:

| | |
|---|---|
| Process lifetime | a few seconds |
| Peak memory | 40–80 MB, most of it the Python interpreter itself |
| CPU | a fraction of one core, briefly |
| Data off SAP | 137 rows — tens of kilobytes |
| Data to Render | one JSON document, 30–50 KB |
| Disk written | one log line; ~2–5 MB of rotating logs over 30 days |

The dispatch feed is larger — three months of delivery lines rather than a
current-stock snapshot — but it runs **once a day**, so its cost per day is
smaller than the stock feed's.

## How much capacity

If the machine already runs SAP Business One, or is any office PC of the last
decade, it is enough. Concretely, the floor is about:

* **2 GB RAM free** — the script wants well under a tenth of that; the headroom
  is so a run never has to compete with whatever else the machine does.
* **1 GB disk** for the script, its logs and its `out/` files. Far more than
  needed, and cheap insurance against the one failure mode that fills a disk:
  an error loop writing a log line per second.
* **A stable network path** to both SAP and the internet. This matters more than
  CPU or memory, and it is the thing that actually fails.

What matters far more than the specification:

* **The machine must not sleep or hibernate.** A scheduled task on a sleeping
  workstation does not run, and nothing anywhere says so — the app just shows
  stock getting steadily older. If this is a desktop rather than a server, set
  it never to sleep, and set the scheduled task to *Run whether user is logged
  on or not*.
* **It must survive a reboot** without somebody logging in. Same setting.

## The one real hazard: leaked sessions

This is the part worth reading twice, because it is the way a small scheduled
job takes a business system down.

Service Layer works on sessions. `POST /b1s/v1/Login` hands back a `B1SESSION`
cookie; the session lives for about 30 minutes by default, and Service Layer
holds a finite number of them. A script that logs in every fifteen minutes and
never logs out leaves a session behind on every run — four an hour, ninety-six a
day, each sitting there for half an hour. Depending on how the installation is
licensed and configured, those accumulate against the same pool real people log
in through.

The failure it produces is the worst kind: nothing goes wrong with the sync at
all. It keeps working perfectly, and one morning somebody in accounts cannot log
into SAP.

So the script must:

* **Call `POST /b1s/v1/Logout` at the end of every run**, in a `finally` block so
  it happens on the failure path too. The failure path is the one that leaks,
  because that is the run that did not reach the tidy line at the bottom.
* **Log in once per run, not once per request.** One session, used for however
  many queries the run needs, then closed.
* **Not hold a session between runs.** Fifteen minutes is longer than the work,
  and a session parked across the gap is a session that outlives a crash.

If sessions are ever suspected of piling up, the count is visible on the SAP
server — ask the B1 administrator to check the Service Layer session table
rather than guessing.

## The second one: page size

Service Layer paginates OData results, and the default page is **20 rows**. A
137-row stock read is therefore seven round trips unless the script says
otherwise — and, worse, a script that does not follow the `@odata.nextLink` gets
the first twenty rows and reports them as the whole yard. That is a wrong figure
that looks entirely correct.

Two ways to handle it, and the script should do one of them explicitly rather
than by accident:

* Send `Prefer: odata.maxpagesize=1000` on the request, or
* Follow `@odata.nextLink` until it stops coming.

Following the link is the safer of the two: it is right whatever the page size
turns out to be, including after somebody changes it on the server.

## What to watch, and where

* **`logs/sap_stock_sync.log` on the plant server** — one line per run. This is
  the first place to look and usually the last.
* **The Stock tab in the app** — it prints how old the reading is, and shouts
  once that passes six hours. That is the check somebody makes without meaning
  to.
* **Windows Task Scheduler → the task's History tab** — shows whether the task
  fired at all, which the script's own log cannot, because a run that never
  started writes nothing.

The three answer different questions: the log says the run failed, the app says
the runs stopped, and Task Scheduler says why nothing ran.

## What it costs the SAP server

Small, and worth stating plainly since it is somebody else's system: a read of
current stock every fifteen minutes, and a read of three months of delivery
lines once a day. No writes, ever. The load is comparable to one person
refreshing a stock report, except that it happens on a schedule and never
double-clicks.

The thing that would change that is a per-item loop — a query per item code
rather than one query for all of them. At 137 items that is 137 round trips
every fifteen minutes instead of one, and it is how a courier turns into a
workload. The prompt says not to; it is worth checking the script does not.
