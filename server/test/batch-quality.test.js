import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The lab record, read the way the plant asks it: batch, then grade.
 *
 * A charge goes into an autoclave under a number and is refined into several
 * grades, and each grade is tested on its own. So the unit is the pair, not the
 * batch - and three things follow that are each a way to report the wrong
 * verdict about real stock:
 *
 *   1. Collapsing the grades. The database has a `quality_latest` view keyed on
 *      the batch without the grade, so it answers with whichever grade happened
 *      to be tested last. That is a verdict filed under another grade's name,
 *      and it decides whether sacks may leave the yard.
 *
 *   2. Calling a part-passed batch passed. One grade on hold is stock that
 *      cannot go out, and a headline reading "passed" because most of it had is
 *      the one sentence on the page somebody acts on wrongly.
 *
 *   3. Losing the re-tests. The lab holds a grade and tests it again; passed on
 *      the second go is a different fact from passed, and it is the kind an
 *      argument turns on months later.
 */

const test_ = (over = {}) => ({
  id: `t-${Math.abs(JSON.stringify(over).length)}-${over.id ?? ''}`,
  kind: 'batch',
  batch_no: '2782',
  quality: 'Fine',
  verdict: 'pass',
  ts: '2026-08-03T10:00:00.000Z',
  tester: 'Lab',
  params: [],
  ...over,
});

const boardOf = async (rows, role = 'md', query = '') => {
  const api = await startApi({ tables: { quality_tests: rows } });
  const res = await api.call(`/quality-tests/by-batch${query}`, { role });
  assert.equal(res.status, 200);
  return { api, board: (await res.json()).data };
};

test('a batch carries a verdict per grade, not one between them', async (t) => {
  const { api, board } = await boardOf([
    test_({ id: 'a', quality: 'Fine', verdict: 'hold', ts: '2026-08-03T10:00:00.000Z' }),
    test_({ id: 'b', quality: 'Special', verdict: 'pass', ts: '2026-08-03T11:00:00.000Z' }),
  ]);
  t.after(() => api.stop());

  const [batch] = board.batches;
  assert.equal(batch.grades.length, 2);

  const by = new Map(batch.grades.map((g) => [g.grade, g]));
  assert.equal(by.get('Fine').verdict, 'hold');
  assert.equal(by.get('Special').verdict, 'pass');

  /*
   * Keyed on the batch alone - which is what quality_latest does - the later
   * Special test would answer for Fine as well, and Fine's hold would vanish.
   */
  assert.equal(batch.verdict, 'part', 'some clear and some not is its own answer');
});

test('a batch is only passed when every grade off it is', async (t) => {
  const { api, board } = await boardOf([
    test_({ id: 'a', quality: 'Fine', verdict: 'pass' }),
    test_({ id: 'b', quality: 'Special', verdict: 'pass' }),
  ]);
  t.after(() => api.stop());

  assert.equal(board.batches[0].verdict, 'pass');

  const held = await boardOf([
    test_({ id: 'c', quality: 'Fine', verdict: 'hold' }),
    test_({ id: 'd', quality: 'Special', verdict: 'hold' }),
  ]);
  t.after(() => held.api.stop());
  assert.equal(held.board.batches[0].verdict, 'hold');
});

test('the newest test stands, and the ones before it are counted', async (t) => {
  const { api, board } = await boardOf([
    test_({ id: 'a', verdict: 'hold', ts: '2026-08-03T09:00:00.000Z' }),
    test_({ id: 'b', verdict: 'hold', ts: '2026-08-03T10:00:00.000Z' }),
    test_({ id: 'c', verdict: 'pass', ts: '2026-08-03T11:00:00.000Z' }),
  ]);
  t.after(() => api.stop());

  const [grade] = board.batches[0].grades;
  assert.equal(grade.verdict, 'pass', 'the lab re-tested and it went through');
  // But not silently. Passed on the third go is a different fact from passed.
  assert.equal(grade.tests, 3);
  assert.equal(grade.held, 2);
  assert.equal(grade.history.length, 2, 'the earlier two are kept, newest first');
  assert.equal(grade.history[0].testedAt, '2026-08-03T10:00:00.000Z');
});

test('the readings on the standing test come back with it', async (t) => {
  const sheet = [
    { name: 'Mooney viscosity', value: '28.52', unit: '' },
    { name: 'Ash %', value: '6.055', unit: '' },
  ];
  const { api, board } = await boardOf([
    test_({ id: 'old', verdict: 'hold', ts: '2026-08-03T09:00:00.000Z', params: [] }),
    test_({ id: 'new', verdict: 'pass', ts: '2026-08-03T11:00:00.000Z', params: sheet }),
  ]);
  t.after(() => api.stop());

  const [grade] = board.batches[0].grades;
  assert.deepEqual(grade.readings, sheet, 'the figures behind the verdict that stands');
  assert.equal(board.totals.withReadings, 1);
});

test('a verdict with no figures behind it is counted as such', async (t) => {
  const { api, board } = await boardOf([
    test_({ id: 'a', batch_no: '2782', params: [] }),
    test_({
      id: 'b',
      batch_no: '2925',
      ts: '2026-07-08T10:00:00.000Z',
      params: [{ name: 'Ash %', value: '5.61', unit: '' }],
    }),
  ]);
  t.after(() => api.stop());

  /*
   * The gap is the finding, so it is a figure on the response rather than
   * something a screen works out: a page that only showed verdicts would look
   * entirely healthy on a record where nobody writes the numbers down.
   */
  assert.equal(board.totals.batches, 2);
  assert.equal(board.totals.withReadings, 1);
});

test('the window is the window, and the newest batch leads', async (t) => {
  const { api, board } = await boardOf(
    [
      test_({ id: 'old', batch_no: '2617', ts: '2026-06-01T10:00:00.000Z' }),
      test_({ id: 'mid', batch_no: '2782', ts: '2026-08-03T10:00:00.000Z' }),
      test_({ id: 'new', batch_no: '2925', ts: '2026-08-20T10:00:00.000Z' }),
    ],
    'md',
    '?from=2026-08-01&to=2026-08-31',
  );
  t.after(() => api.stop());

  assert.deepEqual(
    board.batches.map((b) => b.batch),
    ['2925', '2782'],
    'June is outside the window, and the newest is read first',
  );
});

test('the managing director reads it, and so does the bench', async (t) => {
  const api = await startApi({ tables: { quality_tests: [test_({ id: 'a' })] } });
  t.after(() => api.stop());

  // The lab's own record, the office that acts on it, and the account that
  // watches whether the plant is testing at all.
  for (const role of ['lab', 'manager', 'md']) {
    const res = await api.call('/quality-tests/by-batch', { role });
    assert.equal(res.status, 200, `${role} could not read the lab record`);
  }
});
