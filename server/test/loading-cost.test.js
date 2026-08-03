import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { loadingEntry, coerceMode, costOf, splitByKg } from '../src/services/loading.service.js';

/**
 * What it cost to put a load on a truck.
 *
 * Three rules are being defended here, and each of them exists because the
 * obvious implementation gets it quietly wrong.
 *
 * Day labour is always accounted. A gang on a per-kg contract is the normal way
 * a reclaim load is paid for, and every so often a couple of day laHbourers work
 * the same truck. If the mode is whatever the form's dropdown said, their hours
 * disappear from the costing and nothing looks wrong. So the mode is derived
 * from what was entered rather than taken from the payload.
 *
 * The rates are snapshotted. A cost that changes when somebody edits a settings
 * field is not a record of anything, and "why is last month different this
 * month" is a question with no good answer.
 *
 * And the cost belongs to the dispatch. One loading job is one truck carrying
 * several qualities, so it splits back across the lines by kg - it never enters
 * the rupees-per-kg the reclaim itself carries, which was frozen at the batch.
 */

const RATES = { loadingPerKg: 0.4, loadingLabourPerHour: 80 };

const GROUP = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'pool',
  label: '2026-08-H1',
  quality: 'Coarse',
  packed_sacks: 100,
  dispatched_sacks: 0,
  available_sacks: 100,
  qc_status: 'pass',
};

const CUSTOMER = { id: '22222222-2222-4222-8222-222222222222', name: 'UNITED', active: true };

// ---------------------------------------------------------------------------
// The rule, as a unit
// ---------------------------------------------------------------------------

test('day labour on a contract load makes it mixed, whatever the form said', () => {
  const entry = loadingEntry(
    // The payload insists it is a contract job, and names two labourers on it.
    // That is the exact contradiction the rule exists for.
    { loading_mode: 'contract', manhour_labourers: 2, manhour_hours: 3 },
    RATES,
    { sacks: 20 },
  );

  assert.equal(entry.loading_mode, 'mixed');
  assert.equal(entry.manhour_labourers, 2, 'the labourers are kept, not dropped with the mode');
  assert.equal(entry.manhour_hours, 3);
  assert.equal(entry.kg_loaded, 1000, '20 sacks at 50 kg, taken off the document');

  // 1000 x 0.40 + 2 x 3 x 80.
  assert.deepEqual(costOf(entry), {
    contract_cost: 400,
    manhour_cost: 480,
    loading_cost: 880,
  });
});

test('a contract load with nobody on it stays contract', () => {
  const entry = loadingEntry({ loading_mode: 'mixed', manhour_labourers: 0 }, RATES, { sacks: 10 });
  assert.equal(entry.loading_mode, 'contract', 'a payload claiming mixed with no labour is corrected');
  assert.equal(entry.manhour_hours, 0);
  assert.equal(costOf(entry).manhour_cost, 0);
});

test('moulded goods are man-hour only, and carry no contract half', () => {
  const entry = loadingEntry(
    // Asking for a contract rate on moulded goods, with kg to charge it against.
    { material_kind: 'moulded', loading_mode: 'contract', kg_loaded: 900, manhour_labourers: 4, manhour_hours: 2 },
    RATES,
    { sacks: 18 },
  );

  assert.equal(entry.loading_mode, 'manhour', 'there is no per-kg contract behind a press product');
  assert.equal(entry.kg_loaded, 0, 'so there is nothing for a contract rate to apply to');
  assert.equal(entry.contract_rate_per_kg, 0);
  assert.equal(costOf(entry).contract_cost, 0);
  assert.equal(costOf(entry).manhour_cost, 640, '4 x 2 h x 80');
});

test('a load with no contract kg is man-hour rather than mixed', () => {
  const entry = loadingEntry(
    { kg_loaded: 0, manhour_labourers: 3, manhour_hours: 1.5 },
    RATES,
    { sacks: 0 },
  );
  assert.equal(entry.loading_mode, 'manhour');
  assert.equal(costOf(entry).loading_cost, 360);
});

test('half a man-hour entry costs nothing and is not mistaken for one', () => {
  // Labourers with no hours, and hours with no labourers. Neither is a job
  // anyone worked, and neither may flip the mode off contract.
  for (const half of [{ manhour_labourers: 3, manhour_hours: 0 }, { manhour_labourers: 0, manhour_hours: 3 }]) {
    const entry = loadingEntry(half, RATES, { sacks: 4 });
    assert.equal(entry.loading_mode, 'contract');
    assert.equal(costOf(entry).manhour_cost, 0);
  }
});

