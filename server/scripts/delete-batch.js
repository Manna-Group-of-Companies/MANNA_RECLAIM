/**
 * Takes a batch off the record, with everything logged against it.
 *
 *   node scripts/delete-batch.js 3077           -> what it would remove, writes nothing
 *   node scripts/delete-batch.js 3077 --apply   -> removes it
 *
 * Why this is a script and not a hand-edit in the SQL editor.
 *
 * A batch is not a row. Every batch the plant has lives inside ONE json document
 * - the plant state row, under `doc.batches` - which every tablet reads and
 * writes, and which the server only ever rewrites under a version guard: read
 * the document with its version, write it back only if the version is still what
 * it was, retry if somebody got there first (see mutateBatches). Editing that
 * json by hand has no such guard. Whatever a tablet on the floor wrote in the
 * same few seconds - a grade marked, another batch opened, an autoclave
 * unloaded - is silently thrown away, and not just for the batch being removed:
 * the whole document goes back to what it looked like when the editor loaded it.
 *
 * The second reason is that a batch number is not held only in that document.
 * Runs carry `batch_no`, quality tests carry `batch_no`, and packed sacks sit in
 * a stock group that a run filed them into. Deleting the batch alone leaves all
 * three pointing at a number nothing answers to, and leaves the yard holding
 * stock no run made - which is a state this plant has been in before and needed
 * its own cleanup script to get out of (see stock-cleanup.js).
 *
 * So this goes through the services the app itself uses, in their order:
 *
 *   1. the runs, through runService.discard() - which takes their packing back
 *      out of the yard and their samples off the lab's table first, and refuses
 *      outright if what a run packed has already been sold.
 *   2. the batch, through batchService.remove() - which removes the quality
 *      tests still filed against the number and then rewrites the document under
 *      the version guard.
 *
 * Nothing here can be undone from any screen. The dry run is the whole point:
 * read it, and be sure the batch in front of you is the one you meant.
 */
import { logger } from '../src/config/logger.js';
import { crud } from '../src/services/base.service.js';
import { batchService } from '../src/services/batch.service.js';
import { runService } from '../src/services/run.service.js';
import { TABLES } from '../src/config/constants.js';

const runs = crud(TABLES.runs);
const tests = crud(TABLES.qualityTests);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ref = args.find((a) => !a.startsWith('--'));

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * The batch with this number, paged through rather than asked for in one go:
 * list() caps a page at 200 whatever it is handed (see parsePagination), and a
 * plant three thousand batches into its series would have this report "no such
 * batch" for one that is plainly on the screen in front of them.
 */
async function findByRef(wanted) {
  for (let page = 1; page <= 100; page += 1) {
    const { rows, total, limit } = await batchService.list({ page, limit: 200 });
    const hit = rows.find((b) => same(b.ref, wanted));
    if (hit) return hit;
    if (!rows.length || page * limit >= total) return null;
  }
  return null;
}

/** `Refiner 4 · 11 Aug Night · 1250 kg · 25 sacks` - a run in one line. */
const describeRun = (run) =>
  [
    run.machine ?? run.machine_id ?? 'unknown machine',
    [run.shift_date, run.shift].filter(Boolean).join(' ') || 'no shift',
    run.ended_at ? null : 'STILL OPEN',
    run.weight_kg != null ? `${run.weight_kg} kg` : null,
    run.packed_sacks ? `${run.packed_sacks} sacks packed` : null,
    run.packed_pieces ? `${run.packed_pieces} pieces packed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

async function main() {
  if (!ref) {
    throw new Error(
      'Which batch? Give its number:\n\n' +
        '  node scripts/delete-batch.js 3077\n' +
        '  node scripts/delete-batch.js 3077 --apply',
    );
  }

  const batch = await findByRef(ref);
  if (!batch) throw new Error(`No batch numbered ${ref} is on record.`);

  const linkedRuns = (await runs.all({ batch_no: batch.ref })).sort((a, b) =>
    String(a.shift_date ?? '').localeCompare(String(b.shift_date ?? '')),
  );
  const linkedTests = await tests.all({ batch_no: batch.ref }).catch(() => []);

  logger.info('');
  logger.info(`Batch ${batch.ref}`);
  logger.info(`  vessel      ${batch.machine_id ?? '-'}`);
  logger.info(`  charged     ${batch.shift_date ?? '-'} ${batch.shift ?? ''}`.trimEnd());
  logger.info(`  status      ${batch.status}${batch.autoclave_done ? ', unloaded' : ', in the vessel'}`);
  logger.info(`  formulation ${batch.formulation ?? '-'}`);
  logger.info(`  grades      ${batch.qualities?.length ? batch.qualities.join(', ') : 'none marked'}`);
  logger.info(`  weighed     ${batch.weighed_kg != null ? `${batch.weighed_kg} kg` : 'nothing'}`);
  logger.info('');

  logger.info(`${linkedRuns.length} run(s) logged against it:`);
  for (const run of linkedRuns) logger.info(`  - ${describeRun(run)}`);
  if (!linkedRuns.length) logger.info('  (none - the batch is an orphan)');
  logger.info('');
  logger.info(`${linkedTests.length} quality test(s) filed against it.`);

  /*
   * The two facts worth stopping on. A charge still in the vessel is one the
   * floor may be standing in front of, and a run that packed sacks has stock in
   * the yard behind it - discard() takes that stock back out, which is correct
   * and is also a movement somebody may be reconciling against.
   */
  const cooking = linkedRuns.some((r) => !r.ended_at);
  const packed = linkedRuns.filter((r) => r.packed_sacks || r.packed_pieces);
  if (cooking) logger.warn('This batch still has an OPEN run - it may be in the autoclave now.');
  if (packed.length) {
    logger.warn(
      `${packed.length} of those runs packed stock, which comes back out of the yard with them.`,
    );
  }

  if (!apply) {
    logger.info('');
    logger.info('Dry run - nothing was changed. Add --apply to remove all of the above.');
    return;
  }

  logger.info('');
  logger.info(`Removing batch ${batch.ref} and everything above.`);

  let removedRuns = 0;
  for (const run of linkedRuns) {
    try {
      await runService.discard(run.id);
      removedRuns += 1;
      logger.info(`  run removed: ${describeRun(run)}`);
    } catch (err) {
      // Left standing on purpose: discard() refuses a run whose output has
      // already been sold, and the batch below will then refuse too. Stopping
      // here would be worse than reporting it - the rest is already gone.
      logger.error(`  run KEPT (${describeRun(run)}): ${err.message}`);
    }
  }

  const result = await batchService.remove(batch.id);
  logger.info('');
  logger.info(
    `Batch ${result.ref} removed. ${removedRuns} run(s) and ${result.qualityTests} quality test(s) went with it.`,
  );
}

main().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
