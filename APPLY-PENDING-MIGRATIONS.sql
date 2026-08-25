-- =============================================================================
-- MANNA RECLAIM - the five migrations the database has not had yet.
--
-- Paste the whole file into the Supabase SQL editor and run it once. Every
-- statement is guarded (add column if not exists / create table if not exists),
-- so running it twice does nothing the second time.
--
-- Checked against the live database on 24 August 2026: none of them were
-- there. Until they are, the features below are dead on the plant's tablets.
--
--   0015  Soorya Grinder has no meters and no bearing schedule
--   0017  the manager's approval of a shift's reason
--   0018  the autoclave cycle times
--   0019  the operator roll and the shift roster
--   0020  stock as SAP holds it, and the record of each read
--
-- This file is the five migration files under supabase/migrations run in
-- order, with their own notes left in. Delete it once it has been applied.
-- =============================================================================


-- ###########################################################################
-- 0015_machines_meters.sql
-- ###########################################################################

-- =============================================================================
-- MANNA RECLAIM - whether a machine has meters on it, per machine
--
-- Until now "does this machine have meters" was answered by its `kind`: every
-- machine but the autoclaves, the presses and the two moulding benches was
-- assumed metered, so its sheets asked for an electricity reading and an
-- hour-meter reading either side of the run.
--
-- The Soorya Grinder breaks that. It is `kind = 'grind'` like the other two
-- grinders, so both clients ask it for two readings that do not exist - there is
-- no electricity meter and no hour meter on it, and there never was. The crew
-- cannot fill the sheet in, which is the likeliest reason the machine has never
-- had a single run logged against it in the life of this project.
--
-- So the question moves onto the machine, where it belongs. `meters` is
-- deliberately NULLABLE, and null does not mean "no":
--
--   null   fall back to what the kind implies - which is every existing row,
--          so nothing changes for any machine already on the list.
--   false  this machine has no meters, whatever its kind. Its sheets ask for
--          weight and crew and nothing else.
--   true   this machine is metered, even if its kind would say otherwise.
--
-- Nullable rather than `not null default true` on purpose: a default of true
-- would state, as a fact recorded about every press and autoclave in the plant,
-- that it has meters - which is false, and would then have to be corrected row
-- by row. Null says "nobody has answered this for this machine", which is the
-- truth, and lets the kind keep answering until somebody does.
-- =============================================================================

alter table public.machines add column if not exists meters boolean;

comment on column public.machines.meters is
  'Null = infer from kind. False = no electricity or hour meter on this machine; '
  'its run sheets ask for weight and crew only. See 0015_machines_meters.sql.';

-- -----------------------------------------------------------------------------
-- And the same question about bearings, which is a different question.
--
-- `bearingSpec` decides who is on the greasing schedule from `kind`: everything
-- that is not an autoclave or a press is checked every two or three hours, and a
-- machine that has never been logged counts as due, so it sits on the shop
-- floor's Bearing tab and the manager's dashboard asking forever.
--
-- The Soorya Grinder has no bearing check either. It is `kind = 'grind'` like the
-- other two, so it has been asking for temperatures at four positions that
-- nobody takes, and will go on asking whatever happens to `meters`: the two are
-- separate facts about a machine and a column that answered both would be one
-- fact wearing two names. A machine can perfectly well have bearings and no
-- meters, or meters and no bearings.
--
-- Same three-state rule as above, and for the same reason - null is "nobody has
-- said", not "no".
-- -----------------------------------------------------------------------------
alter table public.machines add column if not exists bearings boolean;

comment on column public.machines.bearings is
  'Null = infer from kind. False = this machine is not on the greasing schedule; '
  'it is left off the Bearing tab and never falls due. See 0015_machines_meters.sql.';

-- The Soorya Grinder, which is what both columns exist for: it is weighed at the
-- end of a shift and that is the whole of what the crew records against it.
update public.machines set meters = false, bearings = false where id = 'GRD_O';


-- ###########################################################################
-- 0017_variance_reason_approval.sql
-- ###########################################################################

