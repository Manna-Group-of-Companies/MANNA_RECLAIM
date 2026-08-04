/**
 * Takes the product back out of a sleeve or loop batch number.
 *
 *   node scripts/lot-key-split.js            what it would do, writes nothing
 *   node scripts/lot-key-split.js --apply    do it, after taking a backup
 *
 * Until 0007 a lot's number carried both facts in one string:
 *
 *   SLEEVE-03/Aug/26-day        the product's code, the date, the shift
 *
 * It is now the shift alone - `03/Aug/26-day` - and the product is the column
 * beside it. That is a better record and it is not a rename: the rows on the
 * table still hold the old form, in three places that have to move together, and
 * some of them collapse onto each other on the way.
 *
 *   runs           `batch_no` loses its prefix. `product` already holds the
 *                  product's id, so nothing is derived - the prefix is dropped
 *                  and checked against the column rather than trusted.
 *   quality_tests  the same, on `kind = 'lot'` rows. `quality` already holds the
 *                  product.
 *   stock_groups   the same, plus a new label: `<product_id>-<batch_no>`, plus
 *                  the merge below.
 *
 * THE MERGE, which is the whole reason this is a script and not four UPDATEs.
 *
 * The old prefix was the product's `code`, falling back to its id where no code
 * was set. So one product can have lots filed under two prefixes - before and
 * after somebody filled the code in, or before and after it was changed - and
 * those are two rows in the yard that are now one lot:
 *
 *   SLEVE-03/Aug/26-day   140 pieces  ->  SLEVE-03/Aug/26-day   500 pieces
 *   SLEEVE-03/Aug/26-day  360 pieces  ->  (gone)
 *
 * Merging sums the counts, keeps the widest packing span, takes the safest
 * verdict of the two, and repoints any dispatch line that drew from a row being
 * removed. The oldest row is the keeper, so the group's `created_at` still says
 * when that lot first reached the yard.
 *
 * IDEMPOTENT, and it has to be - the one thing this must never do is run twice
 * and double a count. A row is only touched when it is still in the old shape,
 * and "old shape" is decided by a test that is false the moment the row is
 * fixed: `batch_no` set AND the label already equal to `<product>-<batch_no>`
 * means migrated, and the row is skipped whatever its label looks like. A second
 * run therefore finds nothing to split, nothing to merge, and reports so.
 *
 * A row it cannot read is reported and left alone rather than guessed at. That
 * is a lot whose label is not in either shape, or whose prefix matches neither
 * the product's code nor its id - which would mean the label and the product
 * column disagree about what the goods are, and a script is not the thing to
 * settle that.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crud } from '../src/services/base.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES, MOULDING_KINDS } from '../src/config/constants.js';
import { lotLabel } from '../src/utils/stockPeriod.js';

const apply = process.argv.slice(2).includes('--apply');

const runsTable = crud(TABLES.runs, { defaultSort: 'shift_date' });
const testsTable = crud(TABLES.qualityTests, { defaultSort: 'ts' });
const groupsTable = crud(TABLES.stockGroups, { defaultSort: 'created_at' });
const linesTable = crud(TABLES.dispatchLines, { defaultSort: 'id' });

const int = (value) => Number(value ?? 0);

/**
 * The shift half of a number, however the row is currently written.
 *
 *   03/Aug/26-day          -> 03/Aug/26-day   (already split)
 *   SLEEVE-03/Aug/26-day   -> 03/Aug/26-day   (prefixed)
 *
 * Anchored on the shape of the date rather than on the first hyphen, because a
 * product code may contain one - `SLV-2` is a perfectly good code, and splitting
 * on the first hyphen would leave `2-03/Aug/26-day` behind. Null for a string
 * that is neither, which is a row to report rather than to rewrite.
 */
const SHIFT_NO = /(\d{2}\/[A-Za-z]{3}\/\d{2}-(?:day|night))$/;

export const shiftPart = (batchNo) => SHIFT_NO.exec(String(batchNo ?? '').trim())?.[1] ?? null;

/** What was in front of it, or '' when the string is already just the shift. */
export function prefixPart(batchNo) {
  const text = String(batchNo ?? '').trim();
  const shift = shiftPart(text);
  if (!shift) return null;
  const head = text.slice(0, text.length - shift.length);
  return head.endsWith('-') ? head.slice(0, -1) : head;
}

/**
 * Whether a prefix is this product saying its own name.
 *
 * The prefix was the code with the id as a fallback, so both are accepted, and
 * an empty prefix is a row that has already been split. Anything else means the
 * label and the product column disagree, and the row is left for a person.
 */
