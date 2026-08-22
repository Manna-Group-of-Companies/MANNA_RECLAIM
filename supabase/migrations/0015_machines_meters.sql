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