-- =============================================================================
-- MANNA RECLAIM - a reason is written by the shift and signed off by the office
--
-- The record already held why a figure missed its ideal. What it did not hold is
-- who agreed with it.
--
-- That matters now because the plant pays an incentive on these figures. A
-- supervisor writing "the belt was slipping all shift" against a miss is not
-- merely explaining it - they are asking for the miss to be discounted, and an
-- explanation that discounts a miss with nobody's name against it is an
-- explanation that settles its own case. So the reason is the shift's to write
-- and the office's to accept.
--
-- Three columns, and the split between them is the point:
--
--   approved_at   when the office accepted it. Null is not "rejected" - it is
--                 "nobody has looked yet", which is the ordinary state of a
--                 reason written twenty minutes ago and a different sentence
--                 from one that has been read and agreed.
--   approved_by   whose name is on that acceptance.
--   manager_note  what the office added, kept apart from `reason` rather than
--                 appended to it. A manager who edits a supervisor's sentence
--                 leaves a record that reads as the supervisor's words and is
--                 not; the two belong to two people and stay in two columns, so
--                 months later it is still clear who said which.
--
-- Nothing is backfilled. Every reason already on the record was written by the
-- back office - it was the only role that could - so approving them to
-- themselves would manufacture a sign-off that never happened. They stay
-- unapproved and honest, and the screen says "not yet approved" rather than
-- pretending.
-- =============================================================================

alter table public.variance_reasons add column if not exists approved_at timestamptz;
alter table public.variance_reasons add column if not exists approved_by text;
alter table public.variance_reasons add column if not exists manager_note text;

comment on column public.variance_reasons.approved_at is
  'When the back office accepted this reason. Null = nobody has looked yet, '
  'which is not the same as rejected. See 0017_variance_reason_approval.sql.';

comment on column public.variance_reasons.manager_note is
  'What the office added alongside the shift''s own words - deliberately a '
  'separate column, so a manager''s sentence is never read back as the '
  'supervisor''s. See 0017_variance_reason_approval.sql.';


-- ###########################################################################
-- 0018_autoclave_cycle_times.sql
-- ###########################################################################

-- =============================================================================
-- MANNA RECLAIM - the three clock times an autoclave cycle turns on
--
-- A charge already records when it went in and when it was discharged, which is
-- the whole cook and tells you nothing about where the time went. Three moments
-- inside it are the ones the plant actually loses time to:
--
--   pressure_at    when the vessel reached 21 bar. Loading to pressure is the
--                  heat-up, and it is the part a cold vessel, wet firewood or a
--                  slow start shows up in. Without it a long cook and a slow
--                  heat-up are the same number.
--
--   door_open_at   when the discharge door was opened.
--   door_close_at  when it was closed again.
--
-- The last two are a pair and the gap between them is the point: that is the
-- vessel standing open while it is emptied and the next charge is put in, and it
-- is dead time on a machine that is only earning while it is shut and hot. The
-- plant has never had a figure for it - the charge before and the charge after
-- are two rows, so the gap between them was invisible in the record even though
-- everybody standing there can see it.
--
-- Timestamps rather than durations, deliberately. A duration is one subtraction
-- away and cannot be checked afterwards; a clock time can be read back against
-- the shift, and a figure the plant is going to be measured on has to be
-- something somebody can point at. Every one is nullable: they are being asked
-- for from today, and a charge logged last month has no answer to give.
-- =============================================================================

alter table public.runs add column if not exists pressure_at timestamptz;
alter table public.runs add column if not exists door_open_at timestamptz;


comment on column public.runs.pressure_at is
  'When the vessel reached working pressure (21 bar). started_at to here is the '
  'heat-up. See 0018_autoclave_cycle_times.sql.';

comment on column public.runs.door_open_at is
  'When the discharge door was opened. See 0018_autoclave_cycle_times.sql.';




-- ###########################################################################
-- 0019_operators_and_stations.sql
-- ###########################################################################

