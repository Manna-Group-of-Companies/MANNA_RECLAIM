import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { toSupervisorRow, toManagerRow } from '../src/services/stock.service.js';

/**
 * The wall between the shop floor and the back office.
 *
 * A supervisor needs to know what is in the yard. They have no business knowing
 * who bought any of it or at what price, and "the screen does not render it" is
 * not a way of keeping that from them - it would be in the response either way,
 * one devtools tab away. So the two things worth asserting are that the routes
 * that carry commercial information refuse them outright, and that the one route
 * they do get carries nothing but stock.
 */

const GROUP = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'pool',
  label: '2026-08-H1',
  quality: 'Coarse',
  packed_sacks: 40,
  dispatched_sacks: 12,
  available_sacks: 28,
  qc_status: 'pass',
  period_start: '2026-08-01',
  period_end: '2026-08-10',
  created_at: '2026-08-01T00:00:00Z',
};

const CUSTOMER = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'UNITED',
  phone: '9876543210',
  address: 'Kottayam',
  active: true,
  created_at: '2026-01-01T00:00:00Z',
};

/** Anything that would say who bought what, or for how much. */
const FORBIDDEN_KEYS = [
  'unit_price', 'price', 'rate', 'amount', 'line_total', 'total', 'goods_total',
  'customer', 'customer_id', 'customer_name', 'dispatched_sacks', 'packed_sacks',
  'transport_charge', 'lines', 'dispatches',
];

test('a supervisor cannot reach the customer list, and a manager can', async (t) => {
  const api = await startApi({ tables: { customers: [{ ...CUSTOMER }] } });
  t.after(() => api.stop());

  const refused = await api.call('/customers', { role: 'supervisor' });
  assert.equal(refused.status, 403, 'a supervisor must be turned away at the route');
  const refusedBody = await refused.json();
  assert.equal(refusedBody.success, false);
  assert.equal(
    JSON.stringify(refusedBody).includes('UNITED'),
    false,
    'the refusal must not carry any of the data it refused',
  );

  // The same call as a manager, so the 403 above is provably the role gate
  // rather than the route simply not existing.
  const allowed = await api.call('/customers', { role: 'manager' });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).data[0].name, 'UNITED');
});

test('a supervisor cannot reach a customer’s dispatch history', async (t) => {
  const api = await startApi({ tables: { customers: [{ ...CUSTOMER }] } });
  t.after(() => api.stop());

  const res = await api.call(`/customers/${CUSTOMER.id}/dispatches`, { role: 'supervisor' });
  assert.equal(res.status, 403);
});

test('a supervisor cannot post a dispatch or read the full stock table', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...GROUP }] } });
  t.after(() => api.stop());

  assert.equal((await api.call('/stock', { role: 'supervisor' })).status, 403);
  assert.equal((await api.call(`/stock/${GROUP.id}`, { role: 'supervisor' })).status, 403);

  const posted = await api.call('/dispatches', {
    role: 'supervisor',
    method: 'POST',
    body: {
      customer_id: CUSTOMER.id,
      dispatch_date: '2026-08-01',
      lines: [{ stock_group_id: GROUP.id, sacks: 1, unit_price: 36 }],
    },
  });
  assert.equal(posted.status, 403);
});

test('/stock/summary carries no price, customer or dispatch field', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...GROUP }] } });
  t.after(() => api.stop());

  const res = await api.call('/stock/summary', { role: 'supervisor' });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.data.length, 1);
  const row = body.data[0];

  // Exactly these four keys, in the response the supervisor actually receives.
  assert.deepEqual(
    Object.keys(row).sort(),
    ['available_sacks', 'label', 'qc_status', 'quality'],
  );
  for (const key of FORBIDDEN_KEYS) {
    assert.equal(key in row, false, `/stock/summary must not carry ${key}`);
  }

  // And nowhere else in the envelope either - not in meta, not in a message.
  const wire = JSON.stringify(body);
  for (const key of FORBIDDEN_KEYS) {
    assert.equal(wire.includes(`"${key}"`), false, `${key} must be absent from the whole body`);
  }

  assert.equal(row.label, 'AUG-H1', 'a pool is shown by its period, not its stored label');
  assert.equal(row.available_sacks, 28);
});

test('the two serializers are separate - the summary is not the manager row stripped', () => {
  const manager = toManagerRow(GROUP);
  const supervisor = toSupervisorRow(GROUP);

  // The manager's row is the one that carries the commercial half.
  assert.equal(manager.dispatched_sacks, 12);
  assert.equal(manager.packed_sacks, 40);

  assert.deepEqual(Object.keys(supervisor).sort(), [
    'available_sacks', 'label', 'qc_status', 'quality',
  ]);

  // A column added to stock_groups later must not appear in the supervisor's
  // copy by default. Building it field by field is what guarantees that; this
  // is the assertion that would fail if someone rewrote it as a delete-list.
  const withNewColumn = { ...GROUP, negotiated_price: 44, sold_to: 'UNITED' };
  assert.deepEqual(Object.keys(toSupervisorRow(withNewColumn)).sort(), [
    'available_sacks', 'label', 'qc_status', 'quality',
  ]);
});
