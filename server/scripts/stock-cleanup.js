/**
 * Stock in the yard that no run made.
 *
 *   npm run stock:cleanup            -> what it would change, and writes nothing
 *   npm run stock:cleanup -- --apply -> take it out
 *
 * Deleting a run used to leave its packing standing. The row went from History,
 * the sacks stayed in the group, and there was no screen on either side that
 * could show the difference - the yard simply held stock nothing had made. That
 * is fixed at the door now (run.service.js clearTraces), but every delete made
 * before the fix left its sacks behind, and those are still there. This is what
 * takes them out.
 *
 * How the figure is arrived at: every surviving run is walked and its packed
 * count added to the group it would have filed into - the same targetOf() that
 * packing and un-packing both key on, so this cannot disagree with them about
 * which group a run belongs to. A group holding more than the runs behind it
 * account for is holding the difference for a run that no longer exists.
 *
 * Three rules it will not break:
 *
 *   - it only ever takes stock *out*. A group holding less than its runs
 *     account for is reported and left alone: that is packing that never
 *     reached the yard, and inventing sacks to fix it would be worse than the
 *     discrepancy.
 *   - it never goes below what has been dispatched. Those sacks left the gate
 *     and the ledger says so; the surplus is reported as needing a dispatch
 *     reversal instead.
 *   - a group that empties completely and has never dispatched anything is
 *     deleted, the same rule reversePacking() applies at the door. One that has
 *     dispatched is kept whatever is left, because dispatch_lines points at it.
 *
 * One approximation is worth knowing about before running it with --apply. A
 * coarse pool is keyed on the day the sacks were *filed*, and a run records
 * only the shift it was made on - bagging is same-day or next-morning work, so
 * the two agree nearly always, but a run bagged across a ten-day boundary is
 * counted against the wrong pool here. Read the dry run first: a pair of pools
 * where one is short by what the other is over is that, and not an orphan.
 */
import { crud } from '../src/services/base.service.js';
import { stockService, targetOf } from '../src/services/stock.service.js';
import { productService } from '../src/services/product.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES, COARSE_GRADE, isMoulding } from '../src/config/constants.js';
import { displayLabel } from '../src/utils/stockPeriod.js';

const apply = process.argv.slice(2).includes('--apply');

const groups = crud(TABLES.stockGroups, { defaultSort: 'created_at' });
const runs = crud(TABLES.runs, { defaultSort: 'started_at' });

const int = (value) => Number(value ?? 0);
const pad = (text, width) => String(text).padEnd(width);

/**
 * What each surviving run put into the yard, totalled by group label.
 *
 * A press is boxed by the piece against its product and pack, and the pack is
 * read off the products table exactly as packPieces() reads it - a run boxed
 * loose and one boxed fifty to a pack are two different labels, and getting
 * that wrong here would report a whole product's stock as orphaned.
 */
async function packedByLabel() {
  const rows = await runs.all({});
  const products = new Map();
  const totals = new Map();
  const unkeyed = [];

  for (const run of rows) {
    // Both benches that count in pieces. Which group they filed into differs -
    // a press pools by product and pack, a sleeve or loop shift is its own lot -
    // and `kind` below is what carries that through targetOf(), the same way
    // packPieces() does. Keyed a second way here, the two would disagree and a
    // whole activity's stock would report as orphaned.
    const press = run.kind === 'press' || isMoulding(run.kind);
    const qty = press ? int(run.packed_pieces) : int(run.packed_sacks);
    if (qty <= 0) continue;

    let target;
    if (press) {
      const key = String(run.product ?? '').trim();
      if (key && !products.has(key)) {
        products.set(key, await productService.findById(key).catch(() => null));
      }
      const product = products.get(key) ?? null;
      const productId = product?.id ?? key ?? null;
      target = targetOf({
        kind: isMoulding(run.kind) ? 'lot' : 'product',
        productId,
        packSize: product?.pack_size ?? null,
        quality: productId,
        batchNo: run.batch_no,
        packedOn: run.shift_date ?? undefined,
      });
    } else {
      target = targetOf({
        quality: run.quality ?? (run.line === 'coarse' ? COARSE_GRADE : null),
        batchNo: run.batch_no,
        packedOn: run.shift_date ?? undefined,
      });
    }

    // A run with nothing to key a group on filed no stock when it was packed
    // either, so it is not evidence for or against any group.
    if (!target) {
      unkeyed.push({ id: run.id, qty });
      continue;
    }
    totals.set(target.label, (totals.get(target.label) ?? 0) + qty);
  }

  return { totals, unkeyed };
}

