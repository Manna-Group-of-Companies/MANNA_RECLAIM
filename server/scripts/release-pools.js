/**
 * Releases the coarse pools that are stranded at `pending`.
 *
 *   node scripts/release-pools.js         -> show what would change, write nothing
 *   npm run stock:release-pools -- --apply -> do it
 *
 * Why this exists: a coarse pool used to be created `pending`, and nothing in
 * the application could ever make it `pass`. The lab tests a batch and a grade;
 * coarse has neither - the line runs for a shift and the sacks pool by ten-day
 * period - so a pool never reached the Quality tab, applyLabVerdict() refused it
 * by name, and no screen called PATCH /stock/:id/qc. Meanwhile post_dispatch()
 * refuses anything that is not `pass`. Every coarse sack ever packed was
 * therefore unsellable through the app, sitting in the yard reading "awaiting
 * the lab" with nobody able to answer.
 *
 * Coarse is now released as it is packed - see recordPacking() in
 * stock.service.js - and this is the same release applied once to the pools
 * that predate it. It is the JavaScript twin of the `update` in
 * supabase/migrations/0002_loading_activity.sql, for a project that would rather
 * run a command than paste SQL. Running both is harmless; the second finds
 * nothing to do.
 *
 * Only `pending`, and only pools. A pool somebody deliberately put on hold
 * stays on hold - that is a decision, not a gap - and no batch group is touched,
 * because a batch has a real lab verdict and this must not invent one.
 *
 * Dry by default. Nothing is written without --apply.
 */
import { crud } from '../src/services/base.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES } from '../src/config/constants.js';
import { displayLabel } from '../src/utils/stockPeriod.js';

const apply = process.argv.slice(2).includes('--apply');

const groups = crud(TABLES.stockGroups, { defaultSort: 'created_at' });

const int = (value) => Number(value ?? 0);

async function run() {
  if (!(await isDbReady())) {
    logger.error('No database. Check server/.env — SUPABASE_URL and the service key.');
    process.exitCode = 1;
    return;
  }

  const stranded = (await groups.all({ kind: 'pool', qc_status: 'pending' })).sort((a, b) =>
    String(a.label).localeCompare(String(b.label)),
  );

  if (!stranded.length) {
    logger.info('No coarse pool is waiting on a verdict. Nothing to do.');
    return;
  }

  const sacks = stranded.reduce(
    (sum, row) => sum + int(row.available_sacks ?? int(row.packed_sacks) - int(row.dispatched_sacks)),
    0,
  );

  logger.info(
    `${stranded.length} coarse pool(s) stranded at pending, holding ${sacks} sack(s) out of reach:`,
  );
  for (const row of stranded) {
    const left = int(row.available_sacks ?? int(row.packed_sacks) - int(row.dispatched_sacks));
    logger.info(`  ${displayLabel(row.label)}  ${left} sack(s) available  pending -> pass`);
  }

  if (!apply) {
    logger.info('');
    logger.info('Nothing written. Re-run with --apply to release them.');
    return;
  }

  for (const row of stranded) {
    await groups.update(row.id, { qc_status: 'pass' });
  }
  logger.info('');
  logger.info(`Released ${stranded.length} pool(s). They can be dispatched from the Stock view now.`);
}

run().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
