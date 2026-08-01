import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { stockService } from '../src/services/stock.service.js';

/**
 * The door between the lab and the yard.
 *
 * A verdict and a stock group's `qc_status` are the same fact kept in two
 * places: the Quality tab reads the test rows, and post_dispatch() reads the
 * column. They used to be written independently - only the test row ever was -
 * so a batch the lab had passed went on showing `QC pending` in the yard and
 * could not be loaded onto a vehicle, with no screen anywhere that set the
 * column. What is worth asserting is that filing a verdict now moves the group
 * it is about, that it moves only that one, and that a hold blocks rather than
 * releases.
 *
 * The stub is not a database and ignores `order`, so "the newest test wins" is
 * not asserted here - that is Postgres sorting on `ts`, and the append-only
 * rule it rests on is the same one the Quality tab reads by.
 */

const group = (label, quality, qc_status = 'pending') => ({
  id: `group-${label}`,
  kind: 'batch',
  label,
  quality,
  packed_sacks: 17,
  dispatched_sacks: 0,
  available_sacks: 17,
  qc_status,
  period_start: null,
  period_end: null,
  created_at: '2026-07-11T00:00:00Z',
});

/** The yard as batch 2776 left it: two grades packed, neither released. */
const yard = () => [
  group('2776-Special', 'Special'),
  group('2776-Fine', 'Fine'),
  {
    ...group('2026-07-H2', 'Coarse'),
    kind: 'pool',
    period_start: '2026-07-11',
    period_end: '2026-07-20',
  },
];

const labels = (rows) => Object.fromEntries(rows.map((row) => [row.label, row.qc_status]));

test('passing a grade releases that grade’s stock and nothing else', async (t) => {
  const api = await startApi({ tables: { stock_groups: yard(), quality_tests: [] } });
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { batchNo: '2776', grade: 'Special', verdict: 'pass' },
  });
  assert.equal(res.status, 201, await res.text());

  const after = labels(api.tables.stock_groups);
  assert.equal(after['2776-Special'], 'pass', 'the grade the lab passed must be released');
  assert.equal(after['2776-Fine'], 'pending', 'a grade nobody tested must not be released with it');
  assert.equal(after['2026-07-H2'], 'pending', 'the coarse pool is not addressed by a batch test');
});

test('a hold blocks the grade rather than releasing it', async (t) => {
  const api = await startApi({ tables: { stock_groups: yard(), quality_tests: [] } });
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { batchNo: '2776', grade: 'Special', verdict: 'hold' },
  });
  assert.equal(res.status, 201, await res.text());

  // The yard has no state between passed and blocked, and post_dispatch()
  // refuses anything that is not `pass` - so a hold reads as `fail` here.
  assert.equal(labels(api.tables.stock_groups)['2776-Special'], 'fail');
});

test('a verdict against a batch with nothing packed yet changes nothing', async (t) => {
  const api = await startApi({ tables: { stock_groups: yard(), quality_tests: [] } });
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { batchNo: '9999', grade: 'Special', verdict: 'pass' },
  });
  assert.equal(res.status, 201, 'the test is still filed - the sacks simply are not bagged yet');
  assert.deepEqual(labels(api.tables.stock_groups), {
    '2776-Special': 'pending',
    '2776-Fine': 'pending',
    '2026-07-H2': 'pending',
  });
});

test('the sync puts groups packed before this fix back in step with the lab', async (t) => {
  // Tested and packed, but never released: what the yard actually looks like on
  // the groups that predate the door above.
  const api = await startApi({
    tables: {
      stock_groups: yard(),
      quality_tests: [
        { id: 't1', kind: 'batch', batch_no: '2776', quality: 'Special', verdict: 'pass', ts: '2026-07-11T09:00:00Z' },
        { id: 't2', kind: 'batch', batch_no: '2776', quality: 'Fine', verdict: 'hold', ts: '2026-07-11T09:05:00Z' },
        // A shift sample rather than a lot: it names no batch and releases nothing.
        { id: 't3', kind: 'shift', batch_no: null, quality: 'Special', verdict: 'pass', ts: '2026-07-11T10:00:00Z' },
      ],
    },
  });
  t.after(() => api.stop());

  const changed = await stockService.reconcileQc();
  assert.deepEqual(
    changed.map((row) => `${row.label} ${row.from}->${row.to}`).sort(),
    ['2776-Fine pending->fail', '2776-Special pending->pass'],
  );

  const after = labels(api.tables.stock_groups);
  assert.equal(after['2776-Special'], 'pass');
  assert.equal(after['2776-Fine'], 'fail');
  assert.equal(after['2026-07-H2'], 'pending', 'a pool has no batch to test and is left alone');

  // Idempotent: a second run has nothing left to say, which is what makes it
  // safe to leave in package.json rather than a one-shot to be deleted.
  assert.deepEqual(await stockService.reconcileQc(), []);
});

test('an untested group is left alone rather than reset to pending', async (t) => {
  const api = await startApi({
    tables: {
      // Released by hand through PATCH /stock/:id/qc, with no test on file.
      stock_groups: [group('2801-Medium', 'Medium', 'pass')],
      quality_tests: [],
    },
  });
  t.after(() => api.stop());

  assert.deepEqual(await stockService.reconcileQc(), []);
  assert.equal(api.tables.stock_groups[0].qc_status, 'pass');
});
