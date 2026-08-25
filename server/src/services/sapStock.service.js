import { crud } from './base.service.js';
import { TABLES } from '../config/constants.js';
import {
  clean,
  latestSync,
  num,
  perUnit,
  recordSnapshot,
  syncSaid,
} from './sapFeed.service.js';

/**
 * The yard, as SAP holds it.
 *
 * The plant used to keep its own stock ledger from packing typed by supervisors
 * on the floor. That is off: the plant is too busy to keep a bagging bench up to
 * date, and a figure nobody has time to type is a figure that drifts. A
 * scheduled script on the plant server reads the Manna Rubber Products SAP box
 * every fifteen minutes and posts what it finds here.
 *
 * A snapshot, not a ledger - see sapFeed.service, which holds the part this
 * shares with the dispatch feed and the reasoning behind the order it does it
 * in. What is left here is the shape of a stock row and nothing else.
 */

const stock = crud(TABLES.sapStock, { defaultSort: 'sku' });

const FEED = 'stock';

export const sapStockService = {
  /** Take a snapshot of the yard. */
  record: ({ source = 'SAP', asOf, rows = [] } = {}) =>
    recordSnapshot({
      feed: FEED,
      table: TABLES.sapStock,
      rows,
      asOf,
      source,
      mapRow: (r) => ({
        sku: String(r.sku).trim(),
        description: clean(r.description),
        grade: clean(r.grade),
        batch: clean(r.batch),
        warehouse: clean(r.warehouse),
        quantity: num(r.quantity) ?? 0,
        unit: clean(r.unit) ?? 'kg',
      }),
      slotOf: (r) => `${r.sku}|${r.batch ?? ''}|${r.warehouse ?? ''}`,
      slotSaid: (r) =>
        `The snapshot has ${r.sku} twice for the same batch and warehouse. `
        + 'Either the query joins something it should not, or SAP holds it twice - '
        + 'both are worth looking at rather than storing.',
      emptySaid:
        'An empty stock snapshot is not accepted: an empty yard and a failed read look identical. '
        + 'Send at least one row, using quantity 0 for an item that has none.',
    }),

  latestSync: () => latestSync(FEED),

  /**
   * The yard as it stands, with the sync that says how old it is.
   *
   * Both, always. A stock figure with no age on it is believed on the day the
   * script has been failing silently, and that is the day it matters most.
   */
  async current({ grade } = {}) {
    const sync = await latestSync(FEED);
    if (!sync) return { sync: null, rows: [], totals: { rows: 0, byUnit: {} } };

    const rows = await stock
      .all({ sync_id: sync.id, ...(grade ? { grade } : {}) }, { sort: 'sku', ascending: true })
      .catch(() => []);

    return {
      sync: syncSaid(sync),
      rows: rows.map((r) => ({
        sku: r.sku,
        description: r.description ?? null,
        grade: r.grade ?? null,
        batch: r.batch ?? null,
        warehouse: r.warehouse ?? null,
        quantity: Number(r.quantity ?? 0),
        unit: r.unit ?? 'kg',
      })),
      totals: { rows: rows.length, byUnit: perUnit(rows) },
    };
  },
};

export default sapStockService;
