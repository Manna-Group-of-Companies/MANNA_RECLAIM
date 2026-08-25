import { crud, op } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/**
 * What both SAP feeds have in common: taking a snapshot and reading the newest
 * one back.
 *
 * There are two - the yard, read every fifteen minutes, and three months of
 * dispatches, read once a day - and they are the same act. A scheduled script
 * on the plant server reads another company's ERP, posts what it found, and the
 * previous answer is replaced whole. Nothing is added to or drawn down, because
 * that is the only honest way to hold a figure whose truth lives elsewhere: if
 * the two disagree, SAP is right by definition and the argument is about the
 * query rather than about the arithmetic.
 *
 * Shared rather than written twice because the ordering below is subtle and
 * must not diverge between them. Two copies of a three-step dance drift, and
 * the drift is invisible - both feeds go on answering 201.
 */

const syncs = crud(TABLES.sapSyncs, { defaultSort: 'as_of' });

/**
 * How many rows to send Postgres at once.
 *
 * A snapshot of a few thousand rows in one insert is a request body PostgREST
 * will take and a statement Postgres will run, but it is also one thing to go
 * wrong for the whole sync. Batched, a failure is caught with most of the
 * snapshot already in and the run marked failed - which is the state the reader
 * ignores, so the previous snapshot stands rather than half of this one.
 */
const CHUNK = 500;

export const clean = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * A number, or null - and null for the three things that are not a number.
 *
 * `Number(null)` is 0. So is `Number('')` and `Number(' ')`. Left to coerce,
 * every field nobody filled in arrives as a nought, and a nought is a claim:
 * on a dispatch line it says the goods went out free, and on stock it says the
 * yard holds none of something rather than that nobody said.
 *
 * This project has paid for that lesson once already - a validation schema that
 * coerced the same way turned seven unset ideal values into zeros on the live
 * database, and the screen showed targets of nought as though a manager had set
 * them. The absent case is checked before the coercion, not after it.
 */
export const num = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * What a set of rows comes to, per unit and never across units.
 *
 * Reclaim is kilograms and moulded goods are pieces, and one number over the
 * two of them is a yard holding four thousand of something. It matters more
 * here than on a screen: the plant server logs this figure beside its own count
 * so a mismatch between what was sent and what was stored is visible, and a
 * total that quietly added pieces to kilograms would make the two disagree on
 * every run that had a press lot in it - which reads as the sync being broken
 * when what is broken is the arithmetic it is being checked against.
 */
export const perUnit = (rows) => {
  const byUnit = {};
  for (const r of rows) {
    const unit = r.unit ?? 'kg';
    byUnit[unit] = (byUnit[unit] ?? 0) + Number(r.quantity ?? 0);
  }
  for (const unit of Object.keys(byUnit)) {
    byUnit[unit] = Math.round(byUnit[unit] * 100) / 100;
  }
  return byUnit;
};

/**
 * Store one snapshot, and retire the one it replaces.
 *
 * The order is the whole design. A run row is opened first as `pending`, the
 * rows go in against it, and only then is the run marked `ok`. The reader takes
 * the newest `ok` run of that feed and nothing else, so a sync that dies half
 * way through leaves the plant looking at yesterday's figures instead of at
 * half of today's - the failure that would otherwise be invisible, because half
 * a yard looks exactly like a yard.
 *
 * Older snapshots are deleted after the new one lands, never before. Deleting
 * first would leave a window with no answer at all, and that window is
 * precisely when a network failure would strand it.
 *
 * `feed` scopes every part of that. Both feeds share this run table, and a
 * dispatch snapshot that retired the stock one would empty the yard every
 * morning at six - which is the kind of bug that only shows up in production
 * and only once a day.
 */
export const recordSnapshot = async ({
  feed,
  table,
  rows,
  asOf,
  source = 'SAP',
  window,
  mapRow,
  slotOf,
  slotSaid,
  emptySaid,
}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    /*
     * An empty snapshot is refused rather than stored.
     *
     * "There is nothing" and "the query returned nothing because something is
     * wrong" are the same document, and only one of them is a fact about the
     * plant. Refused loudly, it is a thing somebody fixes; stored, it is a
     * screen quietly reporting that the business stopped.
     */
    throw ApiError.badRequest(emptySaid);
  }

  const mapped = rows.map(mapRow);

  /*
   * The same row twice is either a query that is wrong or a fact about SAP, and
   * both are worth refusing over. Kept, the figure is quietly doubled; the
   * unique index would refuse the insert anyway, and this turns a constraint
   * violation into a sentence somebody can act on.
   */
  const seen = new Set();
  for (const r of mapped) {
    const slot = slotOf(r);
    if (seen.has(slot)) throw ApiError.badRequest(slotSaid(r));
    seen.add(slot);
  }

  const byUnit = perUnit(mapped);
  const store = crud(table, { defaultSort: 'created_at' });

  const run = await syncs.create({
    feed,
    source: source || 'SAP',
    as_of: asOf ?? new Date().toISOString(),
    received_at: new Date().toISOString(),
    rows: mapped.length,
    /*
     * The weight, and only the weight. One numeric column cannot hold two
     * units, so it holds the one the plant means when it asks how much - and
     * the full breakdown goes back in the answer rather than being flattened
     * into this. A snapshot of nothing but pieces stores nought here, which is
     * true: it holds no weight.
     */
    total_kg: byUnit.kg ?? 0,
    window_from: window?.from ?? null,
    window_to: window?.to ?? null,
    status: 'pending',
  });

  try {
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const chunk = mapped.slice(i, i + CHUNK).map((r) => ({ ...r, sync_id: run.id }));
      await store.createMany(chunk);
    }
  } catch (err) {
    // Left as `failed` rather than deleted: a run that went wrong is worth
    // being able to see, and the reader ignores anything that is not `ok`.
    await syncs.update(run.id, { status: 'failed', note: err.message }).catch(() => {});
    throw err;
  }

  const saved = await syncs.update(run.id, { status: 'ok' });

  /*
   * And clear out what this replaces. Best-effort on purpose: the snapshot is
   * in and readable, and a tidy-up that failed is a table with an extra
   * fortnight of rows in it rather than a plant with the wrong figures. Logged,
   * not raised - the script on the plant server can do nothing about it.
   */
  try {
    const old = await syncs.all({ feed, id: op.neq(run.id) }, { sort: 'as_of' });
    for (const previous of old) await syncs.remove(previous.id);
  } catch (err) {
    logger.warn(`SAP ${feed}: old snapshots were not cleared - ${err.message}`);
  }

  return { sync: saved, rows: mapped.length, byUnit };
};

/** The last snapshot of one feed that finished, whatever else is in the table. */
export const latestSync = async (feed) => {
  const rows = await syncs.all({ feed, status: 'ok' }, { sort: 'as_of' }).catch(() => []);
  return rows[0] ?? null;
};

/** How old a reading is, said the same way wherever it is read. */
export const syncSaid = (sync) =>
  sync && {
    id: sync.id,
    feed: sync.feed ?? null,
    source: sync.source,
    asOf: sync.as_of,
    receivedAt: sync.received_at,
    rows: sync.rows,
    window:
      sync.window_from || sync.window_to
        ? { from: sync.window_from ?? null, to: sync.window_to ?? null }
        : null,
  };

export default recordSnapshot;
