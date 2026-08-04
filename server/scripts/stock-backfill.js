/**
 * Files the packed output that never reached the yard.
 *
 *   node scripts/stock-backfill.js           -> what it would file, writes nothing
 *   node scripts/stock-backfill.js --apply   -> file it
 *   node scripts/stock-backfill.js --apply 2782  -> one batch, or one pool label
 *
 * Why this exists, and why it is not the same job as stock-qc-sync.js.
 *
 * That script fixes a group whose verdict disagrees with the lab. This one is
 * for the case underneath it: there is no group at all. A run carries
 * `packed_sacks` and the yard has never heard of it, so the Stock page has
 * nothing to show, the lab's pass lands on nothing, and stock-qc-sync has
 * nothing to put in step - a verdict releases stock that already exists and
 * does not create any.
 *
 * Two doors let that happen and both are real:
 *
 *   - POST /runs/sync writes runs wholesale, `packed_sacks` included, and never
 *     calls recordPacking(). A tablet that bagged offline files its run and no
 *     stock. Rows loaded straight into Postgres are the same story.
 *   - packSacks() files the group in a try/catch that logs and swallows, so a
 *     packing that could not reach the yard still answers the bench "saved".
 *     That is deliberate - it must not fail a crew standing at the bagging line
 *     - but it means the gap is silent, and silence is what let it reach 96
 *     runs.
 *
 * IDEMPOTENT, and that is the whole design. It works in totals rather than in
 * events: for each label it sums what the runs say was packed, reads what the
 * group says, and files the difference. Run it twice and the second run sees a
 * difference of zero. That is what makes it safe to stop halfway and start
 * again - filing run by run would refile everything already filed under a label
 * the first pass created.
 *
 * It only ever files a shortfall. A group holding MORE than the runs behind it
 * is reported and left alone: drawing a count down is not this script's to do,
 * the oversell CHECK may refuse it, and a group can legitimately hold stock
 * filed by a path these runs do not describe.
 *
 * Dates come off `shift_date`, not off today. Coarse pools by the ten-day
 * period it was packed in, so backfilling April's sacks with today's date would
 * pile four months of coarse into the current pool.
 */
import { stockService } from '../src/services/stock.service.js';
import { crud } from '../src/services/base.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES, COARSE_GRADE, SACK_KG } from '../src/config/constants.js';
import { batchLabel, poolFor, displayLabel } from '../src/utils/stockPeriod.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const only = args.find((arg) => !arg.startsWith('--')) ?? null;

const runs = crud(TABLES.runs, { defaultSort: 'shift_date' });
const groups = crud(TABLES.stockGroups, { defaultSort: 'created_at' });

const int = (value) => Number(value ?? 0);

/**
 * The group a bagged run belongs in, worked out the way packSacks() works it
 * out - never taken from the row.
 *
 * A run that can form no label is one with sacks on it and no batch number or
 * no grade. It is reported rather than guessed at: inventing a label would file
 * real sacks under a name nobody can look up.
 */
function targetOf(run) {
  const grade = run.quality ?? (run.line === 'coarse' ? COARSE_GRADE : null);
  if (!grade) return null;
  if (grade === COARSE_GRADE) {
    if (!run.shift_date) return null;
    const pool = poolFor(run.shift_date);
    return { label: pool.label, quality: COARSE_GRADE, batchNo: null, pool };
  }
  if (!run.batch_no) return null;
  return { label: batchLabel(run.batch_no, grade), quality: grade, batchNo: String(run.batch_no), pool: null };
}

async function main() {
  if (!isDbReady()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set - see server/.env.example');
  }

  const all = await runs.all({}, { sort: 'shift_date', ascending: true });
  const yard = await groups.all({});
  const byLabel = new Map(yard.map((row) => [String(row.label), row]));

  /** What the runs say each label holds, and the earliest shift behind it. */
  const wanted = new Map();
  const unkeyable = [];

  for (const run of all) {
    const packed = int(run.packed_sacks);
    if (packed <= 0) continue;
    const target = targetOf(run);
    if (!target) {
      unkeyable.push(run);
      continue;
    }
    const entry = wanted.get(target.label) ?? { ...target, sacks: 0, from: run.shift_date, runs: 0 };
    entry.sacks += packed;
    entry.runs += 1;
    // The earliest shift under this label, which is the day the group is filed
    // as packed on - and, for a pool, the day its period is derived from.
    if (run.shift_date && (!entry.from || run.shift_date < entry.from)) entry.from = run.shift_date;
    wanted.set(target.label, entry);
  }

  const selected = [...wanted.values()].filter(
    (entry) =>
      !only ||
      entry.label === only ||
      displayLabel(entry.label) === only.toUpperCase() ||
      String(entry.batchNo ?? '') === only,
  );

  const short = [];
  const over = [];
  for (const entry of selected) {
    const group = byLabel.get(entry.label);
    const have = group ? int(group.packed_sacks) : 0;
    const delta = entry.sacks - have;
    if (delta > 0) short.push({ ...entry, have, delta, exists: Boolean(group) });
    else if (delta < 0) over.push({ ...entry, have, delta });
  }

  if (unkeyable.length) {
    logger.warn(`${unkeyable.length} run(s) have sacks on them and cannot be keyed to a group:`);
    for (const run of unkeyable.slice(0, 20)) {
      logger.warn(
        `  ${run.shift_date} ${run.shift ?? ''} ${run.kind ?? ''} qty=${run.packed_sacks} ` +
          `batch=${run.batch_no ?? '∅'} quality=${run.quality ?? '∅'} - ${
            run.quality || run.line === 'coarse' ? 'no batch number' : 'no grade'
          }`,
      );
    }
    logger.warn('  These need the batch number or grade filling in on the run first.');
    logger.warn('');
  }

  if (over.length) {
    logger.warn(`${over.length} group(s) hold MORE than the runs behind them - left alone:`);
    for (const row of over) {
      logger.warn(`  ${displayLabel(row.label)}: runs say ${row.sacks}, the group says ${row.have}`);
    }
    logger.warn('  Filed twice, or filed by a path these runs do not describe. Check before touching.');
    logger.warn('');
  }

  if (!short.length) {
    logger.info('Every label the runs describe is already in the yard at that count. Nothing to file.');
    return;
  }

  logger.info(`${short.length} group(s) to file${apply ? '' : ' - DRY RUN, nothing will be written'}:`);
  let sacks = 0;
  for (const row of short) {
    sacks += row.delta;
    logger.info(
      `  ${String(displayLabel(row.label)).padEnd(16)} ${row.exists ? 'top up' : 'create'} ` +
        `+${String(row.delta).padEnd(5)} (runs ${row.sacks}, group ${row.have})  ` +
        `from ${row.from}  ${row.runs} run(s)`,
    );
  }
  logger.info(`  ${sacks} sacks in total, about ${Math.round(sacks * SACK_KG)} kg.`);

  if (!apply) {
    logger.info('');
    logger.info('Re-run with --apply to file it. The QC status of each group is asked of the');
    logger.info('lab as it is created, so a batch already passed opens on that pass.');
    return;
  }

  let filed = 0;
  for (const row of short) {
    try {
      await stockService.recordPacking({
        quality: row.quality,
        batchNo: row.batchNo,
        delta: row.delta,
        packedOn: row.from,
      });
      filed += 1;
    } catch (err) {
      logger.error(`  ${displayLabel(row.label)}: ${err.message}`);
    }
  }
  logger.info(`${filed} of ${short.length} group(s) filed.`);
  logger.info('Now run `npm run stock:qc-sync` to put every verdict in step with the lab.');
}

main().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
