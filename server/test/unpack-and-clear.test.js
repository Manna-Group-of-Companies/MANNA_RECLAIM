import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { runService } from '../src/services/run.service.js';
import { stockService } from '../src/services/stock.service.js';

/**
 * The two deletes the shop-floor tabs offer the back office, and the walls
 * around them.
 *
 * Neither is a delete in the sense the History tab means it. What the Packing
 * tab removes is a packing, not a run - the shift happened, the machine logged
 * its hours, and the reports are added up off that row, so undoing a counting
 * mistake must not rewrite the plant's production record. What the Stock tab
 * removes is an emptied group, and only an emptied one: a group is the running
 * total of the packing filed against one label and nothing records which runs
 * fed it, so deleting a full one would leave every one of those runs claiming
 * output that is nowhere in the yard.
 *
 * What is worth a test rather than a comment is the arithmetic in between,
 * because getting it wrong is silent. Packing is filed as a *delta* - see
 * packSacks() - so the obvious way to undo one is to pack it back down to zero,
 * and that path has no idea what has left the gate: twelve sacks packed, eight
 * dispatched, packed back to zero, and the group sits at minus eight with
 * nobody told. So the reversal goes through reversePacking(), which knows, and
 * these are the cases that hold it there.
 */

/**
 * record_packed_stock(), including the half that only matters here: a negative
 * delta, and the CHECK that stops a group going below what has been dispatched.
 */
const recordPackedStock = () => (args, store) => {
  const rows = (store.stock_groups ||= []);
  const existing = rows.find((row) => row.label === args.p_label);
  const delta = args.p_delta ?? 0;

  if (existing) {
    const packed = existing.packed_sacks + delta;
    if (packed < (existing.dispatched_sacks ?? 0)) {
      const err = new Error('new row for relation "stock_groups" violates check constraint');
      err.pgCode = '23514';
      throw err;
    }
    existing.packed_sacks = packed;
    existing.available_sacks = packed - (existing.dispatched_sacks ?? 0);
    if (args.p_qc_status && existing.qc_status === 'pending') existing.qc_status = args.p_qc_status;
    return existing;
  }

  const row = {
    id: `group-${rows.length + 1}`,
    kind: args.p_kind,
    label: args.p_label,
    quality: args.p_quality,
    packed_sacks: Math.max(delta, 0),
    dispatched_sacks: 0,
    available_sacks: Math.max(delta, 0),
    qc_status: args.p_qc_status ?? 'pending',
    period_start: args.p_period_start,
    period_end: args.p_period_end,
    unit: args.p_unit ?? 'sacks',
    product_id: args.p_product_id ?? null,
    pack_size: args.p_pack_size ?? null,
  };
  rows.push(row);
  return row;
};

const bootWith = (tables = {}) =>
  startApi({
    tables: {
      runs: [],
      stock_groups: [],
      quality_tests: [],
      dispatches: [],
      products: [],
      ...tables,
    },
    functions: { record_packed_stock: recordPackedStock() },
  });

/** A bagged coarse run, already packed into its pool. */
const coarseRun = (over = {}) => ({
  id: 'run-1',
  kind: 'refiner',
  line: 'coarse',
  machine_id: 'R2',
  shift_date: '2026-08-07',
  shift: 'day',
  weight_kg: 600,
  packed_sacks: 12,
  leftout_out: 0,
  ...over,
});

const pool = (over = {}) => ({
  id: 'group-1',
  kind: 'pool',
  label: '2026-08-H1',
  quality: 'Coarse',
  packed_sacks: 30,
  dispatched_sacks: 0,
  available_sacks: 30,
  qc_status: 'pass',
  unit: 'sacks',
  ...over,
});

const group = (api, label) => api.tables.stock_groups.find((row) => row.label === label);
const runRow = (api, id = 'run-1') => api.tables.runs.find((row) => row.id === id);

/* ---------- undoing a packing ---------- */

test('unpacking a run takes its sacks out of the yard and leaves the run standing', async (t) => {
  const api = await bootWith({ runs: [coarseRun()], stock_groups: [pool()] });
  t.after(() => api.stop());

  const undone = await runService.unpack('run-1');

  assert.equal(group(api, '2026-08-H1').packed_sacks, 18, "the run's 12 sacks are off the pool");
  assert.equal(group(api, '2026-08-H1').available_sacks, 18);
  assert.equal(undone.stock_cleared.taken, 12);
  assert.equal(undone.stock_cleared.left, 18);

  // The whole point of this being its own operation rather than discard().
  assert.equal(api.tables.runs.length, 1, 'the run is still on the plant record');
  assert.equal(runRow(api).packed_sacks, 0, 'and it is back to unpacked');
  assert.equal(runRow(api).weight_kg, 600, 'with what it actually made untouched');
});