-- =============================================================================
-- MANNA RECLAIM - who was on each line, shift by shift
--
-- The plant pays an incentive on how a line did against its benchmarks, and
-- until now a shift's figures belonged to nobody. A run carries the supervisor
-- who signed it and a crew *count* - "3 workers" - so there was no way to say
-- that Suresh was on Grinder 2 last Tuesday night, and therefore no way to pay
-- him for it.
--
-- Two tables, because they answer two questions.
--
-- `operators` is who exists. A name and whether they still work here, and
-- nothing else: no PIN and no login, because an operator does not sign into
-- anything - the tablet is the supervisor's. It exists at all so that the same
-- person is the same row every time; typed by hand each shift, "Suresh",
-- "suresh" and "Sursh" would be three people and an incentive total would be
-- wrong in a way nobody would spot.
--
-- `shift_operators` is who was where. One row per station per shift, because
-- that is the span the figures are measured over and the span people actually
-- rotate on. A standing roster would have been almost no work to keep and would
-- have quietly paid the wrong person every time somebody covered a shift.
--
-- `station` is a line, not a machine. The plant is operated in lines - the
-- coarse line is PR1 and R2 worked as one, the special line is the refiners
-- together, the autoclaves are a pair one person charges - and only the
-- grinders and the cracker are one machine each. So it holds the keys the
-- efficiency screen already groups by: CRK, GRD_K, GRD_S, GRD_O, SPECIAL,
-- COARSE, AUTOCLAVES. Not a foreign key to `machines`, because four of those
-- seven are not machines.
--
-- Deactivating rather than deleting an operator, for the same reason the
-- machine list works that way: the shifts already recorded against them are
-- part of the plant's record, and a name that vanishes takes its own history
-- with it.
-- =============================================================================

