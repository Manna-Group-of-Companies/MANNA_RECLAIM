import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { slotsOf, slotOf, periodOf } from '../src/utils/stockPeriod.js';

/**
 * How coarse is tested.
 *
 * There is no lot to certify. The coarse line runs for a shift rather than for
 * a batch, the sacks pool by ten-day period, and the volumes are too large to
 * name a pallet by - so the lab samples the period three times instead of
 * passing a batch. What that buys is a record that the line was running to
 * specification through the pool.
 *
 * Two properties matter and both are easy to lose:
 *
 * The slot a sample lands in is derived from the day it was taken, never sent.
 * A client that could name its own slot could file today's sample as the one
 * nobody took last week, and the empty slot is the only thing that says a
 * sample was missed.
 *
 * And a sample releases nothing. A pool is sellable throughout its period, so a
 * sample - passing or holding - must leave `qc_status` exactly where it was. A
 * sample that gated would put coarse straight back into the state it was
 * stranded in before: unsellable, waiting on a lab that has no lot to test.
 */

const POOL = {
  id: '77777777-7777-4777-8777-777777777777',
  kind: 'pool',
  label: '2026-08-H1',
  quality: 'Coarse',
  packed_sacks: 60,
  dispatched_sacks: 0,
  available_sacks: 60,
  qc_status: 'pass',
  period_start: '2026-08-01',
  period_end: '2026-08-10',
  created_at: '2026-08-01T00:00:00Z',
};

const sample = (over = {}) => ({
  kind: 'pool',
  batchNo: POOL.label,
  grade: 'Coarse',
  verdict: 'pass',
  shiftDate: '2026-08-05',
  params: [{ name: 'Ash %', value: '7.2' }],
  testedBy: 'Lab',
  ...over,
});

// ---------------------------------------------------------------------------
// The slots themselves
// ---------------------------------------------------------------------------

test('a ten-day pool splits 3 / 4 / 3, with a sample near each end', () => {
  const slots = slotsOf('2026-08-H1');
  assert.equal(slots.length, 3);
  assert.deepEqual(
    slots.map((s) => [s.from, s.to]),
    [
      ['2026-08-01', '2026-08-03'],
      ['2026-08-04', '2026-08-07'],
      ['2026-08-08', '2026-08-10'],
    ],
  );

  // Contiguous and complete: every day of the period belongs to exactly one
  // slot, so no sample can fall between two of them.
  assert.equal(slots[0].from, periodOf('2026-08-H1').periodStart);
  assert.equal(slots[2].to, periodOf('2026-08-H1').periodEnd);
  for (let i = 1; i < slots.length; i += 1) {
    const previousEnd = new Date(`${slots[i - 1].to}T00:00:00Z`).getTime();
    const thisStart = new Date(`${slots[i].from}T00:00:00Z`).getTime();
    assert.equal(thisStart - previousEnd, 86_400_000, 'slots must run day after day');
  }
});

test('H3 divides whatever the month leaves, rather than being padded to ten', () => {
  // Eight days in February, eleven in a long month - both still three samples.
  assert.deepEqual(
    slotsOf('2026-02-H3').map((s) => [s.from, s.to]),
    [
      ['2026-02-21', '2026-02-22'],
      ['2026-02-23', '2026-02-25'],
      ['2026-02-26', '2026-02-28'],
    ],
  );
  assert.deepEqual(
    slotsOf('2026-08-H3').map((s) => [s.from, s.to]),
    [
      ['2026-08-21', '2026-08-23'],
      ['2026-08-24', '2026-08-27'],
      ['2026-08-28', '2026-08-31'],
    ],
  );
  // The 31st is inside H3's last slot rather than stranded outside every one.
  assert.equal(slotOf('2026-08-H3', '2026-08-31'), 3);
});

test('a date outside the period belongs to no slot', () => {
  assert.equal(slotOf('2026-08-H1', '2026-08-01'), 1);
  assert.equal(slotOf('2026-08-H1', '2026-08-05'), 2);
  assert.equal(slotOf('2026-08-H1', '2026-08-10'), 3);
  // The 15th is in H2. Answering null here is what keeps a mis-filed sample
  // out of the record instead of being absorbed into the nearest slot.
  assert.equal(slotOf('2026-08-H1', '2026-08-15'), null);
  assert.equal(slotOf('not-a-pool', '2026-08-05'), null);
});

// ---------------------------------------------------------------------------
// Filing a sample
// ---------------------------------------------------------------------------