async function run() {
  if (!(await isDbReady())) {
    logger.error('No database. Check server/.env - SUPABASE_URL and the service key.');
    process.exitCode = 1;
    return;
  }

  const all = await groups.all({}, { sort: 'created_at', ascending: false });
  if (!all.length) {
    logger.info('stock_groups is empty - nothing to clean up.');
    return;
  }

  const { totals, unkeyed } = await packedByLabel();

  const orphaned = [];
  const short = [];
  for (const group of all) {
    const packed = int(group.packed_sacks);
    const dispatched = int(group.dispatched_sacks);
    const expected = totals.get(group.label) ?? 0;
    if (packed === expected) continue;

    if (packed < expected) {
      short.push({ group, expected, packed });
      continue;
    }

    // Never below what left the gate, whatever the runs say.
    const surplus = packed - expected;
    const takeable = Math.max(0, Math.min(surplus, packed - dispatched));
    orphaned.push({ group, expected, packed, dispatched, surplus, takeable });
  }

  logger.info(`${all.length} stock group(s), ${orphaned.length} holding stock no run accounts for.`);
  logger.info('');

  for (const row of orphaned) {
    const { group, expected, packed, surplus, takeable } = row;
    const unit = group.unit ?? 'sacks';
    logger.info(
      `${pad(displayLabel(group.label), 16)} ${pad(group.kind, 7)} ` +
        `holds ${pad(packed, 5)} runs account for ${pad(expected, 5)} ` +
        `-> take back ${takeable} ${unit}${takeable === 0 ? '' : expected === 0 && group.dispatched_sacks === 0 ? ' (and delete the group)' : ''}`,
    );
    if (takeable < surplus) {
      logger.warn(
        `    ${surplus - takeable} ${unit} of the surplus has already been dispatched - reverse that dispatch to clear the rest`,
      );
    }
  }

  for (const row of short) {
    logger.warn(
      `${pad(displayLabel(row.group.label), 16)} holds ${row.packed} but its runs packed ${row.expected} - ` +
        'packing that never reached the yard. Left alone; re-pack those runs to file it.',
    );
  }
  if (unkeyed.length) {
    const qty = unkeyed.reduce((sum, row) => sum + row.qty, 0);
    logger.warn(
      `${unkeyed.length} run(s) packed ${qty} with nothing to key a group on - no batch number, or no product. Not counted either way.`,
    );
  }

  if (!orphaned.length) {
    logger.info('');
    logger.info('The yard matches the runs behind it.');
    return;
  }

  if (!apply) {
    logger.info('');
    logger.info('Nothing was written. Re-run with --apply to take the surplus out.');
    return;
  }

  logger.info('');
  let cleared = 0;
  let removed = 0;
  for (const row of orphaned) {
    if (row.takeable <= 0) continue;
    try {
      const after = await stockService.reversePacking({ label: row.group.label, qty: row.takeable });
      cleared += row.takeable;
      if (after?.removed) removed += 1;
      logger.info(
        `${displayLabel(row.group.label)}: took back ${row.takeable}${after?.removed ? ' and deleted the empty group' : ` - ${after?.available_sacks ?? '?'} left`}`,
      );
    } catch (err) {
      logger.error(`${displayLabel(row.group.label)}: ${err.message}`);
    }
  }
  logger.info('');
  logger.info(`${cleared} taken out of the yard, ${removed} empty group(s) deleted.`);
}

run().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