test('coerceMode is the whole rule, and has no way to say contract-with-labour', () => {
  const cases = [
    [{ material_kind: 'moulded', loading_mode: 'contract', labourers: 0, hours: 0, kg: 500 }, 'manhour'],
    [{ material_kind: 'reclaim', loading_mode: 'contract', labourers: 0, hours: 0, kg: 500 }, 'contract'],
    [{ material_kind: 'reclaim', loading_mode: 'contract', labourers: 2, hours: 2, kg: 500 }, 'mixed'],
    [{ material_kind: 'reclaim', loading_mode: 'manhour', labourers: 2, hours: 2, kg: 500 }, 'manhour'],
    [{ material_kind: 'reclaim', loading_mode: 'mixed', labourers: 2, hours: 2, kg: 0 }, 'manhour'],
    [{ material_kind: 'reclaim', loading_mode: 'mixed', labourers: 0, hours: 0, kg: 0 }, 'contract'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(coerceMode(input), expected, JSON.stringify(input));
  }

  // The one combination that must be unreachable: contract with labour on it.
  for (const labourers of [1, 5, 40]) {
    const mode = coerceMode({ material_kind: 'reclaim', loading_mode: 'contract', labourers, hours: 1, kg: 100 });
    assert.notEqual(mode, 'contract', 'a load with day labour on it is never plain contract');
  }
});

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

test('one loading job splits across the lines it covered, by kg', () => {
  // 30 sacks and 10 sacks off one truck: three quarters, one quarter.
  const shares = splitByKg(800, [{ sacks: 30 }, { sacks: 10 }]);
  assert.deepEqual(shares, [600, 200]);
  assert.equal(
    shares.reduce((a, b) => a + b, 0),
    800,
    'the split has to add back up to the figure it came from',
  );
});

test('a split that does not divide evenly still adds back up', () => {
  // 1/3 and 2/3 of 100 is where a naive round leaves a paisa on the floor, and
  // a share that does not reconcile with its own total is a discrepancy
  // somebody has to chase.
  const shares = splitByKg(100, [{ sacks: 1 }, { sacks: 2 }]);
  assert.equal(shares.reduce((a, b) => a + b, 0), 100);

  const many = splitByKg(10, [{ sacks: 1 }, { sacks: 1 }, { sacks: 1 }]);
  assert.equal(many.reduce((a, b) => a + b, 0), 10);
});

test('a job with no cost, and lines with no sacks, split without blowing up', () => {
  assert.deepEqual(splitByKg(0, [{ sacks: 5 }, { sacks: 5 }]), [0, 0]);
  assert.deepEqual(splitByKg(90, []), []);
  // Nothing to weight by: spread evenly rather than dumped on whichever line
  // happens to be first.
  assert.deepEqual(splitByKg(90, [{ sacks: 0 }, { sacks: 0 }]), [45, 45]);
});

// ---------------------------------------------------------------------------
// The snapshot, end to end
// ---------------------------------------------------------------------------

/**
 * post_dispatch() as far as this file cares: it files the loading entry it was
 * handed. What is being asserted is what the API put in `p_loading` - the rates
 * it copied in and the mode it settled on - not the transaction around it,
 * which dispatch-concurrency.test.js owns.
 */
const postDispatchStub = () => (args, store) => {
  (store.dispatches ||= []).push({
    id: args.p_id,
    customer_id: args.p_customer_id,
    dispatch_date: args.p_dispatch_date,
    transport_charge: args.p_transport_charge ?? 0,
  });
  for (const line of args.p_lines) {
    (store.dispatch_lines ||= []).push({
      id: `line-${(store.dispatch_lines?.length ?? 0) + 1}`,
      dispatch_id: args.p_id,
      stock_group_id: line.stock_group_id,
      quality: line.quality,
      sacks: line.sacks,
      unit_price: line.unit_price,
      line_total: line.sacks * line.unit_price,
    });
  }
  if (args.p_loading) {
    (store.loading_activities ||= []).push({
      id: `loading-${(store.loading_activities?.length ?? 0) + 1}`,
      dispatch_id: args.p_id,
      ...args.p_loading,
    });
  }
  return { id: args.p_id, lines: args.p_lines.length, goods_total: 0, total: 0 };
};

const postWith = (api, loading, sacks = 20) =>
  api.call('/dispatches', {
    role: 'manager',
    method: 'POST',
    body: {
      customer_id: CUSTOMER.id,
      dispatch_date: '2026-08-05',
      lines: [{ stock_group_id: GROUP.id, sacks }],
      prices: { Coarse: 36 },
      loading,
    },
  });

test('the rates are read from settings and written onto the entry', async (t) => {
  const api = await startApi({
    tables: {
      stock_groups: [{ ...GROUP }],
      customers: [{ ...CUSTOMER }],
      cost_rates: [{ id: 'current', data: { ...RATES } }],
      dispatches: [],
      dispatch_lines: [],
      loading_activities: [],
    },
    functions: { post_dispatch: postDispatchStub() },
  });
  t.after(() => api.stop());

  const res = await postWith(api, { manhour_labourers: 2, manhour_hours: 3 });
  assert.equal(res.status, 201, await res.text());

  const [entry] = api.tables.loading_activities;
  assert.equal(entry.contract_rate_per_kg, 0.4, 'the contract rate is copied off the settings');
  assert.equal(entry.daily_labour_rate, 80, 'and so is the day-labour rate');
  assert.equal(entry.kg_loaded, 1000, '20 sacks at 50 kg');
  assert.equal(entry.loading_mode, 'mixed', 'day labour on a contract load, coerced on the way in');
});

test('a client cannot post a job at a rate of its own', async (t) => {
  const api = await startApi({
    tables: {
      stock_groups: [{ ...GROUP }],
      customers: [{ ...CUSTOMER }],
      cost_rates: [{ id: 'current', data: { ...RATES } }],
      dispatches: [],
      dispatch_lines: [],
      loading_activities: [],
    },
    functions: { post_dispatch: postDispatchStub() },
  });
  t.after(() => api.stop());

  const res = await postWith(api, {
    manhour_labourers: 1,
    manhour_hours: 1,
    // Both of these are the client trying to price its own job.
    contract_rate_per_kg: 99,
    daily_labour_rate: 9999,
  });
  assert.equal(res.status, 201, await res.text());

  const [entry] = api.tables.loading_activities;
  assert.equal(entry.contract_rate_per_kg, 0.4, 'the settings figure wins, not the request');
  assert.equal(entry.daily_labour_rate, 80);
});

/**
 * The point of the snapshot. Two identical jobs either side of a rate change
 * have to keep their own figures - revising a rate prices the next load and
 * leaves last month exactly where it was.
 */
test('revising a rate leaves an entry already written untouched', async (t) => {
  const api = await startApi({
    tables: {
      stock_groups: [{ ...GROUP }],
      customers: [{ ...CUSTOMER }],
      cost_rates: [{ id: 'current', data: { ...RATES } }],
      dispatches: [],
      dispatch_lines: [],
      loading_activities: [],
    },
    functions: { post_dispatch: postDispatchStub() },
  });
  t.after(() => api.stop());

  assert.equal((await postWith(api, { manhour_labourers: 2, manhour_hours: 2 })).status, 201);

  // The back office doubles both rates.
  const saved = await api.call('/rates/cost-rates', {
    role: 'manager',
    method: 'PUT',
    body: { data: { loadingPerKg: 0.8, loadingLabourPerHour: 160 } },
  });
  assert.equal(saved.status, 200, await saved.text());

  assert.equal((await postWith(api, { manhour_labourers: 2, manhour_hours: 2 })).status, 201);

  const [before, after] = api.tables.loading_activities;
  assert.equal(before.contract_rate_per_kg, 0.4, 'the job already done keeps the rate it was done at');
  assert.equal(before.daily_labour_rate, 80);
  assert.equal(after.contract_rate_per_kg, 0.8, 'and the next one is priced at the new figure');
  assert.equal(after.daily_labour_rate, 160);

  // Which is to say: the same job, twice, costs two different amounts, and
  // neither of them moved when the other was written.
  assert.equal(costOf(before).loading_cost, 720, '1000 x 0.40 + 2 x 2 x 80');
  assert.equal(costOf(after).loading_cost, 1440);
});

test('a dispatch with no loading recorded writes no entry at all', async (t) => {
  const api = await startApi({
    tables: {
      stock_groups: [{ ...GROUP }],
      customers: [{ ...CUSTOMER }],
      cost_rates: [{ id: 'current', data: { ...RATES } }],
      dispatches: [],
      dispatch_lines: [],
      loading_activities: [],
    },
    functions: { post_dispatch: postDispatchStub() },
  });
  t.after(() => api.stop());

  // The customer's own crew loaded their own vehicle. That is a gap to be
  // flagged on the list, not a row of zeroes pretending to be a costed job.
  const res = await postWith(api, null);
  assert.equal(res.status, 201, await res.text());
  assert.equal(api.tables.loading_activities.length, 0);

  const listed = await api.call('/dispatches', { role: 'manager' });
  const row = (await listed.json()).data[0];
  assert.equal(row.labour_recorded, false);
  assert.equal(row.loading_cost, 0);
});
