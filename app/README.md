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
- A read, and the way out. Who is signed in, whether the tablet can reach the
  server, the name its records are being signed with, the way in to the
  diagnostic log, and Sign out. Nothing on it changes anything.
- The supervisor is *shown* here and *picked* on the sheet that signs the
  record — the autoclave load, the bearing temperatures. A shared tablet whose
  signature can be changed from Settings is one whose signature can be changed
  by anybody, on a screen nobody is watching.
- The server address is not read out. It is in the diagnostic log against the
  call that failed, which is the only time it is worth anything.
- Sign out drops the token whatever the server answers, and a refusal — the
  rate limiter, a server that is down, a token already forgotten — is swallowed
  at the service rather than thrown at a crew off a button whose work is done.

---

## On a tablet, and on a phone

The app is written phone-first and the phone layout is untouched: one card per
row, the tab bar along the bottom edge, sheets that fill the screen. Everything
below is what happens when there is more width than that, and it is all decided
in one place — `core/theme/layout.dart`, which is to layout what `tokens.dart`
is to colour. Nothing else measures the screen.

Three sizes, at 600 and 1000 logical pixels:

| | phone | tablet (600+) | wide (1000+) |
| --- | --- | --- | --- |
| tabs | bar along the bottom | the same | the same |
| card lists | one column | two | three |
| sheets | up from the bottom edge | a centred box, max 640 wide | the same |
| page gutter | 14 | 18 | 22 |

The hardware this lands on, in logical pixels — which is not what the spec
sheet says, because Android scales. A Tab M11 is 1920 × 1200 of glass and the
app is handed 1280 × 800 of it at the device's 1.5 density:

| device | upright | laid down |
| --- | --- | --- |
| Lenovo Tab M11 (the plant's) | 800 × 1280 — tablet: 2 columns | 1280 × 800 — wide: 3 columns |
| moto g73 5G | 411 × 914 — phone: 1 column | 914 × 411 — tablet: 2 columns |

Neither is a special case in the code — the class is read off the width at build
time, so a tablet nobody has bought yet lands in whichever of the three it
belongs to. They are written down in `KnownScreens` because the alternative is
re-deriving them from a spec sheet every time somebody asks. The M11 upright is
what the column arithmetic is tuned against: 800 less the gutters is about 760,
and the minimum tile width is set so that is two columns, not one.

**The tab bar stays at the bottom on every device.** A side rail was built for
the tablet — it is what Material suggests at that width, and it buys back the
bar's 62 rows of height — and then taken back out. The crews reach for the tabs
at the bottom edge on the tablet exactly as on the handset, and a plant with two
devices in it wants one app on both, not an app that rearranges itself depending
on which one is picked up. The width a rail would have saved goes to card
columns instead, which is where it does some good.

The card lists go wider rather than the cards. A machine card stretched to the
width of a landscape tablet does not say any more than it did: it puts a foot of
whitespace between the batch number and the button that acts on it, and halves
how much of the queue is on screen. `CardGrid` is what every list is wrapped in,
and the minimum tile width is set so an 800-wide tablet in portrait — the ones
on the floor — is two columns and not one. Batch cards ask for more, because
they carry the grade × stage grid.

History goes two across as well. It was left single-column at first on the
reasoning that its rows are a table — they are not: each one is a card, a
machine and a date over a line of chips over a line of figures, and at 1280 it
was a card with half a screen of nothing after it. Its four pickers pair up onto
one line at the same width.

Inside the sheets, `FieldRow` is a pair somebody chose — a date and its shift, a
start meter and an end one — and stays side by side at every width, because that
is how it was drawn to fit a phone. `FieldColumns` is the other case: a run of
fields that are merely alike, such as the four temperatures off a machine's
bearings. Those stack on a handset and pair up on a sheet wide enough to hold
them, and never go past two columns — a form read in three is a form somebody
fills in in the wrong order. The rest of what the sheets stack is left alone:
which fields belong beside which is a decision about the form, not about the
screen.

Every popup in this app is a sheet — there are no `AlertDialog`s, because a
confirmation that cannot say what it is about in a sentence is not a
confirmation. Where a sheet comes from is the one thing that differs by device.
On a phone it rises from the bottom edge and stays there, one-handed, with a
grab handle and the actions at thumb height. On a tablet the same shell is a box
in the middle of the work: pinned to the bottom of a 1280-tall screen it reads
as a phone's sheet dropped into a corner, and it leaves the fields an arm's
length from the buttons that commit them. Same title, body and actions either
way; only the anchor changes, and the handle goes with it because there is no
longer an edge to drag it back down to.

Settings and the diagnostic log are held to a reading column, for the opposite
reason to everything above.

`test/layout_test.dart` pins the breakpoints, the column arithmetic and the
field pairing at their boundaries, and `test/shell_layout_test.dart` pumps the
real shell at four screen sizes — both M11 orientations included — to check the
bar is along the bottom on every one of them.

`test/sheet_lifetime_test.dart` pins something the responsive work turned up
rather than caused. Every sheet in this app builds its controllers, awaits the
sheet, and disposes them on the next line — which was only safe as long as
nothing rebuilt the fields in the quarter-second the sheet spends sliding away,
because `showModalBottomSheet` hands control back at the pop rather than at the
teardown. A store notifying in that window — a toast landing, a fetch coming
back, the yard's poll — threw "A TextEditingController was used after being
disposed" over whatever the crew was working on. It took a tablet on the floor
to show it. `showAppSheet` now waits for the sheet's own subtree to be torn
down, which makes every caller correct as written, including the ones nobody
has written yet.

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
    theme/                   the design tokens, and the breakpoints
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
flutter test        # 93 tests
flutter build apk   # builds
```

`test/domain_rules_test.dart` pins the rules where getting it slightly wrong is
invisible on screen and wrong in the record: the shift boundary, plant-local
date parsing, the generated lot number, the expected-pieces variance, and the
three role lists. `test/request_log_test.dart` pins what the diagnostic log
keeps and what it must never keep. `test/sign_out_test.dart` pins that a server
which refuses the sign-out — rate-limited, down, a token it has already
forgotten — still leaves the tablet signed out, and quietly; that refusal came
back up through the Settings button as an unhandled exception until it was
caught. `test/history_card_test.dart` pins that a History row reads out the
whole record — both meters as they were read, the individual weighings, a
press's mould and costing — and that a run says nothing about what it never
recorded. `test/settings_page_test.dart` pins that Settings is a read: no
supervisor pick and no server address on it, and the signing name still shown.

Neither catches a layout constraint violation, which is what the first run on a
real device found — see the note on `Panel` in `widgets/ui.dart`.
