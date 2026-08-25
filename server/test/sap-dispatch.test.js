import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What has gone out, as SAP holds it - three months of it, read once a day.
 *
 * The plant raises its documents in SAP, so this end has never had them, and the
 * managing director's question - what have we been shipping - had no screen that
 * could answer it.
 *
 * Everything the stock feed has to get right applies here too, and two more:
 *
 *   1. The two feeds share a run table. A dispatch snapshot that retired the
 *      stock one would empty the yard every morning at six - a bug that only
 *      appears in production, only once a day, and looks like the stock sync
 *      having failed.
 *
 *   2. Value across two currencies. A total over both is a number with no unit,
 *      and it would be believed.
 */

const TOKEN = 'test-sync-token-1234567890';

const line = (over = {}) => ({
  docNo: 'INV-2026-00841',
  docType: 'invoice',
  docDate: '2026-08-24',
  customer: 'Some Rubber Works Pvt Ltd',
  customerCode: 'C00042',
  sku: 'RCL-FINE-50',
  description: 'Reclaim Rubber Fine 50kg',
  grade: 'Fine',
  batch: null,
  quantity: 4250,
  unit: 'kg',
  value: 318750,
  currency: 'INR',
  ...over,
});

const window_ = (rows = [line()], over = {}) => ({
  source: 'SAP',
  asOf: '2026-08-26T06:00:00+05:30',
  from: '2026-05-26',
  to: '2026-08-26',
  rows,
  ...over,
});

