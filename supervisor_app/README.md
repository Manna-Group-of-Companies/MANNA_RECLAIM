# Manna Supervisor — Flutter

The Supervisor half of Manna Production Management, as a native app. The React
website keeps everything else and the Node/Express + Supabase backend is
untouched: every call this app makes is a call the web client already made, to
the same route, with the same body.

```
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:5000/api/v1
./tool/build-release.sh          # the APK to hand out - see below
```

`10.0.2.2` is the Android emulator's route to the host machine. On real
hardware, point `API_URL` at the plant's API host.

### The APK you hand out

Build it with `./tool/build-release.sh`, not `flutter build apk --release`.

The API URL is a compile-time constant, read from `.env` by
`--dart-define-from-file`. Leave that flag off and the build takes
`AppConfig.apiUrl`'s fallback instead - silently, because a define that was
never passed leaves no trace in the output. A release APK went out that way
pointing at `10.0.2.2:4000`, the emulator's alias for its host machine, which
resolves to nothing on a real phone: every call failed and the app sat on
"network unreachable, working offline", which reads as a handset with no
signal rather than as an APK that was never told where the server is.

The script passes the flag, then reads the URL back out of the AOT snapshot in
the APK it just built. If that turns out to be `localhost`, `10.0.2.2`,
`127.0.0.1` or a LAN address, it deletes the APK and exits non-zero - because a
refusal that leaves the file on disk only means the next person to reach for
`app-release.apk` picks up the broken one.

The fallback now points at the deployed API rather than the emulator, so
forgetting the flag no longer breaks the app. It would still ignore anything
else `.env` sets, which is why the script is the documented route.

### On a phone, against the dev server

The phone cannot reach `localhost` and does not need to be on the plant wifi.
`adb reverse` carries the phone's `localhost:5000` to the dev machine's over the
USB cable — no firewall rule, no shared network, no admin:

```
adb reverse tcp:5000 tcp:5000
flutter run -d <device-id> --dart-define=API_URL=http://localhost:5000/api/v1
```

Re-run the `adb reverse` line after unplugging the phone or restarting adb; it
does not survive either.

Against a dev server on the wifi instead, use the machine's LAN address
(`http://192.168.1.53:5000/api/v1`) — that needs inbound TCP 5000 allowed in the
Windows firewall, and the host listed in `network_security_config.xml`.

### Android configuration

Two things Flutter's generated project does not do that this app needs:

- **`INTERNET` is granted in the main manifest.** Flutter only puts it in the
  debug and profile manifests, which is enough for hot reload and leaves a
  release build unable to make a single call.
- **`network_security_config.xml`** names where plain HTTP is allowed. The
  default stays off — a session token on an unencrypted link is one anybody on
  the wifi can lift — and the dev addresses are listed one at a time. A plant
  serving its API over HTTP on the LAN adds its host there; a plant on HTTPS
  needs nothing, and that is the arrangement to prefer.

---

## What moved, and what did not

The audit that decided this. The React app has two route trees — `adminRoutes`
(the back office, `manager`/`admin` only) and `userRoutes` (the shop floor) —
and the shop floor is split again inside the layout: Quality is gated to
`LAB_ROLES`, everything else to `FLOOR_ROLES`. The Supervisor module is the
`FLOOR_ROLES` half.

### Migrated to Flutter

| React page | Flutter |
| --- | --- |
| `pages/user/LoginPage.tsx` | `features/auth/login_page.dart` |
| `pages/user/MachinesPage.tsx` | `features/machines/` (page, card, start & stop sheets) |
| `pages/user/BatchesPage.tsx` | `features/batches/batches_page.dart` |
| `pages/user/WeighPage.tsx` | `features/weigh/weigh_page.dart` |
| `pages/user/PackingPage.tsx` | `features/packing/packing_page.dart` |
| `pages/user/StockPage.tsx` | `features/stock/stock_page.dart` |
| `features/dispatch/NewDispatchSheet.tsx` | `features/stock/new_dispatch_sheet.dart` |
| `pages/user/HistoryPage.tsx` | `features/history/` (page, run sheet, draft maths) |
| `pages/user/BearingPage.tsx` | `features/bearing/bearing_page.dart` |
| `pages/user/SettingsPage.tsx` | `features/settings/settings_page.dart` |
| `components/layout/{UserLayout,Header,BottomTabs}` | `features/shell/supervisor_shell.dart` |

