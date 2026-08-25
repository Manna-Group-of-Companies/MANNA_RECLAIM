# SAP stock sync — what to give the plant server

The receiving end is built. This is the half you hand over.

## The three answers it is asking for

**API base URL**

```
https://manna-reclaim.onrender.com/api/v1
```

**Endpoint path** — `POST`, JSON body, and it is under `/sync`, not `/stock`:

```
POST https://manna-reclaim.onrender.com/api/v1/sync/sap-stock
```

**Token** — sent as a bearer:

```
Authorization: Bearer <the token>
```

Generate the token yourself rather than using one out of a document; anything
that has been in a chat window is not a secret any more. On the plant server, or
anywhere with Node:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

or with Python, which the plant server certainly has:

```
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

That one value goes in **two** places and nowhere else:

1. **On Render** — Dashboard → the `manna-reclaim` service → Environment → Add
   Environment Variable → `SAP_SYNC_TOKEN` = the value. Save. Render restarts
   the service, which takes a minute or two.
2. **On the plant server** — in the config the sync script reads. Tell the
   server-side Claude to keep it in `target.json` beside `login.json` rather
   than in the script, and to add both to `.gitignore` if that folder is ever
   put under git.

Until `SAP_SYNC_TOKEN` is set on Render the route answers **503** with a message
naming that variable — not 401. That is deliberate: answered 401, whoever is
standing at the plant server goes hunting for a typo in a token that was never
the problem.

## What to paste back to the server-side Claude

> The MANNA RECLAIM API is at `https://manna-reclaim.onrender.com/api/v1`.
>
> Post the stock snapshot to `POST /sync/sap-stock` with the token as
> `Authorization: Bearer <token>`, `Content-Type: application/json`. Keep the
> base URL and the token in `target.json` next to `login.json`, never in the
> script.
>
> The body is exactly the document shape from the original prompt:
>
> ```json
> {
>   "source": "SAP",
>   "asOf": "2026-08-25T06:00:00+05:30",
>   "rows": [
>     {
>       "sku": "RCL-FINE-50",
>       "description": "Reclaim Rubber Fine 50kg",
>       "grade": "Fine",
>       "batch": "3140",
>       "warehouse": "FG01",
>       "quantity": 4250.0,
>       "unit": "kg"
>     }
>   ]
> }
> ```
>
> What the API does with each answer, so the retry logic is right:
>
> * **201** — stored. The body says how many rows and what they came to; log
>   those figures, not just "sent".
> * **422** — the document is the wrong shape, and the message says which field.
>   Do not retry; it will fail identically.
> * **400** — the document is well-formed and wrong. Two cases, both worth
>   stopping on: an empty `rows`, and the same `sku` twice for the same batch and
>   warehouse. Do not retry either.
> * **401 / 403** — the token is missing or wrong. Do not retry.
> * **503** — the token is not configured on the API yet. Retry on the next
>   scheduled run, not immediately.
> * **5xx or a network failure** — retry three times, backing off 2s, 8s, 30s,
>   then give up until the next scheduled run.
>
> The API refuses an empty snapshot rather than storing one. Do not work around
> that by sending a placeholder row — a read that found nothing is a failed run,
> and it should be logged as one and skipped.
>
> Each snapshot replaces the last one entirely. There is no partial update, so
> send the whole yard every time.
>
> Schedule it every 15 minutes with Windows Task Scheduler: run whether or not
> the user is logged on, with highest privileges, "start in" set to the script's
> folder, and the action `python.exe` with the full script path as the argument.
> Set it to stop the task if it runs longer than 10 minutes.

## The 201 response body

```json
{
  "success": true,
  "message": "Stored 137 stock rows",
  "data": {
    "syncId": "6f2a1c9e-...",
    "asOf": "2026-08-26T00:30:00+00:00",
    "receivedAt": "2026-08-26T00:31:12.482+00:00",
    "rows": 137,
    "totals": {
      "rows": 137,
      "byUnit": { "kg": 109023 }
    }
  }
}
```

Everything worth logging is under `data`:

* `data.rows` — how many rows the API actually stored. Log this beside the
  count the script sent; if they differ, something was dropped and the run is
  worth looking at.
* `data.totals.byUnit` — what those rows came to, **per unit**. A map, not a
  number: reclaim is kilograms and moulded goods are pieces, and one figure over
  the two would make the script's own total disagree on every run with a press
  lot in it — which reads as the sync being broken when what is broken is the
  arithmetic it is being checked against. Compare per key.
* `data.syncId` — the snapshot's id. Worth logging: it is what a question about
  a particular run is asked with.
* `data.asOf` — the `asOf` that was sent, **normalised by Postgres to UTC**. The
  instant is the one the script sent; the text is not, so compare it as a
  timestamp rather than as a string. `+05:30` in, `+00:00` out, same moment.
* `data.receivedAt` — when the API took it, which is not when SAP was read.

A non-201 answers the same envelope with `success: false` and a `message`
saying what was wrong. Log the message, not just the code — a 400 saying "the
snapshot has RCL-FINE-50 twice" is a query to go and fix, and a 400 saying the
snapshot was empty is a failed read.

## Checking it worked

From any machine, with the token:

```
curl -i -X POST https://manna-reclaim.onrender.com/api/v1/sync/sap-stock ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"asOf\":\"2026-08-25T06:00:00+05:30\",\"rows\":[{\"sku\":\"TEST-1\",\"grade\":\"Fine\",\"quantity\":1,\"unit\":\"kg\"}]}"
```

`201` means it is through. Then open **Stock** in the app — the panel at the top
says "from SAP · read …" with that one test row under it. Send the real snapshot
and it replaces the test.

If the panel says the figures are more than six hours old, it is telling you the
scheduled job has stopped: the sync runs every fifteen minutes, so six hours is
two dozen missed runs, and stale stock looks exactly like stock unless something
says so.

## One thing left: the token

Checked on 26 August 2026:

* **The migrations are applied.** All five - 0015, 0017, 0018, 0019 and 0020 -
  are on the live database, and the four new tables were checked column by
  column against what the API expects. That matters more than it sounds:
  PostgREST silently drops a write to a column it cannot see, so a table that is
  nearly right stores nothing and answers 201 while doing it.
* **Render is deployed.** `POST /api/v1/sync/sap-stock` answers rather than
  404ing.
* **`SAP_SYNC_TOKEN` is not set.** The route says so itself, in as many words:

  ```
  503  This endpoint is switched off: SAP_SYNC_TOKEN is not set on the API.
  ```

### Where exactly

1. Sign in at **dashboard.render.com**.
2. Click the **`manna-reclaim`** service — the web service running the API, not
   a static site. If more than one is listed, it is the one whose URL is
   `manna-reclaim.onrender.com`.
3. **Environment** in the left sidebar.
4. Under **Environment Variables**, press **Add Environment Variable**.
5. **Key**: `SAP_SYNC_TOKEN` — capitals and underscores, exactly. Render does
   not correct the case, and `Sap_Sync_Token` is a different variable that the
   API will never read.
6. **Value**: the token the plant server generated. It is in `target.json` in
   the sync script's folder. Paste it with no quotes around it and no space
   before or after - Render keeps whatever is pasted, and a trailing space
   makes the comparison fail with a 403 that looks exactly like a wrong token.
7. **Save Changes**.

Saving redeploys the service by itself; that takes a couple of minutes. Wait
until the service shows **Live** before re-running the sync.

There is no `render.yaml` in this repository, so the dashboard is the only
place this is configured - nothing to commit and nothing to push.

The variable is listed in `server/.env.example` for anyone running the API
locally. That file is documentation; the real value belongs in `server/.env`,
which is not committed.

After that, what each answer means from the plant server:

* **503** naming `SAP_SYNC_TOKEN` - the variable is still not set, or the
  service has not finished restarting.
* **403** - it is set, and it is not the same string the script is sending.
  Check for a trailing space or newline at either end.
* **500** - would have meant the tables were missing. They are not, so a 500
  now is something else and worth sending back here.
* **201** - through.