test('a sample lands in the slot its own date falls in', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  const filed = await api.call('/quality-tests', { role: 'lab', method: 'POST', body: sample() });
  assert.equal(filed.status, 201, await filed.text());

  const res = await api.call('/stock/pools', { role: 'lab' });
  assert.equal(res.status, 200);
  const [pool] = (await res.json()).data;

  assert.equal(pool.display_label, 'AUG-H1');
  assert.equal(pool.samples_total, 3);
  assert.equal(pool.samples_taken, 1);
  // The 5th is in the second slot, and the client never said so.
  assert.equal(pool.slots[0].test, null);
  assert.equal(pool.slots[1].test.verdict, 'pass');
  assert.equal(pool.slots[2].test, null);
  assert.equal(pool.any_hold, false);
});

/**
 * Absence is not refusal, and refusal is refusal.
 *
 * These two together are the whole rule. A pool nobody has sampled sells - that
 * is what stops coarse being stranded waiting on a bench with no lot to test.
 * A pool the lab has actually held does not - it would be a strange record that
 * let somebody hold all three samples and still put the sacks on a lorry.
 */
test('an unsampled pool still sells - absence is not refusal', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  const [pool] = (await (await api.call('/stock/pools', { role: 'lab' })).json()).data;
  assert.equal(pool.samples_taken, 0);
  assert.equal(pool.qc_status, 'pass', 'coarse does not wait on a certificate per pool');
});

test('a held sample holds the pool - the lab has looked and said no', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  const held = await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: sample({ verdict: 'hold' }),
  });
  assert.equal(held.status, 201, await held.text());

  const [pool] = (await (await api.call('/stock/pools', { role: 'lab' })).json()).data;
  assert.equal(pool.any_hold, true);
  assert.equal(pool.slots[1].test.verdict, 'hold');

  // And it stops the sacks. post_dispatch() refuses anything that is not
  // `pass`, so this is what puts the pool out of reach of the Dispatch button.
  assert.equal(api.tables.stock_groups[0].qc_status, 'fail');
  assert.equal(pool.qc_status, 'fail');
});

test('a passing re-sample releases a period the bench had stopped', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: sample({ verdict: 'hold', testedAt: '2026-08-05T09:00:00.000Z' }),
  });
  assert.equal(api.tables.stock_groups[0].qc_status, 'fail');

  // A re-test exists to change the answer - on a pool as much as on a batch.
  await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: sample({ verdict: 'pass', shiftDate: '2026-08-09', testedAt: '2026-08-09T09:00:00.000Z' }),
  });
  assert.equal(api.tables.stock_groups[0].qc_status, 'pass', 'the newest word wins');
});

/**
 * The card must not contradict itself.
 *
 * A pool opens `pass` now, so this should never arise - but every pool packed
 * before that change was left `pending`, and the result was a screen arguing
 * with itself: three passing samples on the lab's tab, "QC pending" in the yard,
 * and sacks nobody could press a button to move.
 *
 * A passing sample therefore lifts a pending pool. That is not the sample
 * gating anything - a pool with no samples at all still sells - it is the two
 * records being kept from disagreeing.
 */
test('a passing sample lifts a pool left stranded at pending', async (t) => {
  const stranded = { ...POOL, qc_status: 'pending' };
  const api = await startApi({ tables: { stock_groups: [stranded], quality_tests: [] } });
  t.after(() => api.stop());

  const filed = await api.call('/quality-tests', { role: 'lab', method: 'POST', body: sample() });
  assert.equal(filed.status, 201, await filed.text());

  assert.equal(api.tables.stock_groups[0].qc_status, 'pass', 'the yard agrees with the bench');
});

/**
 * Passing a batch nobody has bagged releases nothing, and says so.
 *
 * This is correct - a verdict releases stock that already exists and does not
 * create any - and it is the single most confusing thing the lab can do,
 * because the test files, the tab updates, and the yard stays empty. The
 * response carries which stock group moved so the screen can tell the two
 * apart, and `null` is the answer that needs saying out loud.
 */
test('a verdict on unpacked stock reports that it released nothing', async (t) => {
  const api = await startApi({ tables: { stock_groups: [], quality_tests: [] } });
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: { kind: 'batch', batchNo: '2617', grade: 'Special', verdict: 'pass' },
  });
  // Read once: the body is a stream, and spending it on a failure message
  // leaves the assertion below with nothing to parse.
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(
    body.data.stock_released,
    null,
    'nothing was bagged, so nothing was released - and the screen has to be able to say it',
  );
});

