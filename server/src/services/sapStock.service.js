import { crud, op } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/**
 * The yard, as SAP holds it.
 *
 * The plant used to keep its own stock ledger from packing typed by supervisors
 * on the floor. That is off: the plant is too busy to keep a bagging bench up to
 * date, and a figure nobody has time to type is a figure that drifts. A
 * scheduled script on the plant server reads the Manna Rubber Products SAP box
 * and posts what it finds here.
 *
 * A snapshot, not a ledger. Nothing here is added to or drawn down - each sync
 * replaces the last, which is the only honest way to hold a figure whose truth
 * lives in another system. If the two disagree, SAP is right by definition and
 * the argument is about the query rather than about the arithmetic.
 */

const syncs = crud(TABLES.sapSyncs, { defaultSort: 'as_of' });
const stock = crud(TABLES.sapStock, { defaultSort: 'sku' });

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const clean = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

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

export const sapStockService = {
  /**
   * Take a snapshot.
   *
   * The order matters and it is the whole design. A run row is opened first as
   * `pending`, the stock goes in against it, and only then is the run marked
   * `ok`. The reader takes the newest `ok` run and nothing else, so a sync that
   * dies half way through leaves the plant looking at yesterday's figures
   * instead of at half of today's - which is the failure that would otherwise
   * be invisible, because half a yard looks exactly like a yard.
   *
   * Older snapshots are deleted after the new one lands, not before. Deleting
   * first would leave a window with no stock at all, and that window is
   * precisely when a network failure would strand it.
   */
  async record({ source = 'SAP', asOf, rows = [] } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      /*
       * An empty snapshot is refused rather than stored.
       *
       * "The yard is empty" and "the query returned nothing because something
       * is wrong" are the same document, and only one of them is a fact. A
       * plant that has been making rubber for five months does not have an
       * empty yard, so the empty case is a failure every time it happens - and
       * a failure that is refused loudly is one somebody fixes.
       */
      throw ApiError.badRequest(
        'An empty stock snapshot is not accepted: an empty yard and a failed read look identical. '
        + 'Send at least one row, using quantity 0 for an item that has none.',
      );
    }

    const priced = rows.map((r) => ({
      sku: String(r.sku).trim(),
      description: clean(r.description),
      grade: clean(r.grade),
      batch: clean(r.batch),
      warehouse: clean(r.warehouse),
      quantity: num(r.quantity) ?? 0,
      unit: clean(r.unit) ?? 'kg',
    }));

    /*
     * Two rows for the same item, batch and warehouse is either a query that is
     * wrong or a fact about SAP, and both are worth refusing over. Kept, the
     * yard would quietly hold one item twice; the unique index would refuse the
     * insert anyway, and this turns a constraint violation into a sentence.
     */
    const seen = new Set();
    for (const r of priced) {
      const slot = `${r.sku}|${r.batch ?? ''}|${r.warehouse ?? ''}`;
      if (seen.has(slot)) {
        throw ApiError.badRequest(
          `The snapshot has ${r.sku} twice for the same batch and warehouse. `
          + 'Either the query joins something it should not, or SAP holds it twice - '
          + 'both are worth looking at rather than storing.',
        );
      }
      seen.add(slot);
    }

    const run = await syncs.create({
      source: source || 'SAP',
      as_of: asOf ?? new Date().toISOString(),
      received_at: new Date().toISOString(),
      rows: priced.length,
      total_qty: priced.reduce((sum, r) => sum + r.quantity, 0),
      status: 'pending',
    });

    try {
      for (let i = 0; i < priced.length; i += CHUNK) {
        const chunk = priced.slice(i, i + CHUNK).map((r) => ({ ...r, sync_id: run.id }));
        await stock.createMany(chunk);
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
     * fortnight of rows in it rather than a plant with the wrong stock. Logged,
     * not raised - the script on the plant server can do nothing about it.
     */
    try {
      const old = await syncs.all({ id: op.neq(run.id) }, { sort: 'as_of' });
      for (const previous of old) await syncs.remove(previous.id);
    } catch (err) {
      logger.warn(`SAP stock: old snapshots were not cleared - ${err.message}`);
    }

    return { sync: saved, rows: priced.length };
  },

  /** The last sync that finished, whatever else is in the table. */
  async latestSync() {
    const rows = await syncs.all({ status: 'ok' }, { sort: 'as_of' }).catch(() => []);
    return rows[0] ?? null;
  },

  /**
   * The yard as it stands, with the sync that says how old it is.
   *
   * Both, always. A stock figure with no age on it is believed on the day the
   * script has been failing silently, and that is the day it matters most.
   */
  async current({ grade } = {}) {
    const sync = await this.latestSync();
    if (!sync) return { sync: null, rows: [], totals: { rows: 0, byUnit: {} } };

    const rows = await stock
      .all({ sync_id: sync.id, ...(grade ? { grade } : {}) }, { sort: 'sku', ascending: true })
      .catch(() => []);

    /*
     * Totalled per unit rather than into one number. Reclaim is kilograms and
     * moulded goods are pieces, and a screen that added the two would report a
     * yard holding four thousand of something.
     */
    const byUnit = {};
    for (const r of rows) {
      const unit = r.unit ?? 'kg';
      byUnit[unit] = (byUnit[unit] ?? 0) + Number(r.quantity ?? 0);
    }
    for (const unit of Object.keys(byUnit)) byUnit[unit] = Math.round(byUnit[unit] * 100) / 100;

    return {
      sync: {
        id: sync.id,
        source: sync.source,
        asOf: sync.as_of,
        receivedAt: sync.received_at,
        rows: sync.rows,
      },
      rows: rows.map((r) => ({
        sku: r.sku,
        description: r.description ?? null,
        grade: r.grade ?? null,
        batch: r.batch ?? null,
        warehouse: r.warehouse ?? null,
        quantity: Number(r.quantity ?? 0),
        unit: r.unit ?? 'kg',
      })),
      totals: { rows: rows.length, byUnit },
    };
  },
};

export default sapStockService;
