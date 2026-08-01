/**
 * Puts every batch stock group's QC status back in step with the lab.
 *
 *   node scripts/stock-qc-sync.js --explain  -> show the join, write nothing
 *   node scripts/stock-qc-sync.js --dry      -> show what would change
 *   npm run stock:qc-sync                    -> apply
 *
 * Why this exists: a lab verdict and a stock group's `qc_status` are the same
 * fact kept in two places, and until quality.service.js began carrying it
 * across, only the test row was ever written. A batch the lab had passed went
 * on showing as `QC pending` in the yard and post_dispatch() went on refusing
 * to load it, with no screen anywhere that set the column - it could only be
 * reached by hand through PATCH /stock/:id/qc.
 *
 * So this is for the groups packed and tested before that fix. It is safe to
 * run more than once: it only touches groups whose status disagrees with the
 * lab's newest word, and leaves untested groups exactly as they are.
 *
 * The two records are joined on `<batch>-<grade>`, which is built on one side
 * from a stock group's label and on the other from a test's `batch_no` and
 * `quality`. That is the only thing tying them together, so when a group stays
 * pending with a passed test apparently sitting beside it, the answer is
 * somewhere in that join - which is what --explain prints.
 */
import { stockService } from '../src/services/stock.service.js';
import { crud } from '../src/services/base.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES } from '../src/config/constants.js';
import { batchLabel } from '../src/utils/stockPeriod.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const explain = args.includes('--explain');
/** `--explain 2776` narrows the report to one batch. */
const only = args.find((arg) => !arg.startsWith('--')) ?? null;

const groups = crud(TABLES.stockGroups, { defaultSort: 'created_at' });
const tests = crud(TABLES.qualityTests, { defaultSort: 'ts' });

/** The key both sides are joined on, or null where a row cannot form one. */
const keyOfTest = (test) =>
  (test.kind ?? 'batch') === 'batch' && test.batch_no && test.quality
    ? batchLabel(test.batch_no, test.quality)
    : null;

const show = (value) => (value === null || value === undefined || value === '' ? '∅' : value);

/**
 * Prints both sides of the join and what each stock group makes of it. This is
 * a read - it writes nothing - so it is safe to run against the live project
 * while the plant is working.
 */
async function report() {
  const yard = (await groups.all({ kind: 'batch' })).filter(
    (row) => !only || String(row.label ?? '').startsWith(`${only}-`),
  );
  const lab = (await tests.all({}, { sort: 'ts', ascending: true })).filter(
    (row) => !only || String(row.batch_no ?? '') === only,
  );

  logger.info(`Stock groups (kind=batch)${only ? ` for batch ${only}` : ''}: ${yard.length}`);
  for (const row of yard) {
    logger.info(`  label=${show(row.label)}  quality=${show(row.quality)}  qc_status=${show(row.qc_status)}`);
  }

  logger.info(`Quality tests${only ? ` for batch ${only}` : ''}: ${lab.length}`);
  for (const row of lab) {
    logger.info(
      `  batch_no=${show(row.batch_no)}  quality=${show(row.quality)}  kind=${show(row.kind)}` +
        `  verdict=${show(row.verdict)}  ts=${show(row.ts)}  -> joins on ${show(keyOfTest(row))}`,
    );
  }

  // Oldest first, so the newest verdict on each key is what is left standing -
  // the same rule reconcileQc() and the Quality tab both read tests by.
  const standing = new Map();
  for (const row of lab) {
    const key = keyOfTest(row);
    if (key) standing.set(key, row.verdict);
  }

  logger.info('Verdict:');
  if (!yard.length) {
    logger.info('  No batch stock groups. Nothing has been packed against a batch number.');
  }
  for (const row of yard) {
    const verdict = standing.get(row.label);
    if (!verdict) {
      const near = [...standing.keys()].filter((key) => key.split('-')[0] === String(row.label).split('-')[0]);
      logger.info(
        `  ${row.label}: no test joins to it.` +
          (near.length
            ? ` The lab has answered on ${near.join(', ')} - so the grade on the test does not` +
              ' match the grade the sacks were packed as.'
            : ' No test names this batch number at all, or they were filed under a different one.'),
      );
    } else if (verdict === 'pass' && row.qc_status !== 'pass') {
      logger.info(`  ${row.label}: passed by the lab, still ${row.qc_status}. The sync will release it.`);
    } else if (verdict === 'hold' && row.qc_status !== 'fail') {
      logger.info(`  ${row.label}: held by the lab, still ${row.qc_status}. The sync will block it.`);
    } else {
      logger.info(`  ${row.label}: ${row.qc_status}, and the lab says ${verdict}. Already in step.`);
    }
  }
}

async function main() {
  if (!isDbReady()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set - see server/.env.example');
  }

  if (explain) return report();

  const changes = await stockService.reconcileQc({ apply: !dryRun });

  if (!changes.length) {
    logger.info('Every batch group already agrees with the lab. Nothing to do.');
    logger.info('If the yard still shows a passed batch as pending, run --explain to see the join.');
    return;
  }

  for (const { label, from, to } of changes) {
    logger.info(`  ${label}: ${from} -> ${to}`);
  }
  logger.info(
    dryRun
      ? `${changes.length} group(s) would change. --dry: nothing was written.`
      : `${changes.length} group(s) updated.`,
  );
}

main().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