test('the sub-sack remainder goes back with the sacks, and the carry-in does not', async (t) => {
  const api = await bootWith({
    // 600 kg carried 40 in, bagged 12 sacks, and decided on 40 kg left over.
    runs: [coarseRun({ leftout_in: 40, leftout_out: 40 })],
    stock_groups: [pool()],
  });
  t.after(() => api.stop());

  await runService.unpack('run-1');

  assert.equal(
    runRow(api).leftout_out,
    0,
    'the remainder was this packing’s decision and goes with it',
  );
  assert.equal(
    runRow(api).leftout_in,
    40,
    'what the batch before carried in is not this bench’s to give back',
  );
});

test('a group the unpacking empties goes with it, rather than staying at zero', async (t) => {
  const api = await bootWith({
    runs: [coarseRun()],
    stock_groups: [pool({ packed_sacks: 12, available_sacks: 12 })],
  });
  t.after(() => api.stop());

  const undone = await runService.unpack('run-1');

  assert.equal(api.tables.stock_groups.length, 0, 'nothing made and nothing sold - not a yard row');
  assert.equal(undone.stock_cleared.removed, true);
  assert.equal(runRow(api).packed_sacks, 0);
});

test('unpacking is refused once the output has been dispatched, and nothing moves', async (t) => {
  const api = await bootWith({
    runs: [coarseRun()],
    stock_groups: [pool({ packed_sacks: 20, dispatched_sacks: 8, available_sacks: 12 })],
    dispatches: [
      {
        id: 'dsp-1',
        run_id: 'run-1',
        sacks: 8,
        ts: '2026-08-08T06:00:00.000Z',
      },
    ],
  });
  t.after(() => api.stop());

  await assert.rejects(() => runService.unpack('run-1'), /already been dispatched/);

  // Refused before the yard was touched, which is the order clearTraces() uses
  // and the reason a partial failure leaves the record readable.
  assert.equal(group(api, '2026-08-H1').packed_sacks, 20, 'the pool is untouched');
  assert.equal(runRow(api).packed_sacks, 12, 'and the run still says what it packed');
});

test('a run with nothing packed has no packing to remove', async (t) => {
  const api = await bootWith({ runs: [coarseRun({ packed_sacks: 0 })], stock_groups: [pool()] });
  t.after(() => api.stop());

  await assert.rejects(() => runService.unpack('run-1'), /Nothing has been packed/);
  assert.equal(group(api, '2026-08-H1').packed_sacks, 30);
});

test('undoing a packing is the back office’s, and the floor is refused at the route', async (t) => {
  const api = await bootWith({ runs: [coarseRun()], stock_groups: [pool()] });
  t.after(() => api.stop());

  for (const role of ['worker', 'supervisor', 'lab']) {
    const res = await api.call('/runs/run-1/pack', { role, method: 'DELETE' });
    assert.equal(res.status, 403, `${role} may not undo a packing`);
  }
  assert.equal(group(api, '2026-08-H1').packed_sacks, 30, 'and the yard never moved');

  const allowed = await api.call('/runs/run-1/pack', { role: 'manager', method: 'DELETE' });
  assert.equal(allowed.status, 200);
  assert.equal(group(api, '2026-08-H1').packed_sacks, 18);
});

/* ---------- clearing a weighing ---------- */

/*
 * The third of them, and the one furthest from a delete. What comes off is a
 * figure: the run goes back to owing a weight and reappears on the queue at the
 * top of the same tab, because listPendingWeigh() filters on `weight_kg is null`
 * and nothing else. The wall is the packing - the sacks in the yard were bagged
 * against this number, so it cannot go out from under them.
 */

test('clearing a weighing puts the run back on the queue and leaves the run standing', async (t) => {
  const api = await bootWith({
    runs: [coarseRun({ packed_sacks: 0, weigh_entries: [200, 200, 200] })],
  });
  t.after(() => api.stop());

  const undone = await runService.unweigh('run-1');

  assert.equal(undone.weight_kg, 600, 'the answer names the figure it removed');
  assert.equal(undone.entries_cleared, 3);
  assert.equal(runRow(api).weight_kg, null, 'which is what puts it back on the weigh queue');
  assert.equal(runRow(api).weigh_entries, null, 'the weighings it was totalled from go too');

  // The whole point of this being its own operation rather than discard().
  assert.equal(api.tables.runs.length, 1, 'the run is still on the plant record');
  assert.equal(runRow(api).machine_id, 'R2', 'with the shift it logged untouched');
});

test('a weighing that has been packed against cannot be cleared out from under it', async (t) => {
  const api = await bootWith({ runs: [coarseRun()], stock_groups: [pool()] });
  t.after(() => api.stop());

  // Named rather than merely refused: the sacks come back on the Packing tab,
  // and "no" without that is a wall with no door in it.
  await assert.rejects(() => runService.unweigh('run-1'), /Packing tab/);

  assert.equal(runRow(api).weight_kg, 600, 'the weight stands');
  assert.equal(runRow(api).packed_sacks, 12, 'and so does what was bagged off it');
});

test('a run nobody has weighed has no weighing to clear', async (t) => {
  const api = await bootWith({ runs: [coarseRun({ weight_kg: null, packed_sacks: 0 })] });
  t.after(() => api.stop());

  await assert.rejects(() => runService.unweigh('run-1'), /Nothing has been weighed/);
});

