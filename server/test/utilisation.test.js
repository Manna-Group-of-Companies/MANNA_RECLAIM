import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * How much of the twelve hours each machine actually ran.
 *
 * It was on the grinder cards and nowhere else, so the plant could see that
 * Grinder 1 ran nine hours of twelve and had no way to ask the same of a
 * refiner, a vessel or a press. It is the one question on the efficiency screen
 * that means the same thing for every machine the plant owns - a shift is twelve
 * hours whatever is bolted to the floor.
 *
 * Three ways to answer it wrongly:
 *
 *   1. Leaving out the machines that did not run. Nought of twelve is the answer
 *      to the question, and a report that dropped them would say the plant was
 *      busier the less of it was working.
 *
 *   2. Asking again about a machine that has been answered for. A machine on a
 *      logged breakdown ran nothing for a reason already on record.
 *
 *   3. Averaging by total hours over total capacity, which lets one vessel on a
 *      long charge cover for three machines standing idle.
 */

const DAY = '2026-08-01';

const machine = (id, kind, name, over = {}) => ({
  id,
  name,
  kind,
  enabled: true,
  sort_order: 1,
  group_name: 'Plant',
  ...over,
});

/** Four machines: two that run, one that does not, one that is broken down. */
const PLANT = [
  machine('GRD_K', 'grind', 'Grinder 1'),
  machine('R4', 'refiner', 'Refiner 4'),
  machine('GRD_S', 'grind', 'Grinder 2'),
  machine('AC_A', 'autoclave', 'Autoclave A'),
  // Off the plant. It is not a machine standing idle, it is not a machine.
  machine('SLEEVE', 'sleeve', 'Sleeve', { enabled: false }),
];

const run = (id, machineId, hours, over = {}) => ({
  id,
  machine_id: machineId,
  machine: machineId,
  kind: 'grind',
  line: 'grind',
  shift_date: DAY,
  shift: 'Day',
  hours_run: hours,
  weight_kg: 100,
  workers: 2,
  ...over,
});

/** The shift as a role reads it, and the api handle so the test can stop it. */
const shiftOf = async (tables, role = 'md') => {
  const api = await startApi({ tables });
  const res = await api.call(`/reports/shift-efficiency?date=${DAY}&shift=Day`, { role });
  assert.equal(res.status, 200);
  return { api, data: (await res.json()).data };
};

test('every machine on the plant is on the list, including the idle ones', async (t) => {
  const { api, data } = await shiftOf({
    machines: PLANT,
    runs: [run('r-1', 'GRD_K', 9), run('r-2', 'R4', 6)],
  });
  t.after(() => api.stop());

  const by = new Map(data.utilisation.map((u) => [u.machineId, u]));
  assert.equal(by.size, 4, 'the four enabled machines - the disabled one is not a machine');

  assert.equal(by.get('GRD_K').hours, 9);
  assert.equal(by.get('GRD_K').pct, 75, '9 of 12');
  assert.equal(by.get('GRD_K').idle, 3);

  assert.equal(by.get('R4').pct, 50);

  // The whole point: a machine nobody switched on reports nought, not nothing.
  assert.equal(by.get('GRD_S').hours, 0);
  assert.equal(by.get('GRD_S').pct, 0);
  assert.equal(by.get('GRD_S').idle, 12);
  assert.equal(by.get('GRD_S').runs, 0);
});

test('several runs on one machine are its hours added up', async (t) => {
  const { api, data } = await shiftOf({
    machines: PLANT,
    // Stopped and started again inside the shift - two records, one machine.
    runs: [run('r-1', 'GRD_K', 4), run('r-2', 'GRD_K', 5)],
  });
  t.after(() => api.stop());

  const grinder = data.utilisation.find((u) => u.machineId === 'GRD_K');
  assert.equal(grinder.hours, 9);
  assert.equal(grinder.runs, 2);
  assert.equal(grinder.pct, 75);
});