create table if not exists public.operators (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  -- What they are usually on. A hint for the picker's ordering, never a rule:
  -- the assignment is what says who was where.
  station    text,
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One Suresh. Case-insensitive, exactly as `users` does it, because the whole
-- point of the table is that the same person is the same row.
create unique index if not exists operators_name_lower_key
  on public.operators (lower(name));

create table if not exists public.shift_operators (
  id          text primary key default gen_random_uuid()::text,
  shift_date  date not null,
  shift       text not null,
  station     text not null,
  operator_id text references public.operators (id) on delete set null,
  -- The name as it was when the shift was worked. Kept beside the id on purpose:
  -- an operator renamed next year must not silently rewrite who the plant paid
  -- last March, and a row whose operator was deleted still says who it was.
  operator    text,
  assigned_by text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One operator per station per shift. Re-assigning is an update of this row,
-- not a second row - two people on one line for one shift is not a thing the
-- plant does, and an incentive that could find two would have to guess.
create unique index if not exists shift_operators_slot_key
  on public.shift_operators (shift_date, shift, station);

create index if not exists shift_operators_who_idx
  on public.shift_operators (operator_id, shift_date);

alter table public.operators enable row level security;
alter table public.shift_operators enable row level security;

drop policy if exists operators_read on public.operators;
create policy operators_read on public.operators
  for select to anon, authenticated using (true);

drop policy if exists operators_service on public.operators;
create policy operators_service on public.operators
  for all to service_role using (true) with check (true);

drop policy if exists shift_operators_read on public.shift_operators;
create policy shift_operators_read on public.shift_operators
  for select to anon, authenticated using (true);

drop policy if exists shift_operators_service on public.shift_operators;
create policy shift_operators_service on public.shift_operators
  for all to service_role using (true) with check (true);


-- ###########################################################################
-- 0020_sap_stock.sql
-- ###########################################################################

-- =============================================================================
-- MANNA RECLAIM - stock as SAP holds it
--
-- The yard used to be a ledger this app kept for itself: a supervisor typed
-- what had been bagged, a Postgres function moved the group, and a dispatch
-- drew it down. The plant is too busy to keep a bagging bench up to date, and a
-- figure nobody has time to type is a figure that drifts - so the packing entry
-- has been taken off the tablets and stock comes from SAP instead, read off the
-- Manna Rubber Products server by a script on the plant machine.
--
-- Two tables, because a sync is two facts: what the stock is, and whether the
-- reading of it worked.
--
-- `sap_syncs` is the run. It exists so somebody can answer "is this figure from
-- this morning or from a fortnight ago", which is the only question that
-- matters about an unattended job. A screen showing stock with no idea how old
-- it is will be believed on the day the script has been failing silently.
--
-- `sap_stock` is the snapshot, one row per item per batch per warehouse, as SAP
-- holds it. Deliberately not aggregated: the API can add it up and then explain
-- its own total, whereas a pre-totalled figure makes every later disagreement
-- between the two systems unanswerable.
--
-- Every row carries the sync that brought it. The reader takes the newest
-- finished sync and ignores the rest, so a half-written snapshot is never read
-- as the yard - and an insert that fails part way through leaves the previous
-- one standing rather than leaving nothing at all.
--
-- Nothing here replaces `stock_groups`. That table still holds what was packed
-- before the switch, and the dispatch documents are still drawn against it. The
-- two live side by side until the plant is satisfied the SAP figures are right,
-- which is a decision for the office rather than for a migration.
-- =============================================================================

create table if not exists public.sap_syncs (
  id          text primary key default gen_random_uuid()::text,
  -- When the read happened, as the plant server saw it - not when it arrived.
  -- A script that queried at 06:00 and posted at 09:00 after three retries is
  -- reporting six o'clock's stock, and the screen has to be able to say so.
  as_of       timestamptz not null,
  received_at timestamptz not null default now(),
  source      text not null default 'SAP',
  rows        integer not null default 0,
  -- What the snapshot came to in kilograms, kept beside it so a run can be
  -- compared with the one before without reading either snapshot back.
  --
  -- Weight only. Reclaim is kilograms and moulded goods are counted in pieces,
  -- and one numeric column cannot hold two units - added together they would
  -- report a yard holding four thousand of something. The per-unit breakdown
  -- is worked out from sap_stock when it is wanted; this is the figure the
  -- plant means when it asks how much is in the yard.
  total_kg    numeric,
  -- 'ok' once every row is in. A snapshot is only read when its run says so,
  -- which is what makes a half-written one harmless.
  status      text not null default 'pending'
                check (status in ('pending', 'ok', 'failed')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists sap_syncs_recent_idx
  on public.sap_syncs (status, as_of desc);

create table if not exists public.sap_stock (
  id          text primary key default gen_random_uuid()::text,
  sync_id     text not null references public.sap_syncs (id) on delete cascade,
  -- SAP's own item code, and the key. Never invented here: an item this plant
  -- has no name for is still an item SAP is holding stock of.
  sku         text not null,
  description text,
  -- What the plant calls it - Fine, Coarse, Special DRC. Null where nobody has
  -- mapped the SAP item yet, which is a thing to fix rather than a row to drop:
  -- dropped, an unmapped grade is stock that silently does not exist.
  grade       text,
  batch       text,
  warehouse   text,
  quantity    numeric not null default 0,
  -- kg for reclaim, pieces for moulded goods. Held per row because SAP holds it
  -- per row, and a snapshot that assumed one unit would be wrong about the
  -- presses on the day somebody looks.
  unit        text not null default 'kg',
  created_at  timestamptz not null default now()
);

-- One row per item per batch per warehouse per sync. SAP answering twice for
-- the same slot is either a query that is wrong or a fact about SAP, and both
-- are worth failing loudly over rather than quietly keeping the second one.
create unique index if not exists sap_stock_slot_key
  on public.sap_stock (sync_id, sku, coalesce(batch, ''), coalesce(warehouse, ''));

create index if not exists sap_stock_sync_idx on public.sap_stock (sync_id);
create index if not exists sap_stock_grade_idx on public.sap_stock (grade);

alter table public.sap_syncs enable row level security;
alter table public.sap_stock enable row level security;

drop policy if exists sap_syncs_read on public.sap_syncs;
create policy sap_syncs_read on public.sap_syncs
  for select to anon, authenticated using (true);

drop policy if exists sap_syncs_service on public.sap_syncs;
create policy sap_syncs_service on public.sap_syncs
  for all to service_role using (true) with check (true);

drop policy if exists sap_stock_read on public.sap_stock;
create policy sap_stock_read on public.sap_stock
  for select to anon, authenticated using (true);

drop policy if exists sap_stock_service on public.sap_stock;
create policy sap_stock_service on public.sap_stock
  for all to service_role using (true) with check (true);