export const namesProduct = (prefix, product) =>
  prefix === '' ||
  prefix.toUpperCase() === String(product?.id ?? '').trim().toUpperCase() ||
  prefix.toUpperCase() === String(product?.code ?? '').trim().toUpperCase();

/**
 * The verdict two merged groups end up on.
 *
 * A hold on either half holds the lot: the two rows are the same goods, and the
 * bench having stopped some of them is a fact about all of them. `pending` beats
 * `pass` for the same reason in the other direction - what has not been answered
 * for cannot be released by being added to something that was.
 */
export function mergedQc(rows) {
  if (rows.some((row) => row.qc_status === 'fail')) return 'fail';
  if (rows.some((row) => (row.qc_status ?? 'pending') === 'pending')) return 'pending';
  return 'pass';
}

const earliest = (values) => values.filter(Boolean).sort()[0] ?? null;
const latest = (values) => values.filter(Boolean).sort().reverse()[0] ?? null;

/**
 * What each list of rows becomes - worked out before anything is written, and
 * exported so it can be asserted on without a database behind it.
 *
 * All three tables go through the same two questions. Is this row still in the
 * old shape, and does the prefix on it agree with the product column beside it?
 * A row that fails the second is reported rather than rewritten: the label and
 * the product disagreeing about what the goods are is not something a script
 * should settle.
 *
 * `lots` is keyed by `<product>-<shift>`, so two rows that used to be two lots
 * and are now one arrive in the same entry - that is the merge, and it falls out
 * of the keying rather than being looked for.
 */
export function plan({ runs = [], tests = [], groups = [], products = [] } = {}) {
  const byId = new Map(products.map((row) => [String(row.id), row]));
  const problems = [];

  const strip = (rows, productOf, what) => {
    const out = [];
    for (const row of rows) {
      const shift = shiftPart(row.batch_no);
      const prefix = prefixPart(row.batch_no);
      if (!shift) {
        problems.push(`${what} ${row.id}: batch number "${row.batch_no}" is not a shift number`);
        continue;
      }
      if (prefix === '') continue; // already split
      const named = productOf(row);
      if (!namesProduct(prefix, byId.get(String(named ?? '').trim()) ?? { id: named })) {
        problems.push(
          `${what} ${row.id}: "${row.batch_no}" is prefixed ${prefix} but the row says ${named ?? '∅'}`,
        );
        continue;
      }
      out.push({ row, from: row.batch_no, to: shift });
    }
    return out;
  };

  const keyed = new Map();
  for (const group of groups) {
    const product = String(group.product_id ?? group.quality ?? '').trim();
    if (!product) {
      problems.push(`group ${group.label}: no product against it - fill product_id in first`);
      continue;
    }

    /*
     * Already done, and this is the test the whole "safe to run twice" claim
     * rests on.
     *
     * It reads the columns rather than the shape of the label, because the new
     * label legitimately looks like an old one - `SLEVE-03/Aug/26-day` is what a
     * split lot is called and also what an unsplit one was called. Only the
     * batch number being set, and the label being exactly what those two fields
     * build, means the row has been through here.
     */
    if (group.batch_no && group.label === lotLabel(product, group.batch_no)) continue;

    const source = group.batch_no ?? group.label;
    const shift = shiftPart(source);
    const prefix = prefixPart(source);
    if (!shift) {
      problems.push(`group ${group.label}: no shift number in it`);
      continue;
    }
    if (!namesProduct(prefix, byId.get(product) ?? { id: product })) {
      problems.push(`group ${group.label}: prefixed ${prefix} but its product is ${product}`);
      continue;
    }

    const key = lotLabel(product, shift);
    const entry = keyed.get(key) ?? { key, product, batchNo: shift, rows: [] };
    entry.rows.push(group);
    keyed.set(key, entry);
  }

  // Oldest first within each key: the keeper is the row that reached the yard
  // first, so the merged group's created_at still says when this lot started.
  const lots = [...keyed.values()].map((entry) => ({
    ...entry,
    rows: [...entry.rows].sort((a, b) =>
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
    ),
  }));

  return {
    runEdits: strip(runs, (run) => run.product, 'run'),
    testEdits: strip(tests, (test) => test.quality, 'test'),
    lots,
    merges: lots.filter((lot) => lot.rows.length > 1),
    problems,
  };
}

/** What the keeper of a lot ends up holding. The losers are then deleted. */
export const keeperPatch = (lot) => ({
  label: lot.key,
  batch_no: lot.batchNo,
  product_id: lot.product,
  packed_sacks: lot.rows.reduce((n, row) => n + int(row.packed_sacks), 0),
  dispatched_sacks: lot.rows.reduce((n, row) => n + int(row.dispatched_sacks), 0),
  first_packed_on: earliest(lot.rows.map((row) => row.first_packed_on)),
  last_packed_on: latest(lot.rows.map((row) => row.last_packed_on)),
  qc_status: mergedQc(lot.rows),
  kg_per_unit: Math.max(...lot.rows.map((row) => Number(row.kg_per_unit ?? 0))) || null,
});

