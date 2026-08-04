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
 *
 * The customer list is the sharp edge of this, and it is why issuing a dispatch
 * is the back office's. A dispatch names the customer it goes to and the price
 * it goes at, so anyone who can post one can read the list - there is no
 * arrangement where a supervisor fills the form in and does not see it. The
 * form moved rather than the wall. What the yard keeps is /stock/summary: what
 * is packed, what grade, and whether the lab passed it, which is what loading a
 * vehicle actually needs to know.
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

/**
 * The customer list, and who it is now open to.
 *
 * The yard raises its own dispatch notes, and a dispatch names the customer it
 * goes to - so a supervisor can read the list and the last price that customer
 * paid. That is a deliberate widening and the reason it is asserted rather than
 * merely allowed: the two reads a dispatch form needs are open, and nothing
 * else about a customer is.
 *
 * A worker and a lab account are still refused everything here, and the refusal
 * carries none of what it refused - a 403 that echoes the row back is not a
 * refusal.
 */
test('the customer list is open to whoever may dispatch, and to nobody else', async (t) => {
  const api = await startApi({ tables: { customers: [{ ...CUSTOMER }], dispatches: [] } });
  t.after(() => api.stop());

  /** Everything about a customer that is not "who is this lorry going to". */
  const officeOnly = [
    ['/customers', 'POST'],
    [`/customers/${CUSTOMER.id}`, 'GET'],
    [`/customers/${CUSTOMER.id}`, 'PATCH'],
    // A customer's whole trading history, priced. A different question from the
    // one a dispatch form asks, so it stayed behind the office's door.
    [`/customers/${CUSTOMER.id}/dispatches`, 'GET'],
  ];
  /** The two a dispatch form cannot be filled in without. */
  const forDispatch = [
    ['/customers', 'GET'],
    [`/customers/${CUSTOMER.id}/last-prices`, 'GET'],
  ];

  const call = (path, method, role) =>
    api.call(path, { role, method, body: method === 'GET' ? undefined : { name: 'X' } });

  // Nothing here is reachable by a worker or a lab account, dispatch form or no.
  for (const role of ['worker', 'lab']) {
    for (const [path, method] of [...officeOnly, ...forDispatch]) {
      const res = await call(path, method, role);
      assert.equal(res.status, 403, `${method} ${path} must refuse a ${role}`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(
        JSON.stringify(body).includes('UNITED'),
        false,
        `${method} ${path} must not leak a customer name in its refusal`,
      );
    }
  }

  // A supervisor gets the two the form needs and none of the rest.
  for (const [path, method] of officeOnly) {
    const res = await call(path, method, 'supervisor');
    assert.equal(res.status, 403, `${method} ${path} is still the back office's`);
    assert.equal(
      JSON.stringify(await res.json()).includes('UNITED'),
      false,
      `${method} ${path} must not leak a customer name in its refusal`,
    );
  }
  for (const [path, method] of forDispatch) {
    const res = await call(path, method, 'supervisor');
    assert.notEqual(res.status, 403, `${method} ${path} is needed to raise a dispatch`);
  }

  const yard = await api.call('/customers', { role: 'supervisor' });
  assert.equal(yard.status, 200);
  assert.equal((await yard.json()).data[0].name, 'UNITED', 'the yard can name the customer');

  // And the 403s above are the role gate rather than the routes not existing.
  const allowed = await api.call('/customers', { role: 'manager' });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).data[0].name, 'UNITED');
});

/**
 * The rate card, by the other door.
 *
 * `/rates/customers` answers off the customers table with `select: '*'` - the
 * whole record, phone and address included - and `/rates` is what every
 * customer has negotiated for every grade. Neither carried a role gate at all,
 * only `authenticate`, which meant the wall on /customers above was one route
 * away from meaningless the whole time it stood.
 *
 * This is the assertion that keeps that shut. It is about worker and lab: they
 * are the two that could read the plant's entire selling side and now cannot.
 */
test('the rate card is not a back door to the customer list', async (t) => {
  const api = await startApi({
    tables: { customers: [{ ...CUSTOMER }], customer_rates: [], price_list: [] },
  });
  t.after(() => api.stop());

  for (const role of ['worker', 'lab']) {
    for (const path of ['/rates/customers', '/rates', '/rates/price-list', '/rates/quote']) {
      const res = await api.call(path, { role });
      assert.equal(res.status, 403, `${path} must refuse a ${role}`);
      assert.equal(
        JSON.stringify(await res.json()).includes('UNITED'),
        false,
        `${path} must not leak a customer name to a ${role}`,
      );
    }
  }

  // The plant's own costs are a further door in again, and the yard is not
  // through it: raising a dispatch note is no reason to see the overheads.
  assert.equal((await api.call('/rates/cost-rates', { role: 'supervisor' })).status, 403);
  // What the yard does get is the two figures a loading job is costed by, which
  // is what the dispatch form puts on screen.
  assert.notEqual((await api.call('/rates/loading-rates', { role: 'supervisor' })).status, 403);
  assert.equal((await api.call('/rates/loading-rates', { role: 'worker' })).status, 403);
});

