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