const post = async (api, path, body, token = TOKEN) =>
  fetch(`${api.base}/sync/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const withToken = async (tables = {}) => {
  const api = await startApi({
    tables: { sap_syncs: [], sap_stock: [], sap_dispatches: [], ...tables },
  });
  const { env } = await import('../src/config/env.js');
  env.sapSyncToken = TOKEN;
  return api;
};

const read = async (api, role = 'md', query = '') => {
  const res = await api.call(`/dispatches/sap${query}`, { role });
  assert.equal(res.status, 200);
  return (await res.json()).data;
};

test('a window lands, one row per document line, with its age and its span', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const sent = await post(
    api,
    'sap-dispatch',
    window_([
      line(),
      // The same invoice, a second grade. One document, two lines - which is
      // most of what this feed is for: "what went out as Fine" cannot be asked
      // of a feed aggregated at the document.
      line({ sku: 'RCL-CRS-50', grade: 'Coarse', quantity: 8000, value: 240000 }),
    ]),
  );
  assert.equal(sent.status, 201);
  const { data } = await sent.json();
  assert.equal(data.rows, 2);
  assert.deepEqual(data.window, { from: '2026-05-26', to: '2026-08-26' });

  const out = await read(api);
  assert.equal(out.totals.rows, 2, 'two lines');
  assert.equal(out.totals.documents, 1, 'off one document');
  assert.equal(out.totals.byUnit.kg, 12250);
  assert.equal(out.totals.value.amount, 558750);
  assert.equal(out.totals.value.currency, 'INR');
  assert.equal(out.sync.asOf, '2026-08-26T06:00:00+05:30');
  assert.deepEqual(out.sync.window, { from: '2026-05-26', to: '2026-08-26' });
});

test('a dispatch window does not retire the yard', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const stock = await post(api, 'sap-stock', {
    asOf: '2026-08-26T06:00:00+05:30',
    rows: [{ sku: 'RCL-FINE-50', grade: 'Fine', quantity: 4250, unit: 'kg' }],
  });
  assert.equal(stock.status, 201);

  await post(api, 'sap-dispatch', window_());

  /*
   * Both feeds share one run table, and the retire step scopes itself by feed.
   * Without that scoping the daily dispatch run would delete the stock run on
   * the way past and the yard would read empty every morning - which looks
   * exactly like the stock sync having failed, on a day it worked perfectly.
   */
  const yard = (await (await api.call('/stock/sap', { role: 'manager' })).json()).data;
  assert.equal(yard.rows.length, 1, 'the yard is still there');
  assert.equal(yard.totals.byUnit.kg, 4250);

  const out = await read(api);
  assert.equal(out.rows.length, 1, 'and so are the dispatches');
});

test('a new window replaces the last one entirely', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  await post(api, 'sap-dispatch', window_([line({ quantity: 4250 })]));
  await post(
    api,
    'sap-dispatch',
    window_([line({ quantity: 4250 }), line({ docNo: 'INV-2026-00842', quantity: 1000 })], {
      asOf: '2026-08-27T06:00:00+05:30',
    }),
  );

  /*
   * Two lines, not three. Documents get cancelled and corrected after the fact,
   * so a feed that only ever appended would carry every cancellation as a
   * delivery that still happened.
   */
  const out = await read(api);
  assert.equal(out.totals.rows, 2);
  assert.equal(out.totals.documents, 2);
});

test('the same item twice on one document against one batch is refused', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const sent = await post(api, 'sap-dispatch', window_([line(), line({ quantity: 9 })]));
  assert.equal(sent.status, 400);
  const { message } = await sent.json();
  assert.match(message, /twice/i);
});

test('the same item on one document against two batches is two lines', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  // A real thing, and it must not collapse - which is why the batch is in the
  // key rather than SAP's own line numbering, which is its business not ours.
  const sent = await post(
    api,
    'sap-dispatch',
    window_([line({ batch: '3140' }), line({ batch: '3142', quantity: 1000 })]),
  );
  assert.equal(sent.status, 201);
  assert.equal((await read(api)).totals.rows, 2);
});

test('an empty window is refused rather than stored', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  // A plant that shipped nothing for three months and a query that returned
  // nothing are the same document, and only one of them is a fact.
  assert.equal((await post(api, 'sap-dispatch', window_([]))).status, 422);
  const out = await read(api);
  assert.equal(out.sync, null);
});

test('a value nobody gave is null, and two currencies do not add up', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  await post(
    api,
    'sap-dispatch',
    window_([
      line({ value: 318750, currency: 'INR' }),
      // No value on the document at all. Null, not nought - a zero reads as a
      // free delivery, which is a different fact.
      line({ docNo: 'INV-2026-00842', value: null, currency: null }),
    ]),
  );

  const one = await read(api);
  assert.equal(one.rows.find((r) => r.docNo === 'INV-2026-00842').value, null);
  assert.equal(one.totals.value.amount, 318750);
  assert.equal(one.totals.value.lines, 1, 'and it says only one line carried a value');

  const mixed = await withToken();
  t.after(() => mixed.stop());
  await post(
    mixed,
    'sap-dispatch',
    window_([
      line({ value: 100, currency: 'INR' }),
      line({ docNo: 'INV-9', value: 100, currency: 'USD' }),
    ]),
  );
  /*
   * A total across two currencies is a number with no unit, and it would be
   * believed. Null instead - the rows are all there to be read one by one.
   */
  assert.equal((await read(mixed)).totals.value, null);
});

test('a credit note goes through rather than bouncing the quarter', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const sent = await post(
    api,
    'sap-dispatch',
    window_([line(), line({ docNo: 'CN-2026-0004', quantity: -500, value: -37500 })]),
  );
  assert.equal(sent.status, 201, 'a return is a real line, not a document to refuse');
  assert.equal((await read(api)).totals.byUnit.kg, 3750);
});

test('the office and the managing director read it; the yard does not', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());
  await post(api, 'sap-dispatch', window_());

  for (const role of ['md', 'manager', 'admin']) {
    const res = await api.call('/dispatches/sap', { role });
    assert.equal(res.status, 200, `${role} could not read the dispatches`);
  }

  /*
   * A supervisor raises a dispatch and reads what left lately, which is what
   * DISPATCH_ROLES is for. A quarter's shipping with every customer and every
   * value on it is a different thing, and it stays with the office.
   */
  assert.equal((await api.call('/dispatches/sap', { role: 'supervisor' })).status, 403);
  assert.equal((await api.call('/dispatches/sap', { role: 'worker' })).status, 403);
});