/** Everything about to be written, on disk, before anything is written. */
function backup(payload) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `lot-key-split-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

async function main() {
  if (!isDbReady()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set - see server/.env.example');
  }

  const { runEdits, testEdits, lots, merges, problems } = plan({
    products: await crud(TABLES.products, { defaultSort: 'sort_order' }).all({}),
    runs: (await runsTable.all({ kind: MOULDING_KINDS })).filter((run) => run.batch_no),
    tests: (await testsTable.all({ kind: 'lot' })).filter((test) => test.batch_no),
    groups: await groupsTable.all({ kind: 'lot' }),
  });

  /* ---- what it comes to ---- */

  if (problems.length) {
    logger.warn(`${problems.length} row(s) cannot be read and are left alone:`);
    for (const line of problems.slice(0, 30)) logger.warn(`  ${line}`);
    if (problems.length > 30) logger.warn(`  ...and ${problems.length - 30} more`);
    logger.warn('');
  }

  if (!runEdits.length && !testEdits.length && !lots.length) {
    logger.info('Nothing is still carrying a product in its batch number. Nothing to do.');
    return;
  }

  logger.info(`${runEdits.length} run(s) to renumber${runEdits.length ? ':' : ''}`);
  for (const edit of runEdits.slice(0, 10)) logger.info(`  ${edit.from} -> ${edit.to}`);
  if (runEdits.length > 10) logger.info(`  ...and ${runEdits.length - 10} more`);

  logger.info(`${testEdits.length} lab test(s) to renumber`);
  logger.info(`${lots.length} stock group key(s), ${merges.length} of them a merge:`);
  for (const lot of lots) {
    const pieces = lot.rows.reduce((n, row) => n + int(row.packed_sacks), 0);
    logger.info(
      `  ${lot.key.padEnd(24)} ${lot.rows.length === 1 ? 'relabel' : `merge ${lot.rows.length}`} ` +
        `${pieces} pieces  <- ${lot.rows.map((row) => row.label).join(' + ')}`,
    );
  }

  if (!apply) {
    logger.info('');
    logger.info('DRY RUN - nothing was written. Re-run with --apply to do it.');
    logger.info('A backup of every row about to change is written first.');
    return;
  }

  /* ---- do it ---- */

  const touchedLines = [];
  for (const lot of merges) {
    for (const loser of lot.rows.slice(1)) {
      touchedLines.push(...(await linesTable.all({ stock_group_id: loser.id })));
    }
  }

  const file = backup({
    written_at: new Date().toISOString(),
    runs: runEdits.map((edit) => edit.row),
    quality_tests: testEdits.map((edit) => edit.row),
    stock_groups: lots.flatMap((lot) => lot.rows),
    dispatch_lines: touchedLines,
  });
  logger.info(`Backup written to ${file}`);

  for (const edit of runEdits) await runsTable.update(edit.row.id, { batch_no: edit.to });
  for (const edit of testEdits) await testsTable.update(edit.row.id, { batch_no: edit.to });

  let merged = 0;
  for (const lot of lots) {
    const [keeper, ...losers] = lot.rows;

    /*
     * The keeper is written first, and it is written to the totals rather than
     * incremented by them - so a run that dies part-way through leaves a group
     * holding the sum of the rows that still exist plus the ones not yet
     * deleted, which the next run recomputes from scratch. Incrementing would
     * make a half-finished run impossible to repeat.
     */
    await groupsTable.update(keeper.id, keeperPatch(lot));

    // Every line that drew from a row about to go now draws from the keeper.
    // Without this the delete is refused - stock_group_id has no cascade, and
    // correctly so: a dispatched load must never be cut loose from its stock.
    for (const loser of losers) {
      for (const line of await linesTable.all({ stock_group_id: loser.id })) {
        await linesTable.update(line.id, { stock_group_id: keeper.id });
      }
      await groupsTable.remove(loser.id);
      merged += 1;
    }
  }

  logger.info(
    `${runEdits.length} run(s) and ${testEdits.length} test(s) renumbered, ` +
      `${lots.length} group(s) rekeyed, ${merged} row(s) merged away.`,
  );
  logger.info('Now run `npm run stock:qc-sync` to put every verdict back in step with the lab.');
}

/*
 * Only when this file is the thing that was run. The planning half above is
 * imported by test/lot-key-split.test.js, and a top-level main() would have that
 * test reaching for a database the moment it loaded the module.
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    logger.error(err.message);
    process.exitCode = 1;
  });
}