/**
 * Who may raise a document, and what still does not come with it.
 *
 * The yard dispatches now - the vehicle is loaded there and the supervisor
 * standing at it knows what went on it. What did not move is the ledger: /stock
 * is the packed-against-dispatched reconciliation and stays the office's, and
 * the yard reads /stock/summary, which says what is there and what the lab said
 * and nothing about what has been sold off it.
 */
test('the yard may dispatch; the ledger behind it is still the office’s', async (t) => {
  const api = await startApi({
    tables: { stock_groups: [{ ...GROUP }], customers: [{ ...CUSTOMER }] },
    /*
     * The document is written by the function, in one transaction - the
     * draw-down, the lock and the rollback are asserted against a model of
     * Postgres in dispatch-concurrency.test.js. All this one needs is a
     * function that files a header, because what is being asserted here is the
     * guard in front of it rather than anything the guard lets through.
     */
    functions: {
      post_dispatch: (args, store) => {
        (store.dispatches ||= []).push({
          id: args.p_id,
          customer_id: args.p_customer_id,
          dispatch_date: args.p_dispatch_date,
          sacks: 1,
          weight_kg: 50,
        });
        return { goods_total: 36, transport_charge: 0, total: 36, sacks: 1, weight_kg: 50 };
      },
    },
  });
  t.after(() => api.stop());

  const body = {
    customer_id: CUSTOMER.id,
    dispatch_date: '2026-08-01',
    lines: [{ stock_group_id: GROUP.id, sacks: 1 }],
    prices: { Coarse: 36 },
  };

  // Nobody below the yard. A worker and a lab account have no business sending
  // goods out, and the refusal is before anything is written.
  for (const role of ['worker', 'lab']) {
    const res = await api.call('/dispatches', { role, method: 'POST', body });
    assert.equal(res.status, 403, `a ${role} must not be able to issue a dispatch`);
  }
  assert.equal(api.tables.dispatches?.length ?? 0, 0, 'and neither of them wrote anything');

  // The yard can, which is the whole point of the change.
  const yard = await api.call('/dispatches', { role: 'supervisor', method: 'POST', body });
  assert.equal(yard.status, 201, await yard.text());

  const posted = await api.call('/dispatches', {
    role: 'manager',
    method: 'POST',
    body: { ...body, dispatch_date: '2026-08-02' },
  });
  assert.equal(posted.status, 201, await posted.text());

  // Reconciling what was packed against what has been sold is the back office's
  // too - that is the manager's table, and the yard reads /stock/summary.
  assert.equal((await api.call('/stock', { role: 'supervisor' })).status, 403);
  assert.equal((await api.call(`/stock/${GROUP.id}`, { role: 'supervisor' })).status, 403);
  assert.equal((await api.call('/stock/summary', { role: 'supervisor' })).status, 200);
});

test('/stock/summary carries no price, customer or dispatch field', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...GROUP }] } });
  t.after(() => api.stop());

  const res = await api.call('/stock/summary', { role: 'supervisor' });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.data.length, 1);
  const row = body.data[0];

  // Exactly these keys, in the response the supervisor actually receives. `id`
  // is the group's key and is here so a dispatch line can name the stock it
  // came off; it says nothing about who bought what, which is what the rest of
  // this list is checking stays absent.
  assert.deepEqual(Object.keys(row).sort(), SUPERVISOR_KEYS);
  for (const key of FORBIDDEN_KEYS) {
    assert.equal(key in row, false, `/stock/summary must not carry ${key}`);
  }

  // And nowhere else in the rows either - not on a nested object, not on a
  // second row shaped differently from the first.
  const wire = JSON.stringify(body.data);
  for (const key of FORBIDDEN_KEYS) {
    assert.equal(wire.includes(`"${key}"`), false, `${key} must be absent from every row`);
  }

  // The envelope's meta is pagination and nothing else. `total` there is a row
  // count, which is why the scan above is over the rows rather than the whole
  // body - but it still has to be only that.
  assert.deepEqual(Object.keys(body.meta).sort(), ['limit', 'page', 'pages', 'total']);

  assert.equal(row.label, 'AUG-H1', 'a pool is shown by its period, not its stored label');
  assert.equal(row.available_sacks, 28);
});

