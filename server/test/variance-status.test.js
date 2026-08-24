import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Whether the rule is running.
 *
 * The plant's rule is that a figure which missed its benchmark is explained by
 * the shift that worked it and signed off by the office. Both halves existed
 * before this and neither could be seen: a supervisor did not know what they
 * still owed, a manager did not know what was waiting on them, and nobody could
 * say whether any of it was happening at all.
 *
 * A miss is in exactly one of three states, and the ways to get that wrong are:
 *
 *   1. Losing the misses nobody has touched. They are the whole point - a board
 *      that only lists what has been written about shows an empty queue on a
 *      plant where nothing has been written about anything.
 *
 *   2. Reading "not yet looked at" as done. An unapproved reason is waiting, not
 *      settled, and counting it as settled would report a process as running
 *      when only half of it is.
 *
 *   3. Matching a reason to the wrong miss. A reason belongs to a day, a shift
 *      and a parameter; matched on its wording it would attach to whatever it
 *      happened to read like.
 */

const DAY = '2026-08-01';

const grinderRun = (over = {}) => ({
  id: 'run-grd',
  machine_id: 'GRD_K',
  machine: 'Grinder 1',
  line: 'grind',
  kind: 'grind',
  shift_date: DAY,
  shift: 'Day',
  workers: 2,
  hours_run: 10,
  kwh: 500,
  weight_kg: 1000,
  ...over,
});

/** 1000 kg against a 1200 target, so `prod.GRD_K` is a miss and the rest are not. */
const seed = (reasons = [], roster = []) => ({
  runs: [grinderRun()],
  ideal_values: [{ id: 'current', data: { 'prod.GRD_K': 1200 } }],
  efficiency_notes: [],
  variance_reasons: reasons,
  operators: [{ id: 'op-1', name: 'Suresh', active: true }],
  shift_operators: roster,
});

const reason = (over = {}) => ({
  id: 'reason-1',
  shift_date: DAY,
  shift: 'Day',
  parameter: 'prod.GRD_K',
  label: 'Grinder 1 · output',
  ideal: 1200,
  actual: 1000,
  reason: 'the feed ran out at 14:00',
  entered_by: 'Rahul',
  created_at: '2026-08-01T14:30:00.000Z',
  ...over,
});

const statusOf = async (api, role = 'manager') => {
  const res = await api.call(`/reports/variance-status?from=${DAY}&to=${DAY}`, { role });
  assert.equal(res.status, 200);
  return (await res.json()).data;
};

test('a miss nobody has explained is on the board', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const s = await statusOf(api);
  assert.equal(s.totals.misses, 1);
  assert.equal(s.totals.unexplained, 1, 'the queue starts full, not empty');
  assert.equal(s.totals.waiting, 0);
  assert.equal(s.totals.approved, 0);

  const [item] = s.items;
  assert.equal(item.parameter, 'prod.GRD_K');
  assert.equal(item.state, 'unexplained');
  assert.equal(item.ideal, 1200);
  assert.equal(item.actual, 1000);
});

test('explained but unsigned is waiting, not done', async (t) => {
  const api = await startApi({ tables: seed([reason()]) });
  t.after(() => api.stop());

  const s = await statusOf(api);
  assert.equal(s.totals.unexplained, 0);
  assert.equal(s.totals.waiting, 1, 'the office still owes a signature');
  assert.equal(s.totals.approved, 0, 'and it is not counted as settled');
  assert.equal(s.items[0].reason, 'the feed ran out at 14:00');
  assert.equal(s.items[0].enteredBy, 'Rahul');
});

test('signed off is done, and says who signed it', async (t) => {
  const api = await startApi({
    tables: seed([
      reason({
        approved_at: '2026-08-02T09:00:00.000Z',
        approved_by: 'Manager',
        manager_note: 'agreed, the yard was empty',
      }),
    ]),
  });
  t.after(() => api.stop());

  const s = await statusOf(api);
  assert.equal(s.totals.approved, 1);
  assert.equal(s.totals.waiting, 0);
  assert.equal(s.items[0].state, 'approved');
  assert.equal(s.items[0].approvedBy, 'Manager');
  // The two texts stay apart, here as everywhere else they are read.
  assert.equal(s.items[0].reason, 'the feed ran out at 14:00');
  assert.equal(s.items[0].managerNote, 'agreed, the yard was empty');
});

test('a reason for another shift does not settle this one', async (t) => {
  const api = await startApi({
    // Same parameter, same day, the other shift. Matched on the wording alone it
    // would have attached here and reported a miss as explained.
    tables: seed([reason({ shift: 'Night', approved_at: '2026-08-02T09:00:00.000Z' })]),
  });
  t.after(() => api.stop());

  const s = await statusOf(api);
  assert.equal(s.totals.unexplained, 1, 'the day shift still owes an answer');
  assert.equal(s.totals.approved, 0);
});

test('the three who need to see it can, and the MD cannot sign', async (t) => {
  const api = await startApi({ tables: seed([reason()]) });
  t.after(() => api.stop());

  // The shift sees what it owes, the office sees its queue, and the managing
  // director sees whether the process is running at all.
  for (const role of ['supervisor', 'manager', 'md']) {
    const res = await api.call(`/reports/variance-status?from=${DAY}&to=${DAY}`, { role });
    assert.equal(res.status, 200, `${role} could not read the board`);
  }

  const signed = await api.call('/reports/variance-reasons/reason-1/approve', {
    role: 'md',
    method: 'POST',
    body: {},
  });
  assert.equal(signed.status, 403, 'observing is not approving');
});

test('a miss names whoever was on that line', async (t) => {
  const api = await startApi({
    tables: seed(
      [],
      [
        {
          id: 'slot-1',
          shift_date: DAY,
          shift: 'Day',
          station: 'GRD_K',
          operator_id: 'op-1',
          operator: 'Suresh',
        },
        // The same line, the other shift. Matched on the station alone it would
        // have named this one too.
        {
          id: 'slot-2',
          shift_date: DAY,
          shift: 'Night',
          station: 'GRD_K',
          operator_id: 'op-1',
          operator: 'Ramesh',
        },
      ],
    ),
  });
  t.after(() => api.stop());

  const s = await statusOf(api);
  assert.equal(s.items[0].operator, 'Suresh');
});

test('a line with nobody on it says so rather than staying quiet', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const s = await statusOf(api);
  const miss = s.items.find((i) => i.parameter === 'prod.GRD_K');
  /*
   * Null, and present. It is a line nobody is on, which is a gap somebody
   * should go and fill - as against a figure that is not a line's at all, where
   * the key is absent and the screen shows nothing rather than inventing a gap.
   */
  assert.ok(Object.hasOwn(miss, 'operator'));
  assert.equal(miss.operator, null);
});
