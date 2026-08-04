import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { runService } from '../src/services/run.service.js';
import { qualityService } from '../src/services/quality.service.js';

/**
 * What a delete has to take with it.
 *
 * An entry in this plant is never only its own row. Packing a run files sacks
 * into a stock group, the bench files a test that pushes a verdict onto that
 * group, and a lorry draws the group down. Deleting the run used to remove one
 * row out of that chain and leave the rest standing - stock in the yard made by
 * a run that no longer exists, sellable, with nothing behind it and no screen
 * anywhere that could show the discrepancy.
 *
 * So this file is about the two directions a delete has to reach:
 *
 *   forwards   a deleted run takes its packing out of the yard and its lab
 *              tests off the table.
 *   backwards  a deleted test takes its verdict off the goods it released.
 *
 * And the one case where a delete must not go through at all: output that has
 * already been dispatched. The ledger says those sacks left the gate, and no
 * delete may make that untrue.
 */

/**
 * record_packed_stock(), including the half that only matters here: a negative
 * delta, and the CHECK that stops one going below what has been dispatched.
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
    kg_per_unit: args.p_kg_per_unit ?? null,
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
  ...over,
});

const group = (api, label) => api.tables.stock_groups.find((row) => row.label === label);

test('deleting a packed run takes its sacks back out of the yard', async (t) => {
  const api = await bootWith({
    runs: [coarseRun()],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'pool',
        label: '2026-08-H1',
        quality: 'Coarse',
        packed_sacks: 30,
        dispatched_sacks: 0,
        available_sacks: 30,
        qc_status: 'pass',
        unit: 'sacks',
      },
    ],
  });
  t.after(() => api.stop());

  const removed = await runService.discard('run-1');

  assert.equal(group(api, '2026-08-H1').packed_sacks, 18, "the run's 12 sacks are off the pool");
  assert.equal(group(api, '2026-08-H1').available_sacks, 18);
  assert.equal(removed.stock_cleared.taken, 12);
  assert.equal(removed.stock_cleared.left, 18);
  assert.equal(api.tables.runs.length, 0, 'and the run itself is gone');
});

test('a group the deleted run emptied goes with it, rather than staying at zero', async (t) => {
  const api = await bootWith({
    runs: [coarseRun()],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'pool',
        label: '2026-08-H1',
        quality: 'Coarse',
        packed_sacks: 12,
        dispatched_sacks: 0,
        available_sacks: 12,
        qc_status: 'pass',
        unit: 'sacks',
      },
    ],
  });
  t.after(() => api.stop());

  const removed = await runService.discard('run-1');

  assert.equal(
    api.tables.stock_groups.length,
    0,
    'nothing was ever made and nothing ever left - the row is not stock and not history',
  );
  assert.equal(removed.stock_cleared.removed, true);
  assert.equal(removed.stock_cleared.left, 0);
});

test('a group that has dispatched is kept even when the run empties the rest', async (t) => {
  const api = await bootWith({
    runs: [coarseRun({ packed_sacks: 12 })],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'pool',
        label: '2026-08-H1',
        quality: 'Coarse',
        packed_sacks: 20,
        dispatched_sacks: 8,
        available_sacks: 12,
        qc_status: 'pass',
        unit: 'sacks',
      },
    ],
  });
  t.after(() => api.stop());

  const removed = await runService.discard('run-1');

  // Eight sacks are on a lorry and dispatch_lines points at this row.
  assert.equal(api.tables.stock_groups.length, 1);
  assert.equal(group(api, '2026-08-H1').packed_sacks, 8);
  assert.equal(removed.stock_cleared.removed, false);
});

test('a delete does not touch the verdict on the group it draws from', async (t) => {
  const api = await bootWith({
    runs: [coarseRun()],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'pool',
        label: '2026-08-H1',
        quality: 'Coarse',
        packed_sacks: 30,
        dispatched_sacks: 0,
        available_sacks: 30,
        // The back office stopped this period. Taking a run's sacks out of it
        // must not be a way to quietly lift that.
        qc_status: 'fail',
        qc_source: 'manual',
        unit: 'sacks',
      },
    ],
  });
  t.after(() => api.stop());

  await runService.discard('run-1');
  assert.equal(group(api, '2026-08-H1').qc_status, 'fail');
});

test('a press run takes its boxed pieces out of the product group', async (t) => {
  const api = await bootWith({
    runs: [
      {
        id: 'run-p',
        kind: 'press',
        machine_id: 'P1',
        shift_date: '2026-08-07',
        product: 'LOOP',
        pieces: 400,
        packed_pieces: 250,
      },
    ],
    products: [{ id: 'LOOP', name: 'Loop', pack_size: 50, piece_kg: 0.4 }],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'product',
        label: 'LOOP-50',
        quality: 'LOOP',
        product_id: 'LOOP',
        packed_sacks: 600,
        dispatched_sacks: 0,
        available_sacks: 600,
        qc_status: 'pass',
        unit: 'pieces',
        pack_size: 50,
      },
    ],
  });
  t.after(() => api.stop());

  const removed = await runService.discard('run-p');

  assert.equal(group(api, 'LOOP-50').packed_sacks, 350, 'boxed pieces come back out by the piece');
  assert.equal(removed.stock_cleared.taken, 250);
});

test('a run whose output has already been dispatched cannot be deleted', async (t) => {
  const api = await bootWith({
    runs: [coarseRun()],
    dispatches: [
      { id: 'D-1', run_id: 'run-1', sacks: 5, dispatched_at: '2026-08-08T05:00:00Z' },
    ],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'pool',
        label: '2026-08-H1',
        quality: 'Coarse',
        packed_sacks: 30,
        dispatched_sacks: 5,
        available_sacks: 25,
        qc_status: 'pass',
        unit: 'sacks',
      },
    ],
  });
  t.after(() => api.stop());

  await assert.rejects(
    () => runService.discard('run-1'),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /already been dispatched/);
      return true;
    },
  );

  assert.equal(api.tables.runs.length, 1, 'the run is still on the record');
  assert.equal(group(api, '2026-08-H1').packed_sacks, 30, 'and the yard is untouched');
});

test('the reversal refuses rather than pushing a group below what left the gate', async (t) => {
  // Nothing ties the dispatch to this run - an older project, or a load posted
  // off the group directly - so the guard that has to hold is the count itself.
  const api = await bootWith({
    runs: [coarseRun({ packed_sacks: 20 })],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'pool',
        label: '2026-08-H1',
        quality: 'Coarse',
        packed_sacks: 20,
        dispatched_sacks: 15,
        available_sacks: 5,
        qc_status: 'pass',
        unit: 'sacks',
      },
    ],
  });
  t.after(() => api.stop());

  await assert.rejects(() => runService.discard('run-1'), /reverse that dispatch first/);
  assert.equal(api.tables.runs.length, 1);
});

test('packed output with no group behind it is reported rather than passed over', async (t) => {
  const api = await bootWith({ runs: [coarseRun()] });
  t.after(() => api.stop());

  const removed = await runService.discard('run-1');

  assert.equal(removed.stock_cleared, null);
  assert.match(removed.stock_note, /12 packed sacks could not be traced/);
  assert.equal(api.tables.runs.length, 0, 'the delete still goes through');
});

test('deleting a run deletes the lab tests filed against it', async (t) => {
  const api = await bootWith({
    runs: [coarseRun({ packed_sacks: 0 })],
    quality_tests: [
      { id: 'test-1', kind: 'shift', run_id: 'run-1', verdict: 'pass', ts: '2026-08-07T09:00:00Z' },
      { id: 'test-2', kind: 'shift', run_id: 'run-9', verdict: 'pass', ts: '2026-08-07T09:00:00Z' },
    ],
  });
  t.after(() => api.stop());

  const removed = await runService.discard('run-1');

  assert.equal(removed.quality_tests_deleted, 1);
  assert.deepEqual(
    api.tables.quality_tests.map((row) => row.id),
    ['test-2'],
    "another run's sample is left alone",
  );
});

test('cancelling an open run clears the samples taken against it', async (t) => {
  const api = await bootWith({
    runs: [{ id: 'run-2', kind: 'refiner', machine_id: 'R2', started_at: '2026-08-07T06:00:00Z' }],
    quality_tests: [
      { id: 'test-1', kind: 'machine', run_id: 'run-2', verdict: 'pass', ts: '2026-08-07T07:00:00Z' },
    ],
  });
  t.after(() => api.stop());

  const cancelled = await runService.cancel('run-2');

  assert.equal(cancelled.quality_tests_deleted, 1);
  assert.equal(api.tables.quality_tests.length, 0);
});

test('deleting the test that released a batch puts its stock back to pending', async (t) => {
  const api = await bootWith({
    quality_tests: [
      {
        id: 'test-1',
        kind: 'batch',
        batch_no: 'B1041',
        quality: 'Fine',
        verdict: 'pass',
        tester: 'Lab',
        ts: '2026-08-07T09:00:00Z',
      },
    ],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'batch',
        label: 'B1041-Fine',
        quality: 'Fine',
        packed_sacks: 10,
        dispatched_sacks: 0,
        available_sacks: 10,
        qc_status: 'pass',
        qc_by: 'Lab',
        qc_source: 'lab',
      },
    ],
  });
  t.after(() => api.stop());

  const removed = await qualityService.remove('test-1');

  const stock = group(api, 'B1041-Fine');
  assert.equal(stock.qc_status, 'pending', 'goods do not stay released by a test that is gone');
  assert.equal(stock.qc_by, null, 'and nobody is left signed against it');
  assert.equal(stock.qc_source, null);
  assert.equal(removed.stock_groups[0].qc_status, 'pending');
});

test('deleting the newest test leaves the one before it standing', async (t) => {
  const api = await bootWith({
    quality_tests: [
      {
        id: 'test-1',
        kind: 'batch',
        batch_no: 'B1041',
        quality: 'Fine',
        verdict: 'hold',
        tester: 'Anu',
        ts: '2026-08-07T09:00:00Z',
      },
      {
        id: 'test-2',
        kind: 'batch',
        batch_no: 'B1041',
        quality: 'Fine',
        verdict: 'pass',
        tester: 'Lab',
        ts: '2026-08-08T09:00:00Z',
      },
    ],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'batch',
        label: 'B1041-Fine',
        quality: 'Fine',
        packed_sacks: 10,
        dispatched_sacks: 0,
        available_sacks: 10,
        qc_status: 'pass',
        qc_by: 'Lab',
        qc_source: 'lab',
      },
    ],
  });
  t.after(() => api.stop());

  // The re-test is deleted as filed by mistake, which puts the hold back.
  await qualityService.remove('test-2');

  const stock = group(api, 'B1041-Fine');
  assert.equal(stock.qc_status, 'fail', 'the hold underneath it is the standing verdict again');
  assert.equal(
    stock.qc_by,
    null,
    'and no name is written into a column that is a foreign key to users - the tester stays on the test row',
  );
});

test('a pool goes back to the pass it opened with, not to pending', async (t) => {
  const api = await bootWith({
    quality_tests: [
      {
        id: 'test-1',
        kind: 'pool',
        batch_no: '2026-08-H1',
        quality: 'Coarse',
        verdict: 'hold',
        tester: 'Anu',
        ts: '2026-08-07T09:00:00Z',
        shift_date: '2026-08-07',
      },
    ],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'pool',
        label: '2026-08-H1',
        quality: 'Coarse',
        packed_sacks: 30,
        dispatched_sacks: 0,
        available_sacks: 30,
        qc_status: 'fail',
        qc_source: 'lab',
      },
    ],
  });
  t.after(() => api.stop());

  await qualityService.remove('test-1');

  assert.equal(
    group(api, '2026-08-H1').qc_status,
    'pass',
    'coarse sells on the line running to specification, which is what it opened on',
  );
});

test('a verdict the back office set by hand is not undone by a delete at the bench', async (t) => {
  const api = await bootWith({
    quality_tests: [
      {
        id: 'test-1',
        kind: 'batch',
        batch_no: 'B1041',
        quality: 'Fine',
        verdict: 'pass',
        ts: '2026-08-07T09:00:00Z',
      },
    ],
    stock_groups: [
      {
        id: 'group-1',
        kind: 'batch',
        label: 'B1041-Fine',
        quality: 'Fine',
        packed_sacks: 10,
        dispatched_sacks: 0,
        available_sacks: 10,
        qc_status: 'pass',
        qc_by: 'Manager',
        qc_source: 'manual',
      },
    ],
  });
  t.after(() => api.stop());

  await qualityService.remove('test-1');

  const stock = group(api, 'B1041-Fine');
  assert.equal(stock.qc_status, 'pass', 'a person decided this, and a test delete is not that person');
  assert.equal(stock.qc_by, 'Manager');
});