/**
 * A group that has gone out entirely is still listed.
 *
 * It used to be dropped from the shop floor's read, on the argument that an
 * empty group is not stock. That is true and beside the point: somebody at the
 * gate looking for a pallet and not finding it on the screen has not been told
 * it is empty, they have been told nothing, and the next move is a phone call.
 * "AUG-H1, nothing left" is the answer. The card draws it as spent and offers
 * no Dispatch button, so it costs a line rather than a doubt.
 */
test('a spent group is listed rather than dropped, on both reads', async (t) => {
  const spent = {
    ...GROUP,
    id: '33333333-3333-4333-8333-333333333333',
    label: '2026-07-H3',
    packed_sacks: 20,
    dispatched_sacks: 20,
    available_sacks: 0,
  };
  const api = await startApi({ tables: { stock_groups: [{ ...GROUP }, spent] } });
  t.after(() => api.stop());

  const floor = await api.call('/stock/summary', { role: 'supervisor' });
  assert.equal(floor.status, 200);
  const rows = (await floor.json()).data;
  assert.equal(rows.length, 2, 'the shop floor sees the spent group too');

  const empty = rows.find((row) => row.label === 'JUL-H3');
  assert.ok(empty, 'and it is named by the period the yard reads');
  assert.equal(empty.available_sacks, 0);

  // Both sides list the same set. The difference between the manager's read
  // and the floor's is the fields on each row, not which rows there are - which
  // is what the wall between them was ever about.
  const office = await api.call('/stock', { role: 'manager' });
  assert.equal((await office.json()).data.length, 2);
});

/**
 * The whole of the shop floor's row, listed rather than described.
 *
 * It grew when the Stock page did - the unit, the weight, the packing dates and
 * the pack a moulded group is boxed in are all physical fact about goods a
 * supervisor is standing next to, so they are on this side of the wall. What did
 * not grow is the commercial half: the packed/dispatched split is the back
 * office's reconciliation, and `qc_by` names a colleague.
 *
 * Written out in full on purpose. The assertion is not "these fields are there",
 * it is "these and no others", which is what catches a column added to
 * stock_groups next year arriving here by default.
 */
const SUPERVISOR_KEYS = [
  'available_kg', 'available_packs', 'available_qty', 'available_sacks',
  // The batch number the goods carry. Physical fact about a pallet the
  // supervisor is standing at, and half of what names a sleeve or loop lot -
  // the yard's card puts it in the reference slot with the product beside it.
  'batch_no',
  'first_packed_on', 'id', 'kind', 'label', 'last_packed_on', 'pack_size',
  'qc_status', 'quality', 'unit',
];

test('the two serializers are separate - the summary is not the manager row stripped', () => {
  const manager = toManagerRow(GROUP);
  const supervisor = toSupervisorRow(GROUP);

  // The manager's row is the one that carries the commercial half.
  assert.equal(manager.dispatched_sacks, 12);
  assert.equal(manager.packed_sacks, 40);

  assert.deepEqual(Object.keys(supervisor).sort(), SUPERVISOR_KEYS);

  // A column added to stock_groups later must not appear in the supervisor's
  // copy by default. Building it field by field is what guarantees that; this
  // is the assertion that would fail if someone rewrote it as a delete-list.
  const withNewColumn = { ...GROUP, negotiated_price: 44, sold_to: 'UNITED' };
  assert.deepEqual(Object.keys(toSupervisorRow(withNewColumn)).sort(), SUPERVISOR_KEYS);
});

/**
 * The verdict's signature is the manager's, not the yard's.
 *
 * Who released a lot is a record about a colleague, and the floor does not need
 * it to load a lorry - the verdict itself is the operative fact and that is on
 * both rows. It is asserted rather than merely omitted because it is a field
 * added late to a serializer whose whole discipline is that nothing arrives in
 * it by default.
 */
test('who signed off the QC is on the back office row only', () => {
  const signed = {
    ...GROUP,
    qc_by: 'u_manager',
    qc_at: '2026-08-02T09:00:00Z',
    qc_source: 'manual',
  };

  const manager = toManagerRow(signed);
  assert.equal(manager.qc_by, 'u_manager');
  assert.equal(manager.qc_source, 'manual');

  const supervisor = toSupervisorRow(signed);
  assert.equal(supervisor.qc_status, 'pass', 'the floor still sees the verdict');
  assert.deepEqual(Object.keys(supervisor).sort(), SUPERVISOR_KEYS);
});

