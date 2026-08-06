-- =============================================================================
-- MANNA RECLAIM - one open run per machine, and the duplicates already there
--
-- A machine may have one run open. The server checked that before starting one,
-- but a check followed by an insert is not a rule: two Starts sent close enough
-- together both pass the check before either row lands. A tablet double-tapped
-- through a slow reply did exactly that and left SEVEN open runs on the Cracker,
-- all inside 0.26 seconds, all carrying the same meter readings.
--
-- What that looks like on the floor is worse than a duplicate row. The Machines
-- page keys one card per machine, so six of the seven were invisible: stopping
-- the run on the card closed one row and the next open one took its place, and
-- the Cracker "would not stop" however many times the crew stopped it.
--
-- Two halves, in this order:
--
--   1. clear the duplicates that are already there - oldest open run per machine
--      kept, the rest deleted. Only ever rows with nothing logged against them:
--      no end time, nothing packed, nothing weighed. A duplicate that somehow
--      carries output is left alone for a person to look at, and will hold the
--      index below back until they do - which is the right way round.
--   2. the index, so the race cannot be run again. A second open row on a
--      machine is now refused by the database, whatever the server believes.
--
-- The server also removes the loser of the race itself (run.service.js start()),
-- so a project this has not been applied to is still covered.
--
-- Idempotent. supabase/schema.sql carries the same blocks.
-- =============================================================================

-- 1. The duplicates already open, oldest kept.
with ranked as (
  select id,
         row_number() over (partition by machine_id order by started_at, id) as rn
    from public.runs
   where ended_at is null
)
delete from public.runs r
 using ranked
 where r.id = ranked.id
   and ranked.rn > 1
   and coalesce(r.packed_sacks, 0) = 0
   and coalesce(r.packed_pieces, 0) = 0
   and r.weight_kg is null;

-- 2. The rule itself. Partial, because it is only open runs that are limited to
-- one: a machine has as many finished runs as it has worked shifts.
--
-- Wrapped so that a machine still carrying two open rows - one of them with
-- output on it, which step 1 deliberately did not touch - reports itself instead
-- of rolling the whole file back. The cleanup above is worth keeping either way,
-- and the message says exactly which machines are left to sort out by hand.
do $$
begin
  create unique index if not exists runs_one_open_per_machine
    on public.runs (machine_id)
    where ended_at is null;
exception
  when unique_violation then
    raise warning 'runs_one_open_per_machine was NOT created: these machines still have more than one run open - %',
      (select string_agg(machine_id || ' (' || n || ')', ', ')
         from (select machine_id, count(*) as n
                 from public.runs
                where ended_at is null
             group by machine_id
               having count(*) > 1) doubled);
end $$;
