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

/**
 * The test under the verdict, on the card the goods are on.
 *
 * `qc_status` is a conclusion with nothing beneath it: "QC passed" on a pallet
 * is the end of a sentence that begins with somebody at a bench measuring four
 * things and signing for them, and reading that sentence used to mean leaving
 * the yard and finding the right batch and grade on the Quality tab. So the yard
 * read carries the standing test alongside the status it produced.
 *
 * Keyed three ways because there are three ways this plant keys a lot, and the
 * three are asserted together on purpose - it is one join, through testKey() and
 * groupKey(), and a kind taught to one side and not the other is exactly the
 * failure those two functions exist to make impossible.
 */
test('the yard carries the test each verdict was made on', async (t) => {
  const moulded = {
    ...group('LOOP-50', 'LOOP', 'pass'),
    kind: 'product',
    product_id: 'LOOP',
    unit: 'pieces',
  };
  const api = await startApi({
    tables: {
      stock_groups: [...yard(), moulded],
      quality_tests: [
        {
          id: 't1',
          kind: 'batch',
          batch_no: '2776',
          quality: 'Special',
          verdict: 'pass',
          tester: 'R. Kumar',
          params: [{ name: 'Mooney', value: '42', unit: 'MU' }],
          notes: 'within spec',
          attachment_url: 'https://example.test/qc/t1.pdf',
          attachment_name: 'sheet.pdf',
          ts: '2026-07-11T09:00:00Z',
        },
        // A pool sample names its period in the column a batch test names its
        // batch, so the group's own label is the key on both sides.
        { id: 't2', kind: 'pool', batch_no: '2026-07-H2', quality: 'Coarse', verdict: 'hold', tester: 'S. Nair', ts: '2026-07-15T09:00:00Z' },
        // A press verdict names the product it moulded rather than a grade.
        { id: 't3', kind: 'product', batch_no: '2790', quality: 'LOOP', verdict: 'pass', tester: 'R. Kumar', ts: '2026-07-16T09:00:00Z' },
      ],
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/stock', { role: 'manager' });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  const byLabel = Object.fromEntries(body.data.map((row) => [row.label, row]));

  const special = byLabel['2776-Special'].lab_test;
  assert.equal(special.id, 't1', 'a batch group is joined on <batch>-<grade>');
  assert.equal(special.verdict, 'pass');
  assert.equal(special.tested_by, 'R. Kumar');
  assert.equal(special.tested_at, '2026-07-11T09:00:00Z');
  assert.deepEqual(special.params, [{ name: 'Mooney', value: '42', unit: 'MU' }]);
  assert.equal(special.remarks, 'within spec', 'the bench’s own words about the lot');
  assert.equal(special.attachment_url, 'https://example.test/qc/t1.pdf');

  assert.equal(byLabel['2026-07-H2'].lab_test.id, 't2', 'a pool is joined on its own label');
  assert.equal(byLabel['LOOP-50'].lab_test.id, 't3', 'a moulded group is joined on the product');

  /*
   * The grade nobody tested. Null rather than a test with empty fields, and
   * rather than the other grade of the same batch: a verdict is about one grade
   * of one batch, which is the whole reason the label carries both.
   */
  assert.equal(byLabel['2776-Fine'].lab_test, null);
});

/**
 * And it stops at the wall.
 *
 * The readings arrive with the tester's name on them, and who tested a lot is
 * the same kind of record as who released it - which the shop floor's row has
 * never carried and which stock-access.test.js asserts key by key. The verdict
 * itself is the operative fact for loading a vehicle and is on both rows.
 */
test('the readings do not cross onto the shop floor’s row', async (t) => {
  const api = await startApi({
    tables: {
      stock_groups: [group('2776-Special', 'Special', 'pass')],
      quality_tests: [
        { id: 't1', kind: 'batch', batch_no: '2776', quality: 'Special', verdict: 'pass', tester: 'R. Kumar', ts: '2026-07-11T09:00:00Z' },
      ],
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/stock/summary', { role: 'supervisor' });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.data[0].qc_status, 'pass', 'the floor still gets the verdict');
  assert.equal('lab_test' in body.data[0], false);
  assert.equal(
    JSON.stringify(body.data).includes('R. Kumar'),
    false,
    'and no tester’s name anywhere in the response',
  );
});

/**
 * The press bench, which had no door at all.
 *
 * A moulded verdict used to be refused unless it named the batch of compound the
 * press was running, and a press run records no batch number - `runs.batch_no`
 * is null on everything moulded since the presses stopped naming one. So there
 * was nothing the bench could type, the verdict never filed, the boxed pieces
 * stayed `pending`, and post_dispatch() refuses anything that is not `pass`: a
 * product could be moulded, boxed, counted into the yard and never sold, with no
 * screen anywhere able to say why.
 *
 * Nothing rested on the batch either. A moulded group is addressed by its
 * product, so the batch never decided which stock a verdict moved.
 */
const moulded = (product, qc_status = 'pending') => ({
  id: `group-${product}`,
  kind: 'product',
  label: product,
  quality: product,
  product_id: product,
  unit: 'pieces',
  packed_sacks: 570,
  dispatched_sacks: 0,
  available_sacks: 570,
  qc_status,
  created_at: '2026-08-03T00:00:00Z',
});

test('a press verdict releases its product without naming a batch', async (t) => {
  const api = await startApi({
    tables: { stock_groups: [moulded('SLEVE'), moulded('LOOP')], quality_tests: [] },
  });
  t.after(() => api.stop());

  // Exactly what the bench can actually produce: the product, and a verdict.
  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { kind: 'product', grade: 'SLEVE', verdict: 'pass' },
  });
  assert.equal(res.status, 201, await res.text());

  const after = labels(api.tables.stock_groups);
  assert.equal(after.SLEVE, 'pass', 'boxed pieces the lab has passed have to become sellable');
  assert.equal(after.LOOP, 'pending', 'and no other product goes with it');
});

test('a hold on a product stops it, still without a batch', async (t) => {
  const api = await startApi({
    tables: { stock_groups: [moulded('SLEVE', 'pass')], quality_tests: [] },
  });
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { kind: 'product', grade: 'SLEVE', verdict: 'hold' },
  });
  assert.equal(res.status, 201, await res.text());
  assert.equal(labels(api.tables.stock_groups).SLEVE, 'fail');
});

test('a batch is still recorded on a press verdict when the sample carries one', async (t) => {
  const api = await startApi({
    tables: { stock_groups: [moulded('SLEVE')], quality_tests: [] },
  });
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { kind: 'product', grade: 'SLEVE', batchNo: '2790', verdict: 'pass' },
  });
  assert.equal(res.status, 201, await res.text());

  // Provenance, not a key: it is kept on the row and the release is unaffected.
  assert.equal(api.tables.quality_tests[0].batch_no, '2790');
  assert.equal(labels(api.tables.stock_groups).SLEVE, 'pass');
});
