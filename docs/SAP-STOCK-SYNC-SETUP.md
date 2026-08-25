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

## Two things that still have to happen

**Migration `0020_sap_stock.sql` has to be applied**, along with the four still
outstanding. `APPLY-PENDING-MIGRATIONS.sql` in the project root covers the
earlier four; `supabase/migrations/0020_sap_stock.sql` is the new one. Paste both
into the Supabase SQL editor. Without it the sync answers 500 and nothing lands.

**Render has to redeploy.** The endpoint is in the code as of this commit and
not on the running service until it does.
