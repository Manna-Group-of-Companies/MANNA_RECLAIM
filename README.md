# Manna Reclaim

Production management for the reclaim plant, split into a React client and an Express API.

- `client/` - React 18 + TypeScript + Tailwind + Redux Toolkit + Axios. Holds **both** UIs:
  - **user side** (shop floor, ported from `index.html`) - the same eight tabs the prototype has:
    `/machines`, `/batches`, `/weigh`, `/packing`, `/dispatch`, `/quality`, `/history`, `/bearing`,
    plus `/reports` and `/settings`
  - **admin side** (back office, ported from `back.html`) - the prototype's six tabs plus two:
    `/admin/history`, `/admin/efficiency`, `/admin/rates`, `/admin/costing`, `/admin/maintenance`,
    `/admin/bearings`, and `/admin/dashboard`, `/admin/users`

The two sides look different on purpose. The shop floor is warm green for a tablet in a noisy
plant; the back office is the cooler, bluer palette of `back.html`, for a desk. Both prototypes
name their CSS variables the same, so the back-office set is redefined under `.back-office`
rather than at `:root`, and one app carries both looks without either bleeding into the other.
- `server/` - Node + Express (JavaScript, ESM) with config / env / controllers / routes / services / middlewares.
- `index.html`, `back.html` - the original single-file prototypes, kept as the reference for porting.

## Getting started

```bash
npm install                 # installs both workspaces
cp server/.env.example server/.env    # fill in SUPABASE_URL, a Supabase key and the JWT secrets
cp client/.env.example client/.env
npm run dev                 # API on :5000, client on :5173
```

The Vite dev server proxies `/api` to `http://localhost:5000`, so the browser stays on one origin
and the refresh-token cookie works without CORS exceptions.

## Layout

```
client/
  index.html                  Vite entry
  tailwind.config.js          design tokens taken from the prototypes
  src/
    main.tsx                  React root + redux Provider
    App.tsx                   session bootstrap + RouterProvider
    index.css                 index.html's stylesheet, ported class for class
    app/                      store.ts, rootReducer.ts, typed hooks.ts
    api/
      axiosClient.ts          instance, auth header, refresh-on-401, error mapper
      endpoints.ts            every server path in one object
      services/               one typed module per domain
    config/                   env.ts, constants.ts, paths.ts, icons.ts
    components/
      ui/                     Button, Badge, BottomSheet, Field, Pick, DataTable, StatTile...
      layout/                 UserLayout + Header + BottomTabs, AdminLayout + Sidebar + Topbar
    features/                 redux slices (auth, machines, runs, batches, dispatch,
                              quality, reports, maintenance, rates, ui) plus feature components
    pages/
      user/                   the eight shop-floor tabs, login and settings
      admin/                  dashboard, history, efficiency, rates, costing,
                              maintenance, bearings, users, login
    routes/                   router, userRoutes, adminRoutes, ProtectedRoute
    hooks/                    useToast, useTicker, useOnlineStatus
    types/                    models.ts (domain) and api.ts (envelope, paging)
    utils/                    cn, date, format, storage

server/
  .env / .env.example
  src/
    server.js                 listen + graceful shutdown
    app.js                    express app, middleware order, /health
    config/                   env.js, constants.js, logger.js,
                              supabase.js (PostgREST client), tables.js (table registry)
    routes/                   index.js mounts one router per domain
    controllers/              request/response only, no data access
    services/                 data access and business rules (base.service.js = CRUD factory)
    middlewares/              auth, role, validate, error, notFound, rateLimiter, requestLogger
    validations/              zod schemas used by the validate middleware
    utils/                    ApiError, ApiResponse, asyncHandler, jwt, pagination, shift
```

## The database

Supabase (Postgres) is the database. The shop-floor tablets have written to it all along, and the
API reads and writes the same project over PostgREST - there is no copy step and no second store.

```bash
cd server
npm run db:report              # every object, its row count and anything missing
npm run db:report -- --columns # with each object's columns
```

There is no connection to open: PostgREST is HTTP, so `isDbReady()` is only "are the URL and key
set". `src/config/supabase.js` is the whole driver - filters, paging, retries and the Postgres-error
mapping - and `src/config/tables.js` says what each table's key and writable columns are. There is
no schema restated in the server: types, defaults and uniqueness all live in Postgres itself.

The `*_costing`, `*_latest`, `*_efficiency` objects are Postgres **views**: the report and costing
services read them directly, so the figures are recomputed by the database on every request rather
than being a snapshot that has to be refreshed.

### One-time setup

Everything the plant records is already in the project. Two things are not, because the prototype
hard-coded them - accounts and the machine list - along with a handful of columns the API writes
that the tablets never created. Paste `supabase/schema.sql` into the Supabase SQL editor once:

