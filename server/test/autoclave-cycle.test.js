import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What a vessel is judged on.
 *
 * It was the number of charges it got through in a day, and that is a fact
 * about how much work there was rather than about the vessel: a quiet day is
 * not a slow autoclave, and the crew cannot answer for it. How long each charge
 * took is the vessel's own - it is the figure that moves when a valve is passing
 * or the fire is not being kept up - and the manager sets the time a charge
 * should take on the Ideal values tab.
 *
 * Three ways to get it wrong:
 *
 *   1. Counting a charge whose time nobody wrote down as a charge that took no
 *      time. Averaged in as nought it reports the vessel as twice as quick.
 *
 *   2. One target for both vessels. Across the whole record A runs a median
 *      8.3 h a charge and M 7.4, so a shared target would flag the slower one on
 *      every charge it ever cooked correctly.
 *
 *   3. Showing only the average. Two charges, one quick and one that doubled,
 *      average to something respectable - and the rule is that each charge is
 *      held to the time, so each charge carries its own verdict.
 */

const DAY = '2026-08-01';

const charge = (id, machineId, hours, over = {}) => ({
  id,
  machine_id: machineId,
  machine: machineId,
  kind: 'autoclave',
  line: 'special',
  shift_date: DAY,
  shift: 'Day',
  batch_no: `B-${id}`,
  hours_run: hours,
  capacity: 2000,
  started_at: `2026-08-01T0${id.slice(-1)}:00:00.000Z`,
  ...over,
});

const IDEALS = {
  id: 'current',
  // Different targets for the two vessels, because they are different vessels.
  data: { 'cycle.AC_A': 8, 'cycle.AC_M': 7 },
};

const cardsOf = async (tables, role = 'md') => {
  const api = await startApi({ tables });
  const res = await api.call(`/reports/shift-efficiency?date=${DAY}&shift=Day`, { role });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  return { api, by: new Map(data.autoclaves.map((c) => [c.machineId, c])) };
};

test('each charge is held to the time the manager set for that vessel', async (t) => {
  const { api, by } = await cardsOf({
    runs: [charge('c1', 'AC_A', 7.5), charge('c2', 'AC_A', 10.5)],
    ideal_values: [IDEALS],
  });
  t.after(() => api.stop());

  const a = by.get('AC_A');
  assert.equal(a.charges.length, 2);

  // Each charge carries its own verdict, because the rule is about the charge.
  const [quick, slow] = a.charges;
  assert.equal(quick.hours, 7.5);
  assert.equal(quick.offTarget, false);
  assert.equal(quick.overBy, -0.5);

  assert.equal(slow.hours, 10.5);
  assert.equal(slow.offTarget, true);
  assert.equal(slow.overBy, 2.5);

  // And the average is what a reason is filed against - one parameter per
  // vessel per shift, because two charges would collide on a per-charge one.
  const cycle = a.metrics.find((m) => m.key === 'cycle');
  assert.equal(cycle.value, 9);
  assert.equal(cycle.ideal, 8);
  assert.equal(cycle.offTarget, true);
  assert.equal(cycle.lowerIsBetter, true, 'a charge that takes longer is worse');
  assert.equal(cycle.parameter, 'cycle.AC_A');
});

test('the two vessels are held to their own times', async (t) => {
  const { api, by } = await cardsOf({
    runs: [charge('c1', 'AC_A', 7.5), charge('c2', 'AC_M', 7.5)],
    ideal_values: [IDEALS],
  });
  t.after(() => api.stop());

  // The same 7.5 hours: inside A's eight and over M's seven.
  assert.equal(by.get('AC_A').metrics.find((m) => m.key === 'cycle').offTarget, false);
  assert.equal(by.get('AC_M').metrics.find((m) => m.key === 'cycle').offTarget, true);
});

test('a charge nobody timed is not a charge that took no time', async (t) => {
  const { api, by } = await cardsOf({
    runs: [charge('c1', 'AC_A', 9), charge('c2', 'AC_A', 0)],
    ideal_values: [IDEALS],
  });
  t.after(() => api.stop());

  const a = by.get('AC_A');
  const untimed = a.charges.find((c) => c.id === 'c2');
  assert.equal(untimed.hours, null, 'nought hours is a blank sheet, not a quick charge');
  assert.equal(untimed.offTarget, false, 'and nothing to hold against the target');

  // Averaged in as a nought this would read 4.5 h and the vessel would look
  // twice as quick as it ran.
  const cycle = a.metrics.find((m) => m.key === 'cycle');
  assert.equal(cycle.value, 9);
  assert.equal(cycle.context, '1 charge this shift');
});

test('the charge count is still there, and is still a fact about the day', async (t) => {
  const { api, by } = await cardsOf({
    runs: [
      charge('c1', 'AC_A', 8, { shift: 'Day' }),
      // The handover falls in the middle of a vessel's day, which is why this
      // one is counted per day and the times are counted per shift.
      charge('c2', 'AC_A', 8, { shift: 'Night' }),
    ],
    ideal_values: [{ id: 'current', data: { ...IDEALS.data, 'runs.AC_A': 3 } }],
  });
  t.after(() => api.stop());

  const a = by.get('AC_A');
  const runs = a.metrics.find((m) => m.key === 'runs');
  assert.equal(runs.value, 2, 'both charges, whichever shift each was logged on');
  assert.equal(runs.span, 'day');
  assert.equal(runs.offTarget, true, 'two against a target of three');

  // The times, though, are this shift's charges only.
  assert.equal(a.charges.length, 1);
  assert.equal(a.metrics.find((m) => m.key === 'cycle').span, 'shift');
});

test('with no time set, a charge is measured against nothing rather than flagged', async (t) => {
  const { api, by } = await cardsOf({
    runs: [charge('c1', 'AC_A', 14)],
    ideal_values: [{ id: 'current', data: {} }],
  });
  t.after(() => api.stop());

  const a = by.get('AC_A');
  assert.equal(a.metrics.find((m) => m.key === 'cycle').ideal, null);
  assert.equal(a.charges[0].offTarget, false);
  assert.equal(a.charges[0].overBy, null, 'nothing to be over by');
  assert.equal(a.charges[0].hours, 14, 'the figure is still worth reading');
});