test('clearing a weighing is the admin account’s, and a manager is refused with the floor', async (t) => {
  const api = await bootWith({ runs: [coarseRun({ packed_sacks: 0 })] });
  t.after(() => api.stop());

  /*
   * The floor is not shut out of the scale by this - correcting a weight is
   * POST /runs/:id/weigh, which takes an absolute figure and is open to anyone
   * signed in. What is refused here is clearing one, which moves the run
   * between two tabs rather than putting a number right.
   *
   * The manager on that list is the point of this test. Every other back-office
   * gate in the app is adminOnly, which means manager and admin both; this one
   * is DELETE_ROLES, which does not. A manager keeps every correction they had
   * and loses only what no screen can undo.
   */
  for (const role of ['worker', 'supervisor', 'lab', 'manager']) {
    const res = await api.call('/runs/run-1/weigh', { role, method: 'DELETE' });
    assert.equal(res.status, 403, `${role} may not clear a weighing`);
  }
  assert.equal(runRow(api).weight_kg, 600, 'and the weight never moved');

  const allowed = await api.call('/runs/run-1/weigh', { role: 'admin', method: 'DELETE' });
  assert.equal(allowed.status, 200);
  assert.equal(runRow(api).weight_kg, null);
});

test('a manager may still correct the weight they may not clear', async (t) => {
  const api = await bootWith({ runs: [coarseRun({ packed_sacks: 0 })] });
  t.after(() => api.stop());

  // The other half of the rule above, and the reason it is not a demotion:
  // what a manager does to a wrong figure is put the right one in, which is the
  // same call the floor makes and is undone by making it again.
  const res = await api.call('/runs/run-1/weigh', {
    role: 'manager',
    method: 'POST',
    body: { outWeight: 640 },
  });
  assert.equal(res.status, 200);
  assert.equal(runRow(api).weight_kg, 640);
});

/* ---------- clearing an emptied group ---------- */

test('an emptied group nothing ever left is cleared off the yard', async (t) => {
  const api = await bootWith({
    stock_groups: [pool({ packed_sacks: 0, dispatched_sacks: 0, available_sacks: 0 })],
  });
  t.after(() => api.stop());

  const removed = await stockService.removeGroup('group-1');

  assert.equal(api.tables.stock_groups.length, 0);
  // The display form, not the key. `2026-08-H1` is what the group is stored
  // and addressed by; `AUG-H1` is what the yard has always called it, and the
  // screen is about to put this in a sentence for somebody to read.
  assert.equal(removed.label, 'AUG-H1');
});

test('a group still holding stock is refused, and told where the stock comes back from', async (t) => {
  const api = await bootWith({ stock_groups: [pool()] });
  t.after(() => api.stop());

  await assert.rejects(() => stockService.removeGroup('group-1'), /Packing tab/);
  assert.equal(api.tables.stock_groups.length, 1, 'the group stays, with its 30 sacks');
});

test('a group with a dispatch behind it is refused even once it is empty', async (t) => {
  const api = await bootWith({
    // Everything packed has gone out. Empty, and the paperwork hangs off it.
    stock_groups: [pool({ packed_sacks: 20, dispatched_sacks: 20, available_sacks: 0 })],
  });
  t.after(() => api.stop());

  await assert.rejects(() => stockService.removeGroup('group-1'), /corrected by a reversal/);
  assert.equal(api.tables.stock_groups.length, 1, 'dispatch_lines still points at this row');
});

test('clearing a group is the admin account’s, and a manager is refused with the floor', async (t) => {
  const api = await bootWith({
    stock_groups: [pool({ packed_sacks: 0, dispatched_sacks: 0, available_sacks: 0 })],
  });
  t.after(() => api.stop());

  // The manager is refused here and allowed on PATCH /stock/:id/qc, one route
  // above. That is the whole distinction DELETE_ROLES draws: releasing goods
  // can be taken back by setting the verdict again, and deleting the row cannot
  // be taken back by anything.
  for (const role of ['worker', 'supervisor', 'lab', 'manager']) {
    const res = await api.call('/stock/group-1', { role, method: 'DELETE' });
    assert.equal(res.status, 403, `${role} may not clear a stock group`);
  }
  assert.equal(api.tables.stock_groups.length, 1, 'and the row is still there');

  const allowed = await api.call('/stock/group-1', { role: 'admin', method: 'DELETE' });
  assert.equal(allowed.status, 200);
  assert.equal(api.tables.stock_groups.length, 0);
});

test('a manager may still set the verdict on the group they may not clear', async (t) => {
  const api = await bootWith({ stock_groups: [pool({ qc_status: 'pending' })] });
  t.after(() => api.stop());

  const res = await api.call('/stock/group-1/qc', {
    role: 'manager',
    method: 'PATCH',
    body: { qc_status: 'pass' },
  });
  assert.equal(res.status, 200, 'releasing goods is still the back office’s');
  assert.equal(group(api, '2026-08-H1').qc_status, 'pass');
});
