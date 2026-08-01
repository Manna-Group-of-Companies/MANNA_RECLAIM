import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What has gone out lately.
 *
 * The yard posts dispatches now, so the yard has to be able to see them - a
 * crew who cannot tell whether a document landed will post it a second time to
 * find out, and a dispatch is written once and never edited. There was no
 * standalone ledger before because the only question anyone asked was per
 * customer, which is a back-office question.
 *
 * The sacks and the money are summed off the lines rather than read off the
 * header, because post_dispatch() writes neither onto it. That is the part
 * worth asserting: a two-line load has to come back as one row carrying both
 * lines, not as one line's worth of stock.
 */

const CUSTOMER_ID = '55555555-5555-4555-8555-555555555555';

const seed = () => ({
  customers: [{ id: CUSTOMER_ID, name: 'UNITED', active: true }],
  dispatches: [
    {
      id: 'dispatch-1',
      customer_id: CUSTOMER_ID,
      dispatch_date: '2026-07-30',
      dispatched_at: '2026-07-30',
      transport_provided: true,
      transport_charge: 500,
      remarks: null,
      created_at: '2026-07-30T10:00:00Z',
    },
  ],
  // One vehicle loaded off two groups - the case a header count would get wrong.
  dispatch_lines: [
    {
      id: 'line-1',
      dispatch_id: 'dispatch-1',
      stock_group_id: 'group-a',
      quality: 'Special',
      sacks: 10,
      unit_price: 2200,
      line_total: 22000,
      created_at: '2026-07-30T10:00:01Z',
    },
    {
      id: 'line-2',
      dispatch_id: 'dispatch-1',
      stock_group_id: 'group-b',
      quality: 'Fine',
      sacks: 5,
      unit_price: 1800,
      line_total: 9000,
      created_at: '2026-07-30T10:00:02Z',
    },
  ],
});

test('the recent list sums a load off every line it was made of', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { role: 'supervisor' });
  // Read once: the body is a stream, and spending it on a failure message is
  // what leaves the assertion below with nothing to parse.
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));

  const { data } = body;
  assert.equal(data.length, 1, 'two lines are one dispatch, not two');

  const row = data[0];
  assert.equal(row.sacks, 15, 'both lines count towards what left');
  assert.equal(row.lines, 2);
  assert.equal(row.goods_total, 31000);
  assert.equal(row.transport_charge, 500);
  assert.equal(row.total, 31500, 'the transport charge is part of what was billed');

  // Resolved from the customers table - the header only carries the id.
  assert.equal(row.customer, 'UNITED');
});

test('a load whose lines are missing reads as empty rather than breaking', async (t) => {
  const tables = seed();
  tables.dispatch_lines = [];
  const api = await startApi({ tables });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { role: 'supervisor' });
  assert.equal(res.status, 200);

  const row = (await res.json()).data[0];
  assert.equal(row.sacks, 0);
  assert.equal(row.lines, 0);
  // Still the transport, because that is on the header and did happen.
  assert.equal(row.total, 500);
});

test('the ledger is for whoever may load a vehicle, and nobody else', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  assert.equal((await api.call('/dispatches', { role: 'manager' })).status, 200);
  assert.equal((await api.call('/dispatches', { role: 'supervisor' })).status, 200);

  for (const role of ['worker', 'lab']) {
    const res = await api.call('/dispatches', { role });
    assert.equal(res.status, 403, `${role} has no business reading what was sold`);
    assert.equal(
      JSON.stringify(await res.json()).includes('UNITED'),
      false,
      'the refusal must not carry any of the data it refused',
    );
  }
});