### Stays in the React website

- **Quality module** — `pages/user/QualityPage.tsx`, `pages/admin/QualityPage.tsx`,
  `pages/admin/QcYard.tsx`, `features/quality/*`. Untouched, still gated to
  `LAB_ROLES`. Filing, correcting and deleting a verdict is the bench's and
  there is no route to it from this app.
- **Reports** — `pages/user/ReportsPage.tsx`. Ported first, then taken back out:
  the seven-day production headline and the lab's pass rates are a reading
  exercise rather than shop-floor work. Still on the website, unchanged.
- **User module** — `pages/admin/UsersPage.tsx` and `/users`. Accounts are the
  back office's.
- **The whole back office** — dashboard, efficiency, costing, rates, customers,
  products, machines, maintenance ledger, admin history, admin login.
- **Shared web components** — `components/ui/*`, `components/layout/Admin*`.
  The Flutter app has its own kit in `lib/widgets/`; nothing is shared across
  the two runtimes and nothing needed to be.

A `lab` account is refused at this app's login with a line pointing at the
website. Everyone in `FLOOR_ROLES` is let in, exactly as on the web — narrowing
that would have taken the tablets off the crews on the day this shipped.

---

## Per page: what it depends on, and what it calls

Every endpoint below already existed. None was added, renamed or changed.

### Login
- **Depends on** `AuthStore`, `TokenStore`, the cookie jar.
- **Calls** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`,
  `POST /auth/refresh`.
- The refresh token is an httpOnly cookie the server sets. Flutter carries a
  `PersistCookieJar` so the session survives a relaunch the way it survives a
  page reload in a browser — this is what `withCredentials: true` was doing.

### Machines
- **Depends on** `MachinesStore`, `RunsStore`, `MaintenanceStore`,
  `BatchesStore`, `ProductsStore`, `UiStore` (supervisor name).
- **Calls** `GET /machines/grouped`, `GET /runs/active`, `GET /runs/shift`,
  `POST /runs/start`, `POST /runs/:id/stop`, `POST /runs/:id/pause`,
  `POST /runs/:id/tally`, `POST /runs/:id/cancel`, `GET /batches/open`,
  `POST /batches`, `GET /products?active=true`, `GET /maintenance?status=open`,
  `POST /maintenance`, `POST /maintenance/:id/resolve`,
  `DELETE /maintenance/:id`, `GET /maintenance/bearings/due`,
  `POST /maintenance/bearings`.
- Carries every sheet: the line question for a dual-line machine, the autoclave
  load (formulation, paired crew, batch number with its month letter, the two
  dates), the press and sleeve/loop start (product, cure, cavities, generated
  lot number), the refiner start (batch, grade, mix, both meters), the shiftwise
  start (date, shift, feedstock, meters), the stop sheet for each of those, the
  running tally, cancel-all-open-runs, breakdown, repair, and bearings.

### Batches
- **Depends on** `BatchesStore`.
- **Calls** `GET /batches/open`, `GET /batches/:id`,
  `POST /batches/:id/qualities`, `POST /batches/:id/close`,
  `DELETE /batches/:id`, and `GET /quality-tests` for the QC-hold chip (that
  read is deliberately open to everyone signed in — see the route's own note).

### Weigh
- **Depends on** `RunsStore`, `AuthStore` (`DELETE_ROLES`).
- **Calls** `GET /runs/pending-weigh`, `GET /runs/weighed`,
  `POST /runs/:id/weigh`, `DELETE /runs/:id/weigh`.

### Packing
- **Depends on** `RunsStore`, `AuthStore` (`ADMIN_ROLES` for the unpack).
- **Calls** `GET /runs/pending-pack`, `POST /runs/:id/pack`,
  `DELETE /runs/:id/pack`.

### Stock
- **Depends on** `StockService`, `AuthStore` (`DISPATCH_ROLES`), `UiStore`.
- **Calls** `GET /stock/summary`, `GET /stock/pools`.
- **Not** `GET /stock`: that is the back office's packed-against-dispatched
  ledger and a supervisor is refused it at the route. The summary is a different
  response from a different serializer, not the same one with fields hidden.
- **Not** `PATCH /stock/:id/qc`: releasing goods for sale stays the office's.
- Polls every 30 s while open, because the lab files verdicts on a different
  device and no amount of in-app state crosses between them.

### Dispatch sheet
- **Calls** `GET /customers`, `GET /customers/:id/last-prices`,
  `GET /rates/loading-rates`, `POST /dispatches`.
- Not `GET /rates/cost-rates` — two numbers, not the plant's cost model.

### History
- **Depends on** `ReportsStore` (pickers), `AuthStore` (`DISPATCH_ROLES` for the
  recent-dispatch panel), `MachinesStore`.
- **Calls** `GET /runs?all=1`, `PATCH /runs/:id`, `DELETE /runs/:id`,
  `GET /reports/filters`, `GET /dispatches`.

### Bearing
- **Depends on** `MaintenanceStore`, `RunsStore`, `MachinesStore`.
- **Calls** `GET /maintenance/bearings/due`, `GET /maintenance/bearings`,
  `POST /maintenance/bearings`, `GET /runs/active`, `GET /machines/grouped`.

### Settings
- **Calls** `POST /auth/logout`.
- Carries the supervisor pick (who signs this tablet's records) and the way in
  to the diagnostic log.

---

## The diagnostic log

Once these tablets are on the plant floor there is no console attached and
nobody to read one. "It would not save" arrives with nothing behind it, and the
answer is nearly always a refusal the server already explained in words — which
went past in a toast while somebody's hands were full.

So `RequestLog` records every call at the one place they all pass through,
`ApiClient._send`. **Settings › Open the log** shows them newest first, with the
server's own sentence under each failure, and copies the lot to the clipboard
with a header naming the API and the account. That is a message a supervisor can
send from the floor and somebody can act on.

What it keeps: method, path, status, elapsed ms, the server's message on a
refusal, and an aside where the client did something worth seeing — a silently
refreshed 401 is recorded, because that is what a session dying slowly looks
like.

What it cannot keep: request bodies and headers. `record()` has no parameter
they could arrive through, which is what keeps the sign-in PIN and the bearer
token out of a log somebody is about to paste into a chat message. Query strings
are dropped rather than trimmed, for the same reason. `test/request_log_test.dart`
pins both.

It is memory-only, capped at the last 200 calls, and gone when the app is
killed. A log that persisted would be one more copy of production data sitting
on a shared device; the plant's record is the API's own.

---

## Layout

```
lib/
  core/
    api/api_client.dart      envelope unwrapping, single-flight token refresh
    config/                  endpoints, domain constants, build config
    models/models.dart       the API's shapes
    theme/                   the design tokens, ported from index.css
    utils/                   dates, formats, moulding batch numbers
  services/services.dart     one method per route this app calls
  state/                     the Redux slices, as ChangeNotifiers
  widgets/                   the shared kit: sheets, fields, chips, panels
  features/<page>/           one directory per Supervisor page