test('a machine already answered for is not asked about again', async (t) => {
  const { api, data } = await shiftOf({
    machines: PLANT,
    runs: [run('r-1', 'GRD_K', 9)],
    maintenance: [
      {
        id: 'down-1',
        machine_id: 'GRD_S',
        down_start: `${DAY}T02:00:00.000Z`,
        root_cause: null,
      },
    ],
  });
  t.after(() => api.stop());

  const by = new Map(data.utilisation.map((u) => [u.machineId, u]));
  assert.equal(by.get('GRD_S').pct, 0);
  assert.equal(by.get('GRD_S').down.open, true);
  assert.equal(by.get('GRD_S').warn, false, 'the breakdown is the answer');

  /*
   * And neither is a machine that simply did not run. That is not low
   * utilisation, it is not run - a different question, owned by the Not
   * accounted for list, which chases it and asks for a breakdown. Flagged here
   * too, the two presses the plant almost never uses would sit red on every
   * shift of every month, and a flag that fires every time teaches people to
   * read past the flags that mean something.
   */
  assert.equal(by.get('AC_A').warn, false, 'not run is not the same as ran short');
});

test('a machine that ran and ran short is the one flagged', async (t) => {
  const { api, data } = await shiftOf({
    machines: PLANT,
    // Four hours of twelve. It was switched on, it was worked, and it did a
    // third of a shift - which is the case this section exists to surface.
    runs: [run('r-1', 'GRD_K', 4), run('r-2', 'R4', 11)],
  });
  t.after(() => api.stop());

  const by = new Map(data.utilisation.map((u) => [u.machineId, u]));
  assert.equal(by.get('GRD_K').pct, 33);
  assert.equal(by.get('GRD_K').warn, true);
  assert.equal(by.get('R4').warn, false, '92% is a full shift by any reading');
});

test('a charge longer than the shift is shown as such, not flattened to full', async (t) => {
  const { api, data } = await shiftOf({
    machines: PLANT,
    runs: [run('r-1', 'AC_A', 14, { kind: 'autoclave', line: 'special' })],
  });
  t.after(() => api.stop());

  const vessel = data.utilisation.find((u) => u.machineId === 'AC_A');
  /*
   * A vessel whose charge ran past the shift change genuinely occupied more than
   * twelve hours of it. Clamped to 100% that reads as a full shift and hides the
   * one case worth looking at; the cap is at 150% and catches a mis-keyed meter.
   */
  assert.equal(vessel.pct, 117);
  assert.equal(vessel.idle, 0, 'never negative');
});

test('the plant figure is the mean of the machines, not the hours over capacity', async (t) => {
  const { api, data } = await shiftOf({
    machines: PLANT,
    // 12 hours on one machine and nothing on the other three. Summed against
    // capacity that is 12/48 = 25%; as a mean of the four it is the same 25% -
    // so the case that tells them apart is an over-running charge.
    runs: [run('r-1', 'AC_A', 24, { kind: 'autoclave' })],
  });
  t.after(() => api.stop());

  /*
   * 24 hours over a 48-hour capacity would report the plant half busy on a shift
   * where three of its four machines never turned. As a mean of the machines the
   * vessel contributes its capped 150 and the rest nought: 38%.
   */
  assert.equal(data.utilisationTotals.machines, 4);
  assert.equal(data.utilisationTotals.ran, 1);
  assert.equal(data.utilisationTotals.pct, 38);
  assert.equal(data.utilisationTotals.shiftHours, 12);
});

test('the crew reads it too, because the crew is measured on it', async (t) => {
  const started = await startApi({ tables: { machines: PLANT, runs: [run('r-1', 'GRD_K', 9)] } });
  t.after(() => started.stop());

  for (const role of ['worker', 'supervisor', 'manager', 'md']) {
    const res = await started.call(`/reports/shift-efficiency?date=${DAY}&shift=Day`, { role });
    assert.equal(res.status, 200, `${role} could not read the shift`);
    const { data } = await res.json();
    assert.ok(data.utilisation.length > 0);
  }
});
