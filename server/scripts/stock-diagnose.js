/**
 * Why is that stock group not on the screen?
 *
 *   node scripts/stock-diagnose.js            -> every group, and who can see it
 *   node scripts/stock-diagnose.js --pools    -> just the coarse pools
 *   node scripts/stock-diagnose.js AUG-H1     -> one group, by label
 *
 * The yard is read through three endpoints that do not answer the same
 * question, and a group missing from one while sitting on another is nearly
 * always one of them filtering it rather than the row being absent:
 *
 *   /stock          the manager's. Every group, whatever is left in it.
 *   /stock/summary  the shop floor's. Drops anything with no sacks left - an
 *                   empty group is not stock, and the floor's question is only
 *                   ever "what is there".
 *   /stock/pools    the lab's. Coarse only, and it does *not* drop empty ones,
 *                   because a spent pool still has a sampling record to finish.
 *
 * So a coarse pool that has all gone out shows on the lab's tab and on the
 * manager's table and is absent from the supervisor's - which looks like a bug
 * and is the rule working. This prints which of the three each row lands on and
 * why, so the answer takes one command instead of three logins.
 *
 * It writes nothing. Safe to run against the live project while the plant is
 * working.
 */
import { crud } from '../src/services/base.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES } from '../src/config/constants.js';
import { displayLabel, slotsOf, slotOf } from '../src/utils/stockPeriod.js';

const args = process.argv.slice(2);
const poolsOnly = args.includes('--pools');
const only = args.find((arg) => !arg.startsWith('--')) ?? null;

const groups = crud(TABLES.stockGroups, { defaultSort: 'created_at' });
const tests = crud(TABLES.qualityTests, { defaultSort: 'ts' });

const int = (value) => Number(value ?? 0);
const pad = (text, width) => String(text).padEnd(width);

/** Which of the three reads this row lands on, and what keeps it off the rest. */
function visibility(row) {
  const available = int(row.available_sacks ?? int(row.packed_sacks) - int(row.dispatched_sacks));
  const pool = row.kind === 'pool';
  const on = [];
  const off = [];

  on.push('/stock');

  if (available > 0) on.push('/stock/summary');
  else off.push('/stock/summary — nothing left in it (available_sacks is 0)');

  if (pool) on.push('/stock/pools');

  // Not a view, but the question behind most of these: may it go on a vehicle?
  if (row.qc_status !== 'pass') {
    off.push(`dispatch — post_dispatch() refuses qc_status='${row.qc_status}'`);
  } else if (available <= 0) {
    off.push('dispatch — no sacks left to draw down');
  }

  return { available, on, off };
}

async function report() {
  if (!(await isDbReady())) {
    logger.error('No database. Check server/.env — SUPABASE_URL and the service key.');
    process.exitCode = 1;
    return;
  }

  const all = await groups.all({}, { sort: 'created_at', ascending: false });
  const rows = all
    .filter((row) => (poolsOnly ? row.kind === 'pool' : true))
    .filter(
      (row) =>
        !only ||
        String(row.label ?? '') === only ||
        displayLabel(row.label) === only.toUpperCase(),
    );

  if (!all.length) {
    logger.warn('stock_groups is empty.');
    logger.warn('');
    logger.warn('Nothing has been filed into the yard at all. The usual cause is that');
    logger.warn('record_packed_stock() does not exist in the project, because');
    logger.warn('supabase/migrations/0001_stock_and_dispatch.sql was never run - packing');
    logger.warn('swallows that failure by design (it must not fail a crew at the bagging');
    logger.warn('line) and only logs a warning, so the yard stays silently empty.');
    return;
  }

  if (!rows.length) {
    logger.warn(`No stock group matches ${only ?? '(that filter)'}. ${all.length} exist in total.`);
    return;
  }

  // The samples, for the pools in this report - the lab's side of a pool.
  const poolLabels = rows.filter((row) => row.kind === 'pool').map((row) => row.label);
  const samples = poolLabels.length
    ? await tests.all({ kind: 'pool', batch_no: poolLabels }, { sort: 'ts', ascending: true })
    : [];

  logger.info(`${rows.length} stock group(s)${poolsOnly ? ' (pools only)' : ''}:`);
  logger.info('');

  for (const row of rows) {
    const { available, on, off } = visibility(row);
    logger.info(
      `${pad(displayLabel(row.label), 16)} ${pad(row.kind, 6)} ${pad(row.quality ?? '∅', 10)} ` +
        `packed ${pad(int(row.packed_sacks), 5)} out ${pad(int(row.dispatched_sacks), 5)} ` +
        `left ${pad(available, 5)} qc=${row.qc_status}`,
    );
    logger.info(`    shows on: ${on.join('  ')}`);
    for (const reason of off) logger.info(`    hidden from ${reason}`);

    if (row.kind === 'pool') {
      const mine = samples.filter((test) => test.batch_no === row.label);
      const filled = slotsOf(row.label).map((slot) => {
        const test = mine
          .filter((t) => slotOf(row.label, t.shift_date ?? String(t.ts ?? '').slice(0, 10)) === slot.slot)
          .pop();
        return `${slot.slot}:${test ? test.verdict : '—'}`;
      });
      logger.info(`    samples: ${filled.join('  ')}`);
      // A sample filed against this pool but dated outside its period belongs
      // to no slot, so it is on the record and on no screen. Worth naming.
      const stray = mine.filter(
        (t) => !slotOf(row.label, t.shift_date ?? String(t.ts ?? '').slice(0, 10)),
      );
      if (stray.length) {
        logger.warn(`    ${stray.length} sample(s) dated outside this pool's period - in no slot`);
      }
    }
    logger.info('');
  }
}

report().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
