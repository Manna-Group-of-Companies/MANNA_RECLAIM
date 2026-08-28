-- =============================================================================
-- MANNA RECLAIM - who came in, and where the supervisor put them
--
-- The plant has a biometric punch at the gate - an Identix K90+ID on the office
-- LAN - and until now nothing in this app knew about it. A run records a crew
-- *count*, "3 workers", typed by the supervisor from memory at the end of a
-- pass. Every labour figure in the app is built on that number: kg per
-- man-hour, the incentive, the whole batch comparison. Nobody has been able to
-- check it against who actually walked through the gate.
--
-- Two tables and two columns, answering three questions in order.
--
-- WHO CAME IN. `attendance_punches` is the device's own record, copied. One row
-- per punch, exactly as the machine holds it, and nothing derived that could be
-- recomputed - because the day somebody disputes a figure, the answer has to be
-- the punch, not this app's opinion of the punch.
--
-- The device's clock is the plant's clock, and it is the only clock here that
-- matters. `local_date` and `local_time` are what the machine itself reported;
-- `punched_at` is the same moment as an instant for sorting. Both, because the
-- server runs in UTC on a rack in another country: derive a shift from the
-- instant and every punch between half past midnight and half past five IST
-- lands on the wrong shift, which is most of the night crew.
--
-- WHICH OF THEM ARE FLOOR WORKERS. The gate does not know - it punches the
-- office, the drivers and the managing director the same as a refiner hand,
-- and what the supervisor needs is his own crew. So `operators` - which already
-- exists, and is already the app's answer to "who works on the floor" - gains
-- the code the device knows a person by. An operator row with a punch code IS
-- the definition of a production worker; a punch that matches none is somebody
-- else's business and is listed apart, unassigned, for the supervisor to claim
-- if the gate has met somebody this app has not.
--
-- WHERE THEY WORKED. `shift_labour` is one row per person per shift, and the
-- unique index says exactly that: a person is in one place at a time. That is
-- the mirror of `shift_operators`, which is one row per *station* per shift -
-- and the two are different questions, which is why this is a second table
-- rather than a loosened index on the first.
--
--   shift_operators   who is answerable for a line. One name per line, and the
--                     incentive is paid on it.
--   shift_labour      where every pair of hands went. Several to a machine, and
--                     Packing and Cleaning are stations here though no machine
--                     stands at either.
--
-- Loosening shift_operators to hold both would have made the incentive query
-- ambiguous - it would have had to guess which of three names on the coarse
-- line to pay - and the guess would have been silent.
--
-- `station` is free text against a machine id or one of the off-machine
-- stations, not a foreign key, for the same reason shift_operators does it:
-- Packing and Cleaning are real places to spend a shift and neither is a row in
-- `machines`.
-- =============================================================================

-- The code the gate knows a person by, and the link that makes a punch a
-- worker. Nullable: an operator the plant has always tracked by name and who
-- has not been matched to the device yet is still an operator.
alter table public.operators add column if not exists punch_code text;

-- One person to one code. Partial, so the operators with no code yet do not
-- collide with each other on null.
create unique index if not exists operators_punch_code_key
  on public.operators (punch_code)
  where punch_code is not null;

create table if not exists public.attendance_punches (
  id          text primary key default gen_random_uuid()::text,
  -- Which reader, because the plant may add a second gate and the same code on
  -- two devices is two different people.
  device      text not null,
  code        text not null,
  -- The name as the device holds it. Kept even once the code is matched to an
  -- operator: it is what the gate would print, and the two disagreeing is worth
  -- being able to see.
  name        text,
  punched_at  timestamptz not null,
  local_date  date not null,
  local_time  text not null,
  -- 'in', 'out', or null where the reader does not say. Many of these devices
  -- record a direction only if the plant configured one, so nothing here may
  -- depend on it being present.
  direction   text,
  -- Derived once, on the way in, from the local clock above - see
  -- attendance.service. Stored rather than computed per read because every
  -- screen that asks "who is on this shift" would otherwise re-derive it, and
  -- two of them would eventually disagree about half past eight.
  shift_date  date not null,
  shift       text not null,
  created_at  timestamptz not null default now()
);

-- The same punch posted twice is the same punch. The sync re-sends a window on
-- every run - it has no way to know what arrived last time - so this index is
-- what makes a re-send free rather than a doubling.
create unique index if not exists attendance_punches_once_key
  on public.attendance_punches (device, code, punched_at);

create index if not exists attendance_punches_shift_idx
  on public.attendance_punches (shift_date, shift);

create table if not exists public.shift_labour (
  id          text primary key default gen_random_uuid()::text,
  shift_date  date not null,
  shift       text not null,
  -- Who, by the code the gate knows. The code rather than the operator id
  -- because the punch is the fact: a row whose operator was later deleted still
  -- says who stood at that machine.
  code        text not null,
  operator_id text references public.operators (id) on delete set null,
  -- And the name as it was when the shift was worked, for the same reason
  -- shift_operators keeps one: renaming somebody next year must not rewrite who
  -- the plant deployed last March.
  operator    text,
  station     text not null,
  assigned_by text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One person, one place, one shift. Moving somebody is an update of this row
-- rather than a second row - a pair of hands counted on the grinders and on
-- packing is a headcount that adds up to more people than came through the
-- gate.
create unique index if not exists shift_labour_person_key
  on public.shift_labour (shift_date, shift, code);

create index if not exists shift_labour_station_idx
  on public.shift_labour (shift_date, shift, station);

alter table public.attendance_punches enable row level security;
alter table public.shift_labour enable row level security;

drop policy if exists attendance_punches_read on public.attendance_punches;
create policy attendance_punches_read on public.attendance_punches
  for select to anon, authenticated using (true);

drop policy if exists attendance_punches_service on public.attendance_punches;
create policy attendance_punches_service on public.attendance_punches
  for all to service_role using (true) with check (true);

drop policy if exists shift_labour_read on public.shift_labour;
create policy shift_labour_read on public.shift_labour
  for select to anon, authenticated using (true);

drop policy if exists shift_labour_service on public.shift_labour;
create policy shift_labour_service on public.shift_labour
  for all to service_role using (true) with check (true);
