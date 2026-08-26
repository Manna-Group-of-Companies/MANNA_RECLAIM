import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Stock as SAP holds it, posted by a scheduled script on the plant server.
 *
 * The caller is not a person. Nobody is watching it, nobody sees the response,
 * and the only place a wrong figure gets caught is a log file on a machine in
 * the plant office - so every way of being quietly wrong has to be a loud
 * failure here instead.
 *
 * Four of them:
 *
 *   1. An empty snapshot. "The yard is empty" and "the query returned nothing
 *      because something is broken" are the same document, and only one of them
 *      is a fact about the plant.
 *
 *   2. A half-written snapshot read as the yard. Half a yard looks exactly like
 *      a yard, so a sync that dies part way through must leave yesterday's
 *      figures standing rather than today's fragment.
 *
 *   3. The same item twice. Either the query joins something it should not, or
 *      SAP holds it twice; kept, the plant quietly has one item's stock doubled.
 *
 *   4. Anyone at all being able to post one. The route is on the internet and
 *      the thing behind it is what the office reads the yard off.
 */

const TOKEN = 'test-sync-token-1234567890';
const OTHER = 'test-sync-token-0987654321';

const row = (over = {}) => ({
  sku: 'RCL-FINE-50',
  description: 'Reclaim Rubber Fine 50kg',
  grade: 'Fine',
  batch: '3140',
  warehouse: 'FG01',
  quantity: 4250,
  unit: 'kg',
  ...over,
});

const snapshot = (rows = [row()], over = {}) => ({
  source: 'SAP',
  asOf: '2026-08-25T06:00:00+05:30',
  rows,
  ...over,
});