```

State is `provider` + `ChangeNotifier`, one store per Redux slice, with the same
names and the same reducer behaviour — including the parts that matter on the
floor: weighing a run moves it onto the packing bench in the same beat, and
unpacking one raises the refresh signal because what it changes is mostly on
another tab.

---

## Role permissions, mirrored

Every one of these is enforced on the server. The app mirrors them so it never
offers a tap that comes back 403.

| Rule | Who | Where it shows |
| --- | --- | --- |
| `FLOOR_ROLES` | worker, supervisor, manager, admin | who may sign in at all |
| `LAB_ROLES` | lab, manager, admin | Quality — not in this app |
| `DISPATCH_ROLES` | supervisor, manager, admin | the Dispatch buttons and the sheet |
| `ADMIN_ROLES` | manager, admin | undoing a packing |
| `DELETE_ROLES` | admin | clearing a weighing |

Where a control is refused, it is drawn dead with the reason beside it rather
than hidden — a button that is not there is a question, and answering it costs a
walk to the office.

---

## Checks

```
flutter analyze     # clean
flutter test        # 28 tests
flutter build apk   # builds
```

`test/domain_rules_test.dart` pins the rules where getting it slightly wrong is
invisible on screen and wrong in the record: the shift boundary, plant-local
date parsing, the generated lot number, the expected-pieces variance, and the
three role lists. `test/request_log_test.dart` pins what the diagnostic log
keeps and what it must never keep.

Neither catches a layout constraint violation, which is what the first run on a
real device found — see the note on `Panel` in `widgets/ui.dart`.
