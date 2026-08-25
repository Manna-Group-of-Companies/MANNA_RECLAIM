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
 * What has gone out, as SAP holds it.
 *
 * Three months of it, read once a day off the Manna Rubber Products box. The
 * managing director's question is "what have we been shipping", which no screen
 * in this app could answer: the plant raises its documents in SAP, so this end
 * has never had them.
 *
 * That install raises no delivery notes at all - checked back to 2023 - so the
 * invoice is the dispatch record here, and `docType` says so on every row
 * rather than being assumed. If the plant starts raising deliveries later, both
 * arrive and the reader can tell them apart without a migration.
 *
 * One row per document *line*, never per document. A delivery of three grades
 * is three rows: "what went out as Fine" is most of what this is for, and a
 * feed aggregated at the document would have thrown that away before it
 * arrived. The totals are worked out from the rows here, so the screen can show
 * a figure and then explain it.
 */

const dispatches = crud(TABLES.sapDispatches, { defaultSort: 'doc_date' });

const FEED = 'dispatch';

export const sapDispatchService = {
  /**
   * Take a window of dispatches.
   *
   * The whole window every time rather than only what is new. Documents get
   * cancelled and corrected after the fact, and a feed that only ever appended
   * would carry every cancellation as a delivery that still happened - so the
   * previous window is replaced entire.
   */
  record: ({ source = 'SAP', asOf, from, to, rows = [] } = {}) =>
    recordSnapshot({
      feed: FEED,
      table: TABLES.sapDispatches,
      rows,
      asOf,
      source,
      window: { from: from ?? null, to: to ?? null },
      mapRow: (r) => ({
        doc_no: String(r.docNo).trim(),
        doc_type: clean(r.docType) ?? 'invoice',
        doc_date: clean(r.docDate),
        customer: clean(r.customer),
        customer_code: clean(r.customerCode),
        sku: String(r.sku).trim(),
        description: clean(r.description),
        grade: clean(r.grade),
        batch: clean(r.batch),
        quantity: num(r.quantity) ?? 0,
        unit: clean(r.unit) ?? 'kg',
        /*
         * Null rather than nought where the document does not carry a value. A
         * zero reads as a free delivery, which is a different thing from a
         * document whose value this feed was not given.
         */
        value: num(r.value),
        currency: clean(r.currency),
      }),
      /*
       * A document, a line's item, and the batch it came out of. The item is in
       * the key rather than a line number because SAP's line numbering is its
       * own business and this end should not depend on it - and one invoice
       * carrying the same item twice against different batches is a real thing
       * that must not collapse.
       */
      slotOf: (r) => `${r.doc_type}|${r.doc_no}|${r.sku}|${r.batch ?? ''}`,
      slotSaid: (r) =>
        `${r.doc_type} ${r.doc_no} has ${r.sku} twice against the same batch. `
        + 'Either the query joins something it should not, or SAP holds it twice - '
        + 'both are worth looking at rather than storing.',
      emptySaid:
        'An empty dispatch window is not accepted: a plant that shipped nothing for three '
        + 'months and a query that returned nothing look identical. If the window really is '
        + 'empty, that is a failed run to log rather than a document to send.',
    }),

  latestSync: () => latestSync(FEED),

  /**
   * What went out over the window SAP was asked for, newest first.
   *
   * With the sync that says how old the reading is, always - the same rule the
   * yard is read under, and for the same reason. A dispatch list with no age on
   * it is believed on the day the daily job stopped.
   */
  async current({ grade, customer } = {}) {
    const sync = await latestSync(FEED);
    if (!sync) {
      return { sync: null, rows: [], totals: { rows: 0, documents: 0, byUnit: {}, value: null } };
    }

    const rows = await dispatches
      .all(
        {
          sync_id: sync.id,
          ...(grade ? { grade } : {}),
          ...(customer ? { customer } : {}),
        },
        { sort: 'doc_date' },
      )
      .catch(() => []);

    const said = rows.map((r) => ({
      docNo: r.doc_no,
      docType: r.doc_type ?? null,
      docDate: r.doc_date ?? null,
      customer: r.customer ?? null,
      customerCode: r.customer_code ?? null,
      sku: r.sku,
      description: r.description ?? null,
      grade: r.grade ?? null,
      batch: r.batch ?? null,
      quantity: Number(r.quantity ?? 0),
      unit: r.unit ?? 'kg',
      value: r.value == null ? null : Number(r.value),
      currency: r.currency ?? null,
    }));

    said.sort((a, b) => String(b.docDate ?? '').localeCompare(String(a.docDate ?? '')));

    /*
     * Value is summed only where every line that has one shares a currency. A
     * total over two currencies is a number with no unit, and the plant sells
     * in rupees today - so the case is unlikely and the answer to it is null
     * rather than a figure that would be believed.
     */
    const valued = said.filter((r) => r.value != null);
    const currencies = new Set(valued.map((r) => r.currency ?? ''));
    const value =
      valued.length && currencies.size === 1
        ? {
          amount: Math.round(valued.reduce((sum, r) => sum + (r.value ?? 0), 0) * 100) / 100,
          currency: [...currencies][0] || null,
          /** How many lines carried a value, so a partial total says so. */
          lines: valued.length,
        }
        : null;

    return {
      sync: syncSaid(sync),
      rows: said,
      totals: {
        rows: said.length,
        /* Lines are what is stored; documents are what a person counts. */
        documents: new Set(said.map((r) => `${r.docType}|${r.docNo}`)).size,
        byUnit: perUnit(said),
        value,
      },
    };
  },
};

export default sapDispatchService;
