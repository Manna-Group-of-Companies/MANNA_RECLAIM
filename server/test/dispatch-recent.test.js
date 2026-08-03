import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What has gone out lately.
 *
 * Not a dispatch history screen, and there is none - what a given customer has
 * bought is answered off the customer. This exists so a manager who has just
 * posted a document can see that it landed: without it the way to check is to
 * post it again, and a dispatch is written once and never edited.
 *
 * The sacks and the money are summed off the lines rather than read off the
 * header, because post_dispatch() writes neither onto it. That is one of the
 * two things worth asserting here: a two-line load has to come back as one row
 * carrying both lines, not as one line's worth of stock.
 *
 * The other is the flag. A load with no labour recorded against it is a real
 * thing - the customer's own crew loading their own vehicle - and is also what
 * a form somebody tabbed through looks like. The two are indistinguishable
 * afterwards, so the gap is on the row rather than left to be noticed.
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
  loading_activities: [
    {
      id: 'loading-1',
      dispatch_id: 'dispatch-1',
      loading_mode: 'mixed',
      material_kind: 'reclaim',
      kg_loaded: 750,
      contract_rate_per_kg: 0.4,
      manhour_labourers: 3,
      manhour_hours: 2,
      daily_labour_rate: 80,
      vehicle_no: 'KL05AB1234',
      created_at: '2026-07-30T10:05:00Z',
    },
  ],
});

test('the recent list sums a load off every line it was made of', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { role: 'manager' });
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

  // What left, not only how much. One load is usually more than one grade, and
  // a bare sack count cannot answer "did the Special go".
  assert.deepEqual(row.sacks_by_quality, { Special: 10, Fine: 5 });

  // The loading job, off its own snapshot: 750 kg x 0.40 plus 3 x 2 h x 80.
  assert.equal(row.loading_mode, 'mixed');
  assert.equal(row.loading_cost, 780);
  assert.equal(row.labour_recorded, true);
  assert.equal(row.vehicle, 'KL05AB1234');

  // And it stays out of what was billed. Loading is a cost to serve, not a
  // charge to the customer - a total that quietly included it would be an
  // invoice figure nobody could reconcile.
  assert.equal(row.total, row.goods_total + row.transport_charge);
});

test('a load with no labour recorded against it is flagged, not hidden', async (t) => {
  const tables = seed();
  tables.loading_activities = [];
  const api = await startApi({ tables });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { role: 'manager' });
  assert.equal(res.status, 200);

  const row = (await res.json()).data[0];
  assert.equal(row.labour_recorded, false, 'the gap has to be visible on the list');
  assert.equal(row.loading_cost, 0);
  assert.equal(row.loading_mode, null);

  // Still a dispatch, and still shown in full. A missing loading entry is
  // something to go and ask about, not a reason to withhold the document.
  assert.equal(row.sacks, 15);
  assert.equal(row.total, 31500);
});

test('a load whose lines are missing reads as empty rather than breaking', async (t) => {
  const tables = seed();
  tables.dispatch_lines = [];
  const api = await startApi({ tables });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { role: 'manager' });
  assert.equal(res.status, 200);

  const row = (await res.json()).data[0];
  assert.equal(row.sacks, 0);
  assert.equal(row.lines, 0);
  // Still the transport, because that is on the header and did happen.
  assert.equal(row.total, 500);
});

/**
 * Whoever may raise a document may see that it landed.
 *
 * Every row here names a customer, so this list follows the same door as the
 * form that writes one: the yard and the back office. That is the point of the
 * list - somebody who has just posted a dispatch and cannot see it has no way
 * to tell a double entry from a failed one, and will post it twice to be sure.
 * Widening the form without widening this would have recreated exactly the
 * problem the list exists to solve.
 *
 * A worker and a lab account are refused, and the refusal carries none of what
 * it refused.
 */
test('the ledger follows the form: the yard and the office, and nobody else', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  assert.equal((await api.call('/dispatches', { role: 'manager' })).status, 200);
  assert.equal((await api.call('/dispatches', { role: 'admin' })).status, 200);
  assert.equal(
    (await api.call('/dispatches', { role: 'supervisor' })).status,
    200,
    'the yard raises these, so the yard can see that one landed',
  );

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
