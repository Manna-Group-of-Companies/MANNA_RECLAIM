import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { stockService } from '../src/services/stock.service.js';

/**
 * What packing files into the yard, and whether it can leave again.
 *
 * The rule worth pinning down here is the coarse one, because getting it wrong
 * is invisible. A stock group only leaves the yard if `qc_status` is `pass` -
 * post_dispatch() refuses anything else - and the lab's verdict is recorded
 * against a batch and a grade. Coarse has neither: the line runs for a shift,
 * the sacks pool by ten-day period, and QUALITIES does not carry Coarse, so a
 * pool can never appear on the Quality tab and applyLabVerdict() refuses it by
 * name.
 *
 * A pool created `pending` is therefore a pool that is stuck forever, and it
 * looks exactly like one that is merely waiting - the card reads "awaiting the
 * lab" either way and nobody can tell the difference. So a pool opens `pass`,
 * and this file is what stops that quietly reverting.
 *
 * A batch group is the opposite case and must stay the opposite case: it opens
 * on whatever the lab has actually said, and `pending` when the lab has not
 * said anything yet.
 */

/** record_packed_stock() as far as these tests care: it files what it is given. */
const recordPackedStock = () => (args, store) => {
  const rows = (store.stock_groups ||= []);
  const existing = rows.find((row) => row.label === args.p_label);

  if (existing) {
    existing.packed_sacks += args.p_delta ?? 0;
    existing.available_sacks = existing.packed_sacks - (existing.dispatched_sacks ?? 0);
    // The lab's verdict is the lab's to change: packing only ever fills in a
    // status where nothing has been recorded yet.
    if (args.p_qc_status && existing.qc_status === 'pending') existing.qc_status = args.p_qc_status;
    return existing;
  }

  const row = {
    id: `group-${rows.length + 1}`,
    kind: args.p_kind,
    label: args.p_label,
    quality: args.p_quality,
    packed_sacks: Math.max(args.p_delta ?? 0, 0),
    dispatched_sacks: 0,
    available_sacks: Math.max(args.p_delta ?? 0, 0),
    qc_status: args.p_qc_status ?? 'pending',
    period_start: args.p_period_start,
    period_end: args.p_period_end,
  };
  rows.push(row);
  return row;
};

const bootWith = (tables = {}) =>
  startApi({
    tables: { stock_groups: [], quality_tests: [], ...tables },
    functions: { record_packed_stock: recordPackedStock() },
  });

test('a coarse pool is released as it is packed, or it can never be dispatched', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  // A coarse run carries no batch number and no grade - that is what makes it
  // coarse - so this is the shape the Packing tab actually sends.
  const group = await stockService.recordPacking({
    quality: null,
    batchNo: null,
    delta: 12,
    packedOn: '2026-08-07',
  });

  assert.equal(group.kind, 'pool');
  assert.equal(group.label, '2026-08-H1', 'the 7th falls in the first ten-day third');
  assert.equal(group.quality, 'Coarse');
  assert.equal(group.packed_sacks, 12);

  // The assertion this file exists for. `pending` here means post_dispatch()
  // refuses the load and nothing in the app can ever change the answer.
  assert.equal(
    group.qc_status,
    'pass',
    'a pool the lab cannot test must not be created waiting for the lab',
  );
});

test('a batch group still waits for the lab, and is not swept along with coarse', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  const group = await stockService.recordPacking({
    quality: 'Fine',
    batchNo: 'B1041',
    delta: 8,
    packedOn: '2026-08-07',
  });

  assert.equal(group.kind, 'batch');
  assert.equal(group.label, 'B1041-Fine');
  assert.equal(
    group.qc_status,
    'pending',
    'releasing coarse must not release untested reclaim with it',
  );
});

test('a batch already passed by the lab is filed as passed', async (t) => {
  const api = await bootWith({
    // The lab sampled the batch before it reached the bagging line, which is
    // the usual order - the group is created after the verdict exists.
    quality_tests: [
      {
        id: 'test-1',
        kind: 'batch',
        batch_no: 'B1042',
        quality: 'Medium',
        verdict: 'pass',
        ts: '2026-08-07T09:00:00Z',
      },
    ],
  });
  t.after(() => api.stop());

  const group = await stockService.recordPacking({
    quality: 'Medium',
    batchNo: 'B1042',
    delta: 5,
    packedOn: '2026-08-07',
  });
  assert.equal(group.qc_status, 'pass', 'a verdict recorded before the sacks were bagged still counts');
});

test('a pool put on hold stays on hold when more sacks are packed into it', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await stockService.recordPacking({ quality: null, batchNo: null, delta: 10, packedOn: '2026-08-07' });

  // The back office finds something wrong with the period and stops it.
  const [pool] = api.tables.stock_groups;
  pool.qc_status = 'fail';

  const after = await stockService.recordPacking({
    quality: null,
    batchNo: null,
    delta: 6,
    packedOn: '2026-08-09',
  });

  assert.equal(after.packed_sacks, 16, 'the sacks are still filed into the pool');
  assert.equal(
    after.qc_status,
    'fail',
    'but packing must not quietly re-release a pool somebody stopped',
  );
});

test('the ten-day thirds, including the end of a month', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  const labelOn = async (date) =>
    (await stockService.recordPacking({ quality: null, batchNo: null, delta: 1, packedOn: date }))
      .label;

  assert.equal(await labelOn('2026-08-01'), '2026-08-H1');
  assert.equal(await labelOn('2026-08-10'), '2026-08-H1');
  assert.equal(await labelOn('2026-08-11'), '2026-08-H2');
  assert.equal(await labelOn('2026-08-20'), '2026-08-H2');
  assert.equal(await labelOn('2026-08-21'), '2026-08-H3');
  // The 31st stays in H3 rather than opening a fourth pool of one day.
  assert.equal(await labelOn('2026-08-31'), '2026-08-H3');
  // And February ends where February ends.
  assert.equal(await labelOn('2026-02-28'), '2026-02-H3');
});

test('a graded run with no batch number files nothing, rather than inventing a pool', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  // Coarse-line output logged with a grade on it - R2 makes Medium - and no
  // batch to key a group on. There is nothing to file it against, so nothing
  // is filed and the sacks stay off the ledger.
  const group = await stockService.recordPacking({
    quality: 'Medium',
    batchNo: null,
    delta: 4,
    packedOn: '2026-08-07',
  });

  assert.equal(group, null);
  assert.equal(
    api.tables.stock_groups.length,
    0,
    'it must not fall through into the coarse pool and be sold as coarse',
  );
});