/**
 * The lab's read of what the presses made.
 *
 * It has to exist - a moulded group is keyed on its product and pack, so it is
 * on neither the batch card nor the pool list, and boxed pieces would sit at
 * `pending` with no bench able to reach them. What it must not do is become the
 * hole in the wall: it is put in front of the lab, who have no business in the
 * yard's ledger, so it carries stock and verdicts and nothing commercial.
 */
test('/stock/moulded is readable by the lab and carries nothing commercial', async (t) => {
  const api = await startApi({
    tables: {
      stock_groups: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          kind: 'product',
          label: 'LOOP-50',
          quality: 'LOOP',
          product_id: 'LOOP',
          unit: 'pieces',
          pack_size: 50,
          kg_per_unit: 0.4,
          packed_sacks: 4000,
          dispatched_sacks: 1000,
          available_sacks: 3000,
          qc_status: 'pending',
          first_packed_on: '2026-08-07',
          last_packed_on: '2026-08-07',
          created_at: '2026-08-07T12:00:00Z',
        },
      ],
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/stock/moulded', { role: 'lab' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.length, 1);

  const row = body.data[0];
  assert.equal(row.product_id, 'LOOP', 'the product, which is what a verdict names');
  assert.equal(row.available_qty, 3000);
  assert.equal(row.unit, 'pieces');

  // The packed-against-dispatched split is the back office's reconciliation and
  // has no business at the bench, whatever else this route grew to carry.
  for (const key of FORBIDDEN_KEYS) {
    assert.equal(key in row, false, `/stock/moulded must not carry ${key}`);
  }
  const wire = JSON.stringify(body.data);
  for (const key of FORBIDDEN_KEYS) {
    assert.equal(wire.includes(`"${key}"`), false, `${key} must be absent from every row`);
  }
});

/**
 * A moulded group reads as pieces on both sides.
 *
 * The count column is called `packed_sacks` whatever the group is counted in,
 * so the unit is the only thing standing between "four thousand loops" and a
 * screen that says four thousand sacks. Both serializers carry it, and both
 * carry the count under the honest name as well as the old one.
 */
test('a moulded group is counted in pieces, on both reads', () => {
  const moulded = {
    id: '44444444-4444-4444-8444-444444444444',
    kind: 'product',
    label: 'LOOP-50',
    quality: 'LOOP',
    product_id: 'LOOP',
    unit: 'pieces',
    pack_size: 50,
    kg_per_unit: 0.4,
    packed_sacks: 4000,
    dispatched_sacks: 1000,
    available_sacks: 3000,
    qc_status: 'pending',
    first_packed_on: '2026-08-01',
    last_packed_on: '2026-08-02',
    created_at: '2026-08-01T00:00:00Z',
  };

  const manager = toManagerRow(moulded);
  assert.equal(manager.unit, 'pieces');
  assert.equal(manager.available_qty, 3000);
  assert.equal(manager.available_packs, 60, '3000 pieces at 50 to a pack');
  assert.equal(manager.available_kg, 1200, 'and 0.4 kg apiece');

  const supervisor = toSupervisorRow(moulded);
  assert.equal(supervisor.unit, 'pieces');
  assert.equal(supervisor.available_qty, 3000);
  assert.equal(supervisor.available_packs, 60);
  // Still nothing about what has already been sold off it.
  assert.deepEqual(Object.keys(supervisor).sort(), SUPERVISOR_KEYS);
});

/**
 * A product with no pack size set is boxed loose, and says so.
 *
 * The pack count is null rather than the piece count - a "1 pack" reading off an
 * unset field is a number nobody entered, and it would be indistinguishable from
 * a product genuinely boxed one at a time. Same for the weight of a product with
 * no piece weight recorded.
 */
test('an unset pack or piece weight reports nothing rather than a guess', () => {
  const loose = toManagerRow({
    id: '55555555-5555-4555-8555-555555555555',
    kind: 'product',
    label: 'SLEVE-LOOSE',
    quality: 'SLEVE',
    product_id: 'SLEVE',
    unit: 'pieces',
    pack_size: null,
    kg_per_unit: 0,
    packed_sacks: 120,
    dispatched_sacks: 0,
    available_sacks: 120,
    qc_status: 'pending',
  });

  assert.equal(loose.available_qty, 120);
  assert.equal(loose.available_packs, null);
  assert.equal(loose.available_kg, null);
  assert.equal(loose.kg_per_unit, null);
});
