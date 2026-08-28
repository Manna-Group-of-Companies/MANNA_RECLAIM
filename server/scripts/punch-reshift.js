/**
 * Re-derive which shift each stored punch belongs to.
 *
 *   node scripts/punch-reshift.js            what it would change, writes nothing
 *   node scripts/punch-reshift.js --apply    do it
 *
 * `shift_date` and `shift` are worked out once, as a punch is stored, from the
 * device's own clock and which way through the gate it was - see shiftOfPunch.
 * Stored rather than computed on every read, because every screen that asks
 * "who was on this shift" would otherwise re-derive it and two of them would
 * eventually disagree about half past eight.
 *
 * The cost of storing it is this script. When the rule changes, what is already
 * on the table still carries the old answer, and nothing about a punch row makes
 * that visible - it looks like an ordinary record of a shift nobody worked.
 *
 * It rewrites those two columns and nothing else. No punch is added, removed or
 * moved in time: the gate said what it said, and only this app's reading of it
 * is in question.
 */
import { crud } from '../src/services/base.service.js';
import { shiftOfPunch } from '../src/services/attendance.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES } from '../src/config/constants.js';

const apply = process.argv.slice(2).includes('--apply');
const punches = crud(TABLES.attendancePunches, { defaultSort: 'punched_at' });

async function main() {
  if (!isDbReady()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set - see server/.env.example');
  }

  const rows = await punches.all({});
  const wrong = [];
  for (const row of rows) {
    const { shiftDate, shift } = shiftOfPunch(row.local_date, row.local_time, row.direction);
    if (String(row.shift_date) !== shiftDate || row.shift !== shift) {
      wrong.push({ row, shiftDate, shift });
    }
  }

  logger.info(`${rows.length} punches on record, ${wrong.length} filed on the wrong shift`);
  const byMove = new Map();
  for (const w of wrong) {
    const key = `${w.row.shift_date} ${w.row.shift}  ->  ${w.shiftDate} ${w.shift}`;
    byMove.set(key, (byMove.get(key) ?? 0) + 1);
  }
  for (const [move, n] of [...byMove].sort((a, b) => b[1] - a[1])) {
    logger.info(`  ${n.toString().padStart(4)}  ${move}`);
  }

  if (!wrong.length) {
    logger.info('Nothing to do - every punch is on the shift the rule says it belongs to.');
    return;
  }
  if (!apply) {
    logger.info('DRY RUN - nothing was written. Re-run with --apply to correct them.');
    return;
  }

  for (const w of wrong) {
    await punches.update(w.row.id, { shift_date: w.shiftDate, shift: w.shift });
  }

  // Read back, because a write to a column the project does not have is pruned
  // and answers 200 - see pruneBody in config/supabase.
  const after = await punches.all({});
  const still = after.filter((row) => {
    const { shiftDate, shift } = shiftOfPunch(row.local_date, row.local_time, row.direction);
    return String(row.shift_date) !== shiftDate || row.shift !== shift;
  });
  if (still.length) throw new Error(`${still.length} punches did not take the correction`);
  logger.info(`${wrong.length} punches moved to the shift they were actually worked on.`);
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