/** The sync route takes a shared secret, not a session - so `fetch` directly. */
const post = async (api, body, token = TOKEN) =>
  fetch(`${api.base}/sync/sap-stock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const withToken = async (token = TOKEN, tables = {}) => {
  const api = await startApi({ tables: { sap_syncs: [], sap_stock: [], ...tables } });
  const { env } = await import('../src/config/env.js');
  env.sapSyncToken = token;
  return api;
};

test('a snapshot lands, and the yard reads it back with its age', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const sent = await post(
    api,
    snapshot([row(), row({ sku: 'RCL-CRS-50', grade: 'Coarse', batch: null, quantity: 12000 })]),
  );
  assert.equal(sent.status, 201);
  const { data } = await sent.json();
  assert.equal(data.rows, 2);
  /*
   * The answer carries the figures rather than just 'ok'. Nobody is watching
   * the caller, so the only place a wrong figure gets caught is the log it
   * writes - and it can only log what was actually stored if it is told.
   */
  assert.deepEqual(data.totals, { rows: 2, byUnit: { kg: 16250 } });
  assert.ok(data.syncId);

  const read = await api.call('/stock/sap', { role: 'supervisor' });
  assert.equal(read.status, 200);
  const yard = (await read.json()).data;

  assert.equal(yard.rows.length, 2);
  assert.equal(yard.totals.byUnit.kg, 16250);
  // The age travels with the figure, always. A stock number with no age on it
  // is believed on the day the script has been failing silently, which is the
  // day it matters most.
  assert.equal(yard.sync.asOf, '2026-08-25T06:00:00+05:30');
  assert.ok(yard.sync.receivedAt);
});

test('an empty snapshot is refused rather than stored', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const sent = await post(api, snapshot([]));
  // Refused by the schema before it reaches the service, which carries the
  // same guard as a backstop - the document can be built by hand as well as by
  // the script, and neither route may store an empty yard.
  assert.equal(sent.status, 422);

  // And nothing was written, so a plant that has been running for five months
  // does not suddenly read as an empty yard.
  const yard = (await (await api.call('/stock/sap', { role: 'manager' })).json()).data;
  assert.equal(yard.sync, null);
  assert.deepEqual(yard.rows, []);
});

test('the same item twice is a query to look at, not a figure to double', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const sent = await post(api, snapshot([row(), row({ quantity: 999 })]));
  assert.equal(sent.status, 400);
  const { message } = await sent.json();
  assert.match(message, /twice/i);
});

test('a new snapshot replaces the last one rather than adding to it', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  await post(api, snapshot([row({ quantity: 4250 })]));
  await post(api, snapshot([row({ quantity: 3100 })], { asOf: '2026-08-25T18:00:00+05:30' }));

  const yard = (await (await api.call('/stock/sap', { role: 'manager' })).json()).data;
  /*
   * One row, not two, and it is the newer figure. Stock whose truth lives in
   * another system is replaced, never adjusted: added to, the two systems drift
   * and neither can be shown to be right.
   */
  assert.equal(yard.rows.length, 1);
  assert.equal(yard.rows[0].quantity, 3100);
  assert.equal(yard.totals.byUnit.kg, 3100);
  assert.equal(yard.sync.asOf, '2026-08-25T18:00:00+05:30');
});

test('a half-written snapshot is never read as the yard', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  await post(api, snapshot([row({ quantity: 4250 })]));

  /*
   * A run that opened and never finished - which is what a sync killed part way
   * through leaves behind. Half a yard looks exactly like a yard, so the reader
   * takes the newest *finished* run and this one is not it.
   */
  api.tables.sap_syncs.push({
    id: 'half-written',
    as_of: '2026-08-26T06:00:00+05:30',
    received_at: '2026-08-26T06:00:00+05:30',
    source: 'SAP',
    rows: 1,
    status: 'pending',
  });
  api.tables.sap_stock.push({
    id: 'half-row',
    sync_id: 'half-written',
    sku: 'RCL-FINE-50',
    quantity: 11,
    unit: 'kg',
  });

  const yard = (await (await api.call('/stock/sap', { role: 'manager' })).json()).data;
  assert.equal(yard.rows.length, 1);
  assert.equal(yard.rows[0].quantity, 4250, 'yesterday stands, rather than half of today');
});

test('an unmapped grade still arrives, and shows as unmapped', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  // Refused at the door, an item nobody has mapped is stock that silently does
  // not exist - and nobody goes looking for the mapping.
  const sent = await post(api, snapshot([row({ sku: 'NEW-THING-1', grade: null })]));
  assert.equal(sent.status, 201);

  const yard = (await (await api.call('/stock/sap', { role: 'manager' })).json()).data;
  assert.equal(yard.rows[0].grade, null);
  assert.equal(yard.rows[0].sku, 'NEW-THING-1');
});

test('nobody without the token gets to say what is in the yard', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  assert.equal((await post(api, snapshot(), null)).status, 401, 'no token at all');
  assert.equal((await post(api, snapshot(), OTHER)).status, 403, 'the wrong token');

  // And a signed-in manager's session is not a key to this door either: it is a
  // machine route, and a person posting a stock snapshot by hand is not a thing
  // that should work.
  const asManager = await post(api, snapshot(), api.tokenFor('manager'));
  assert.equal(asManager.status, 403);
});

test('with no token configured the route says so, rather than refusing', async (t) => {
  const api = await withToken('');
  t.after(() => api.stop());

  /*
   * 503 and not 401. Answered 401, whoever is standing at the plant server goes
   * hunting for a typo in a token that was never the problem - nobody has set
   * one on the API at all, and only this end knows that.
   */
  const sent = await post(api, snapshot());
  assert.equal(sent.status, 503);
  const { message } = await sent.json();
  assert.match(message, /SAP_SYNC_TOKEN/);
});

test('kilograms and pieces are never added together, on either route', async (t) => {
  const api = await withToken();
  t.after(() => api.stop());

  const sent = await post(
    api,
    snapshot([
      row({ quantity: 4250, unit: 'kg' }),
      row({ sku: 'MLD-SLEEVE-1', grade: null, batch: null, quantity: 120, unit: 'pieces' }),
    ]),
  );
  assert.equal(sent.status, 201);

  /*
   * 4,370 of something is what one total over the two of them would say, and
   * the plant server logs this figure beside its own count to catch a mismatch
   * - so a total that added pieces to kilograms would make the two ends
   * disagree on every run with a press lot in it, which reads as the sync being
   * broken when what is broken is the arithmetic it is checked against.
   */
  const { data } = await sent.json();
  assert.deepEqual(data.totals.byUnit, { kg: 4250, pieces: 120 });

  const yard = (await (await api.call('/stock/sap', { role: 'manager' })).json()).data;
  assert.deepEqual(yard.totals.byUnit, { kg: 4250, pieces: 120 });
});

test('the health check says whether the feed is switched on, without saying more', async (t) => {
  const api = await withToken('');
  t.after(() => api.stop());

  /*
   * Setting this up means somebody at a dashboard in one building and somebody
   * reading a log in another, and the only question between them is whether the
   * token landed. Without an answer they take turns guessing - misspelt, saved
   * empty, wrong service - and each guess costs a redeploy and a phone call.
   */
  const off = await fetch(`${api.base.replace(/\/api\/v1$/, '')}/health`);
  assert.equal(off.status, 200);
  assert.equal((await off.json()).feeds.sapSync, 'not configured');

  const { env } = await import('../src/config/env.js');
  env.sapSyncToken = TOKEN;

  const on = await fetch(`${api.base.replace(/\/api\/v1$/, '')}/health`);
  const body = await on.json();
  assert.equal(body.feeds.sapSync, 'configured');
  // A word, never the value. The point is to answer "is it there", and the
  // answer to "what is it" is nobody's but the plant server's.
  assert.ok(!JSON.stringify(body).includes(TOKEN));
});
