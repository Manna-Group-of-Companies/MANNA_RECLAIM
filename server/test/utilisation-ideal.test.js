import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { IDEAL_VALUE_FIELDS, IDEAL_UTILISATION_MACHINES, idealKey } from '../src/config/constants.js';

/**
 * A utilisation target the manager sets, per machine.
 *
 * Utilisation was the one figure on the efficiency screen held to a fixed bar
 * rather than to a benchmark - measured against the twelve hours of the shift
 * and nothing else, on the reasoning that twelve hours is twelve hours whatever
 * the plant has averaged.
 *
 * Half of that was right. It is a good floor and a poor target: a vessel that
 * cooks eight hours to a charge and a grinder that should be turning all twelve
 * are both working properly, and one bar across both calls the vessel a bad
 * shift every time it has a good one. So the target is now the manager's, per
 * machine, and the fixed floor stays underneath for a machine nobody has set one
 * for yet.
 */

const machine = (id, name, kind, order) => ({
  id, name, kind, enabled: true, sort_order: order,
});

const PLANT = [
  machine('GRD_K', 'Grinder 1', 'grind', 1),
  machine('AC_M', 'Autoclave M', 'autoclave', 2),
  machine('PRS_P3', 'Press 3', 'press', 3),
];

/** Nine hours of a twelve-hour shift: 75%. */
const RUNS = [{
  id: 'r-1',
  machine_id: 'GRD_K',
  machine: 'Grinder 1',
  kind: 'grind',
  line: 'grind',
  shift_date: '2026-08-20',
  shift: 'Day',
  workers: 3,
  hours_run: 9,
  kwh: 100,
  weight_kg: 4000,
  ended_at: '2026-08-20T20:00:00.000Z',
}];

const api = () => startApi({
  tables: { runs: RUNS, machines: PLANT, ideal_values: [] },
});

const board = async (app) => {
  const res = await app.call('/reports/shift-efficiency?date=2026-08-20&shift=Day', { role: 'manager' });
  // Read once. A Response body cannot be read twice, so asserting on .text()
  // and then parsing .json() throws instead of reporting what went wrong.
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body.data;
};

const rowFor = (data, id) => data.utilisation.find((u) => u.machineId === id);

test('every machine that records hours is offered a utilisation target', async () => {
  const keys = IDEAL_VALUE_FIELDS.filter((f) => f.key.startsWith('util.')).map((f) => f.key);
  assert.equal(keys.length, IDEAL_UTILISATION_MACHINES.length);
  assert.ok(keys.includes(idealKey.utilisation('GRD_K')));
  assert.ok(keys.includes(idealKey.utilisation('AC_M')));
  assert.ok(keys.includes(idealKey.utilisation('R4')));

  /*
   * And the presses are not offered one. Five press runs on the whole record
   * and not one with an hours figure against it - a target on a machine that
   * cannot report the number it is judged on is a row permanently blank on the
   * screen and permanently unmet on the report.
   */
  assert.ok(!keys.includes(idealKey.utilisation('PRS_P3')));
  assert.ok(!keys.includes(idealKey.utilisation('PRS_P5')));

  // Higher is better, which the screen needs told: it draws a shortfall red and
  // would otherwise colour a machine that ran longer than its target.
  const field = IDEAL_VALUE_FIELDS.find((f) => f.key === idealKey.utilisation('GRD_K'));
  assert.equal(field.lowerIsBetter, false);
  assert.equal(field.unit, '%');
  assert.equal(field.label, 'Grinder 1 — utilisation');
});

test('with no target set, utilisation still reports and compares against nothing', async (t) => {
  const app = await api();
  t.after(() => app.stop());

  const row = rowFor(await board(app), 'GRD_K');
  assert.equal(row.pct, 75);
  assert.equal(row.ideal, null, 'nobody has set one');
  assert.equal(row.variance, null, 'and so no comparison has been made');
  // The fixed floor still watches it, which is what makes an unset target a
  // comparison nobody has made rather than a machine nobody is watching.
  assert.equal(row.warn, false, '75% is above the downtime floor');
});

test('a target the manager sets is what the machine is then held to', async (t) => {
  const app = await api();
  t.after(() => app.stop());

  const saved = await app.call('/rates/ideal-values', {
    method: 'PUT',
    role: 'manager',
    body: { data: { [idealKey.utilisation('GRD_K')]: 90, [idealKey.utilisation('AC_M')]: 60 } },
  });
  assert.equal(saved.status, 200, JSON.stringify(await saved.json()));

  const data = await board(app);
  const grinder = rowFor(data, 'GRD_K');
  assert.equal(grinder.ideal, 90);
  assert.equal(grinder.variance, -15, 'ran 75% of a shift against a 90% target');
  assert.equal(grinder.offTarget, true);
  assert.equal(grinder.idealLabel, 'Grinder 1 — utilisation');
});

test('a vessel and a grinder are held to their own targets, not to one bar', async (t) => {
  const app = await api();
  t.after(() => app.stop());

  await app.call('/rates/ideal-values', {
    method: 'PUT',
    role: 'manager',
    body: { data: { [idealKey.utilisation('GRD_K')]: 70 } },
  });

  /*
   * The whole reason this is per machine. At 75% the grinder is over a 70%
   * target and under the 90% one above - the same shift, the same number, two
   * different answers, because they are two different machines.
   */
  const grinder = rowFor(await board(app), 'GRD_K');
  assert.equal(grinder.ideal, 70);
  assert.equal(grinder.variance, 5);
  assert.equal(grinder.offTarget, false);
});

test('a machine that did not run is not held to a target it was never given work for', async (t) => {
  const app = await api();
  t.after(() => app.stop());

  await app.call('/rates/ideal-values', {
    method: 'PUT',
    role: 'manager',
    body: { data: { [idealKey.utilisation('AC_M')]: 60 } },
  });

  // Nought of twelve is still reported - a utilisation list that dropped the
  // machines nobody switched on would report the plant as busier the less of it
  // was working - but a shift it was never rostered for is not a miss.
  const vessel = rowFor(await board(app), 'AC_M');
  assert.equal(vessel.pct, 0);
  assert.equal(vessel.runs, 0);
  assert.equal(vessel.ideal, 60);
  assert.equal(vessel.variance, null, 'no run, no comparison');
  assert.equal(vessel.warn, false);
});
