# Manna Reclaim

Production management for the reclaim plant, split into a React client and an Express API.

- `client/` - React 18 + TypeScript + Tailwind + Redux Toolkit + Axios. Holds **both** UIs:
  - **user side** (shop floor, ported from `index.html`) at `/machines`, `/batches`, `/weigh`, `/dispatch`, `/history`, `/reports`
  - **admin side** (back office, ported from `back.html`) at `/admin/dashboard`, `/admin/history`, `/admin/efficiency`, `/admin/rates`, `/admin/costing`, `/admin/maintenance`, `/admin/bearings`, `/admin/users`
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
    index.css                 tailwind layers and shared component classes
    app/                      store.ts, rootReducer.ts, typed hooks.ts
    api/
      axiosClient.ts          instance, auth header, refresh-on-401, error mapper
      endpoints.ts            every server path in one object
      services/               one typed module per domain
    config/                   env.ts, constants.ts, paths.ts
    components/
      ui/                     Button, Card, Badge, BottomSheet, Modal, DataTable, StatTile...
      layout/                 UserLayout + Header + BottomTabs, AdminLayout + Sidebar + Topbar
    features/                 redux slices (auth, machines, runs, batches, dispatch,
                              reports, maintenance, rates, ui) plus feature components
    pages/
      user/                   the six shop-floor tabs, login and settings
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

## Roles

`worker` and `supervisor` use the shop-floor app. `manager` and `admin` additionally reach
`/admin/*`, enforced twice: `ProtectedRoute adminOnly` on the client and `adminOnly` middleware
on the server.
