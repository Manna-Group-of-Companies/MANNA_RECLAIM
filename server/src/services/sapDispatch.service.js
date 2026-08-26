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
        /*
         * SAP's own line number. The only thing that tells two lines of the
         * same item apart on one document - see the slot key below.
         */
        line_num: num(r.lineNum),
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
       * The document, and then whatever identifies a line within it.
       *
       * This keyed on the item and the batch, on the reasoning that SAP's line
       * numbering was its own business and this end should not depend on it.
       * The plant's own data refused that on the first real run: invoice 149
       * carries item I-10061 on two lines, 2000 kg and 1000 kg, same warehouse
       * and no batch on either - because no invoice line on this install
       * carries one. Two genuine lines with nothing to tell them apart, and a
       * whole quarter refused over it.
       *
       * So the line number is used where the feed sends one. It is not an
       * implementation detail after all: on a document with the same item
       * twice it is the only identity a line has.
       */
      slotOf: (r) =>
        r.line_num == null
          ? `${r.doc_type}|${r.doc_no}|${r.sku}|${r.batch ?? ''}`
          : `${r.doc_type}|${r.doc_no}|${r.line_num}`,
      /*
       * And where two rows collide without one, the message says what to send
       * rather than only that something is wrong. Refusing is still right -
       * without a line number those two rows are indistinguishable, and storing
       * both would as easily be doubling a figure as recording a fact - but a
       * refusal that names the fix is a different thing from a dead end.
       */
      slotSaid: (r) =>
        `${r.doc_type} ${r.doc_no} has ${r.sku} twice and neither line carries a line `
        + 'number, so they cannot be told apart. If SAP really holds the item twice on '
        + 'that document - two deliveries under one invoice, or a pricing split - send '
        + '`lineNum` (INV1.LineNum) on every line and both will be stored. If it does '
        + 'not, the query is joining something it should not.',
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
      lineNum: r.line_num == null ? null : Number(r.line_num),
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
