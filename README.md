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
cp server/.env.example server/.env    # fill in MONGODB_URI and the JWT secrets
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
    config/                   env.js, constants.js, logger.js, db.js (mongoose connection)
    models/                   mongoose schemas, one file per domain + index.js registry
    routes/                   index.js mounts one router per domain
    controllers/              request/response only, no data access
    services/                 data access and business rules (base.service.js = CRUD factory)
    middlewares/              auth, role, validate, error, notFound, rateLimiter, requestLogger
    validations/              zod schemas used by the validate middleware
    utils/                    ApiError, ApiResponse, asyncHandler, jwt, pagination, shift
```

## Copying the Supabase data into Mongo

The prototypes wrote to Supabase (Postgres) over PostgREST. `server/scripts/migrate-supabase-to-mongo.js`
pulls every object into MongoDB, one collection per object, keeping the same name:

```bash
cd server
npm run migrate:supabase -- --dry-run     # read and count, write nothing
npm run migrate:supabase                  # replace each collection with the Supabase rows
npm run migrate:supabase -- --tables-only # skip the derived views
npm run migrate:supabase -- --only=runs,shifts
```

It needs `SUPABASE_URL` plus `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_KEY` once RLS is on) in
`server/.env`. Rows are stored exactly as PostgREST returns them - no type coercion - so timestamps
stay ISO strings rather than becoming BSON dates. A row with a unique scalar `id` gets it as `_id`,
which makes the copy re-runnable; each run replaces the collection unless you pass `--keep`.

The 17 `*_costing`, `*_latest`, `*_efficiency` and similar objects are Postgres **views** - Mongo has
no equivalent, so what lands there is a snapshot, not something that recomputes. Anything that must
stay live has to be rebuilt as an aggregation pipeline against the source collections.

## Request flow

```
route -> rateLimiter -> authenticate -> authorize -> validate(zod) -> controller -> service -> mongoose
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
| History | `/runs/shift` | - |
| Bearing | `/maintenance/bearings/due`, `/maintenance/bearings` | `/maintenance/bearings` |

Two rules the API enforces rather than the screen: a repair cannot be filed without all three
answers (cause, fix, prevention), and packing more sacks than there is material for is rejected
instead of being clamped, because that would quietly lose weight from the ledger.

## What the back-office tabs read

| Tab | Reads | Writes |
| --- | --- | --- |
| Overview | `/reports/dashboard`, `/maintenance?status=open`, `/maintenance/bearings/due` | - |
| History | `/reports/filters`, `/runs?date=&machineId=&shift=` | - |
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