```bash
cd server
npm run seed        # then load the starting accounts and the 14 machines
```

Until that runs, the API logs exactly what is missing at boot and serves the in-memory accounts and
machines from `config/devSeed.js` so the app still works. `users` holds bcrypt PIN hashes and is
closed to the anon key, so signing in against the real table needs `SUPABASE_SERVICE_KEY`.

## Request flow

```
route -> rateLimiter -> authenticate -> authorize -> validate(zod) -> controller -> service -> Supabase
                                                                          |
                                                          ApiResponse / ApiError -> errorHandler
```

Every response is `{ success, message, data, meta? }`; the axios layer unwraps `data` so slices
never see the envelope.

## What the shop-floor tabs write

| Tab | Reads | Writes |
| --- | --- | --- |
| Machines | `/machines/grouped`, `/runs/active`, `/maintenance?status=open`, `/maintenance/bearings/due` | `/runs/start`, `/runs/:id/stop`, `/runs/:id/pause`, `/maintenance`, `/maintenance/:id/resolve`, `DELETE /maintenance/:id`, `/maintenance/bearings` |
| Batches | `/batches/open`, `/runs/shift` | `/batches/:id/close` |
| Weigh | `/runs/pending-weigh` | `/runs/:id/weigh` |
| Packing | `/runs/pending-pack` | `/runs/:id/pack` |
| Dispatch | `/dispatches`, `/rates` | `/dispatches` |
| Quality | `/batches/open`, `/quality-tests`, `/quality-tests/summary` | `/quality-tests` |
| History | `/reports/filters`, `/runs?all=1&date=&shift=&batch=&machineId=` | `PATCH /runs/:id`, `DELETE /runs/:id` |
| Bearing | `/maintenance/bearings/due`, `/maintenance/bearings` | `/maintenance/bearings` |

Two rules the API enforces rather than the screen: a repair cannot be filed without all three
answers (cause, fix, prevention), and packing more sacks than there is material for is rejected
instead of being clamped, because that would quietly lose weight from the ledger.

## What the back-office tabs read

| Tab | Reads | Writes |
| --- | --- | --- |
| Overview | `/reports/dashboard`, `/maintenance?status=open`, `/maintenance/bearings/due` | - |
| History | `/reports/filters`, `/runs?date=&machineId=&shift=` | `PATCH /runs/:id`, `DELETE /runs/:id` |
| Efficiency | `/reports/shifts`, `/reports/shift-efficiency?date=&shift=` | `/reports/efficiency-notes` |
| Rates | `/rates/cost-rates`, `/rates` | `PUT /rates/cost-rates`, `PUT /rates` |
| Costing | `/reports/dashboard`, `/rates/cost-rates` (only once unlocked) | - |
| Maintenance | `/reports/downtime`, `/reports/downtime/detail` | `/maintenance/:id/resolve` |
| Bearings | `/maintenance/bearings/due`, `/maintenance/bearings` | - |
| Users | `/users` | `/users`, `PATCH /users/:id` |

### Costing: the passcode

The tab opens locked, as `back.html` had it — default `2525`, settable with `VITE_COSTING_PASSCODE`.
Nothing is fetched until it is unlocked, so the figures are not sitting in the page waiting to be
read out of the network tab, and a reload locks it again.

Treat it as a screen against onlookers, not access control: a Vite variable ships inside the
bundle, so anyone who can open the JS can read it. What actually keeps costing away from the shop
floor is the `adminOnly` check on `/reports/costing` and on the route.

### Efficiency: how "usual" is decided

The question this view answers is whether *this* shift is worse than the plant normally manages,
so every figure carries the plant's own baseline: the **median** of the same figure across every
shift on record. Medians, not means — one catastrophic shift (a burst pipe, a ten-hour power cut)
would drag a mean down for months and quietly stop flagging anything.

The thresholds live in `server/src/config/constants.js`: production per man-hour below 80% of
usual, kWh per kg above 125%, batch yield below 85%, utilisation under 70% of the 12-hour shift.
Every metric ships the arithmetic that produced it, so the screen shows its working rather than
asking anyone to trust a number, and a flagged card can be answered with a recorded reason.

This is computed server-side (`services/efficiency.service.js`) because the baselines need every
run ever logged — not something to send to a browser on the plant's connection.

## Roles

`worker` and `supervisor` use the shop-floor app. `manager` and `admin` additionally reach
`/admin/*`, enforced twice: `ProtectedRoute adminOnly` on the client and `adminOnly` middleware
on the server.

The role split is about which app you get, not about who may correct a run: `PATCH /runs/:id`
and `DELETE /runs/:id` are open to anyone signed in, because the crews find their own mistakes
first and used to have to wait on the office to put them right. What stands in for the check is
the History sheet — a correction shows the run time, energy and output it is about to save, and
a delete names the run and asks again before it goes.