test('a verdict on packed stock reports the group it released', async (t) => {
  const packed = {
    id: '88888888-8888-4888-8888-888888888888',
    kind: 'batch',
    label: '2776-Special',
    quality: 'Special',
    packed_sacks: 17,
    dispatched_sacks: 0,
    available_sacks: 17,
    qc_status: 'pending',
  };
  const api = await startApi({ tables: { stock_groups: [packed], quality_tests: [] } });
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: { kind: 'batch', batchNo: '2776', grade: 'Special', verdict: 'pass' },
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));

  const released = body.data.stock_released;
  assert.equal(released.label, '2776-Special');
  assert.equal(released.available_sacks, 17);
  assert.equal(released.qc_status, 'pass');
});

test('a verdict on any slot decides the whole period', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  // A pool is one lot as far as the yard is concerned - there is one
  // qc_status on it and one Dispatch button - so a hold anywhere in the period
  // stops the period. Sampling three times is about catching a drift the one
  // sample would have missed, not about grading the ten days separately.
  await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: sample({ verdict: 'hold', shiftDate: '2026-08-02' }),
  });
  assert.equal(api.tables.stock_groups[0].qc_status, 'fail', 'a hold in slot 1 stops the pool');

  const [pool] = (await (await api.call('/stock/pools', { role: 'lab' })).json()).data;
  assert.equal(pool.slots[0].test.verdict, 'hold');
  assert.equal(pool.slots[1].test, null, 'and the other slots are still to be taken');
  assert.equal(pool.slots[2].test, null);
});

test('an empty slot stays empty rather than being filled by a mis-dated sample', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  // Dated into H2 while naming H1 - a filing mistake. It must not be pulled
  // into H1's nearest slot, or a sample nobody took would read as taken.
  await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: sample({ shiftDate: '2026-08-15' }),
  });

  const [pool] = (await (await api.call('/stock/pools', { role: 'lab' })).json()).data;
  assert.equal(pool.samples_taken, 0);
  assert.deepEqual(
    pool.slots.map((slot) => slot.test),
    [null, null, null],
  );
});

test('a re-sample of the same slot is the newest word on it', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: sample({ verdict: 'hold', testedAt: '2026-08-05T09:00:00.000Z' }),
  });
  await api.call('/quality-tests', {
    role: 'lab',
    method: 'POST',
    body: sample({ verdict: 'pass', shiftDate: '2026-08-06', testedAt: '2026-08-06T09:00:00.000Z' }),
  });

  const [pool] = (await (await api.call('/stock/pools', { role: 'lab' })).json()).data;
  assert.equal(pool.samples_taken, 1, 'both samples are in slot 2 - that is still one slot filled');
  assert.equal(pool.slots[1].test.verdict, 'pass', 'the re-sample stands');
});

// ---------------------------------------------------------------------------
// What cannot be filed
// ---------------------------------------------------------------------------

test('coarse cannot be filed as a batch test, and a pool cannot be filed as a grade', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  const refusals = [
    // Coarse is not a grade a batch is tested in - there is no batch behind it.
    [{ kind: 'batch', batchNo: 'B1041', grade: 'Coarse', verdict: 'pass' }, 'coarse as a batch test'],
    // A pool is coarse by definition.
    [sample({ grade: 'Fine' }), 'a pool sample claiming another grade'],
    // Without a date there is no slot to file it in.
    [sample({ shiftDate: undefined }), 'a pool sample with no date'],
    // Without the pool there is nothing to file it against.
    [sample({ batchNo: undefined }), 'a pool sample naming no pool'],
  ];

  for (const [body, what] of refusals) {
    const res = await api.call('/quality-tests', { role: 'lab', method: 'POST', body });
    assert.equal(res.status, 422, `${what} must be refused`);
  }
  assert.equal(api.tables.quality_tests.length, 0, 'and none of them may have been written');
});

// ---------------------------------------------------------------------------
// Who may read it
// ---------------------------------------------------------------------------

test('the lab reads the pools and nothing else in the yard', async (t) => {
  const api = await startApi({ tables: { stock_groups: [{ ...POOL }], quality_tests: [] } });
  t.after(() => api.stop());

  // It has to see which periods exist and which slots are empty, or it cannot
  // sample them. The response carries stock and readings and nothing priced.
  assert.equal((await api.call('/stock/pools', { role: 'lab' })).status, 200);

  // The yard's own ledger is not the bench's business, and neither is the
  // shop floor's summary.
  assert.equal((await api.call('/stock', { role: 'lab' })).status, 403);
  assert.equal((await api.call('/stock/summary', { role: 'lab' })).status, 403);

  const body = await (await api.call('/stock/pools', { role: 'lab' })).json();
  const wire = JSON.stringify(body.data);
  for (const key of ['unit_price', 'customer', 'customer_id', 'customer_name', 'dispatched_sacks']) {
    assert.equal(wire.includes(`"${key}"`), false, `the pools response must not carry ${key}`);
  }
});
