import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What the plant should have made, beside what it did.
 *
 * The Efficiency tab has always measured the plant against its own median. That
 * answers "is this shift worse than usual" and it cannot answer "is usual any
 * good" - a line that has run under its capacity for two years has a median that
 * says so, and a screen that never once flags it. The manager's ideal values are
 * the other half, and there are three ways to get them wrong:
 *
 *   1. Comparing in the wrong direction. More kg is better and fewer kWh per kg
 *      is better, and a comparison that does not know the difference flags every
 *      good shift the energy line ever has.
 *
 *   2. Reading a blank as a target of nought, which would put every line in a
 *      plant that has never filled the sheet in permanently over target - a hole
 *      reported as a pass.
 *
 *   3. Letting a reason drift from the numbers it was written about. The ideal
 *      and the actual are snapshotted onto the record, so a target raised next
 *      month leaves last month's explanation saying what it said.
 *
 * Each is asserted below.
 */

const DAY = '2026-08-01';

/** A grinder shift: 1000 kg on 2 hands over 10 h, at 500 kWh. */
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

/** The coarse line's shift. Only R2 weighs, so the line has one output figure. */
const coarseRun = (over = {}) => ({
  id: 'run-coarse',
  machine_id: 'R2',
  machine: 'Refiner 2',
  line: 'coarse',
  kind: 'coarse',
  shift_date: DAY,
  shift: 'Day',
  workers: 2,
  hours_run: 10,
  weight_kg: 800,
  ...over,
});

/** A charge on a vessel. One run is one charge. */
const autoclaveRun = (over = {}) => ({
  id: 'run-ac',
  machine_id: 'AC_A',
  machine: 'Autoclave A',
  line: 'special',
  kind: 'autoclave',
  shift_date: DAY,
  shift: 'Day',
  capacity: 2500,
  batch_no: '3100',
  ...over,
});

const seed = (ideals) => ({
  runs: [
    grinderRun(),
    coarseRun(),
    autoclaveRun(),
    autoclaveRun({ id: 'run-ac-2', shift: 'Night' }),
  ],
  ideal_values: ideals
    ? [{ id: 'current', data: ideals, updated_at: '2026-07-01T00:00:00Z', updated_by: 'Manager' }]
    : [],
  efficiency_notes: [],
  variance_reasons: [],
});

const shiftOf = async (api) => {
  const res = await api.call(`/reports/shift-efficiency?date=${DAY}&shift=Day`);
  assert.equal(res.status, 200);
  return (await res.json()).data;
};

const metric = (cards, cardKey, metricKey) =>
  cards.find((c) => c.key === cardKey)?.metrics.find((m) => m.key === metricKey);

test('the sheet keeps every declared benchmark and drops anything else', async () => {
  const api = await startApi({ tables: seed(null) });

  const saved = await api.call('/rates/ideal-values', {
    method: 'PUT',
    body: {
      data: {
        'prod.GRD_K': 1200,
        'kwhkg.GRD_K': 0.4,
        'prod.SPECIAL.Special': 900,
        // Not a benchmark this API declares. A stale field left by an older
        // screen must not become a target nothing compares against.
        nonsense: 42,
      },
    },
  });
  assert.equal(saved.status, 200);

  const { data } = (await saved.json()).data;
  assert.equal(data['prod.GRD_K'], 1200);
  assert.equal(data['kwhkg.GRD_K'], 0.4);
  assert.equal(data.nonsense, undefined);
  // Every declared key comes back, unset ones as null rather than absent, so the
  // form renders before anyone has ever saved.
  assert.equal(data['pmh.GRD_S'], null);
  assert.ok('runs.AC_M' in data);

  assert.equal(api.tables.ideal_values.length, 1);
  assert.equal(api.tables.ideal_values[0].id, 'current');
  assert.equal(api.tables.ideal_values[0].data.nonsense, undefined);
});

test('a shortfall is flagged, and beating the target is not', async () => {
  const api = await startApi({
    tables: seed({
      'prod.GRD_K': 1200, // made 1000 - short
      'pmh.GRD_K': 40, // made 50 kg/man-hour - beaten
    }),
  });

  const shift = await shiftOf(api);
  const out = metric(shift.grinders, 'grind|GRD_K', 'out');
  const pmh = metric(shift.grinders, 'grind|GRD_K', 'pmh');

  assert.equal(out.value, 1000);
  assert.equal(out.ideal, 1200);
  assert.equal(out.variance, -200);
  assert.equal(out.variancePct, -16.7);
  assert.equal(out.offTarget, true);
  // The key a reason travels under, so the record stays attached to the figure
  // rather than to a card on a screen that may be laid out differently later.
  assert.equal(out.parameter, 'prod.GRD_K');

  assert.equal(pmh.value, 50);
  assert.equal(pmh.variance, 10);
  assert.equal(pmh.offTarget, false, 'beating a production target is not a shortfall');
});

test('energy is compared the other way up - more kWh per kg is worse', async () => {
  const api = await startApi({ tables: seed({ 'kwhkg.GRD_K': 0.4 }) });

  const kwh = metric((await shiftOf(api)).grinders, 'grind|GRD_K', 'kwhkg');
  assert.equal(kwh.value, 0.5, '500 kWh over 1000 kg');
  assert.equal(kwh.ideal, 0.4);
  assert.equal(kwh.variance, 0.1);
  assert.equal(kwh.offTarget, true, 'over the energy target is a miss, not a win');

  const under = await startApi({ tables: seed({ 'kwhkg.GRD_K': 0.6 }) });
  const better = metric((await shiftOf(under)).grinders, 'grind|GRD_K', 'kwhkg');
  assert.equal(better.offTarget, false, 'under the energy target is a win');
});

test('an unset benchmark compares to nothing rather than to nought', async () => {
  const api = await startApi({ tables: seed(null) });
  const shift = await shiftOf(api);

  assert.equal(shift.idealsSet, false, 'the screen has to tell "no target yet" from "on target"');
  const flagged = [...shift.grinders, ...shift.coarse, ...shift.autoclaves]
    .flatMap((c) => c.metrics)
    .filter((m) => m.offTarget);
  assert.deepEqual(flagged, [], 'an empty sheet flags nothing');

  const out = metric(shift.grinders, 'grind|GRD_K', 'out');
  assert.equal(out.ideal, null);
  assert.equal(out.variance, null);
});

test('the coarse line gets a card of its own, and the autoclaves are counted per day', async () => {
  const api = await startApi({
    tables: seed({ 'prod.COARSE': 800, 'runs.AC_A': 3 }),
  });

  const shift = await shiftOf(api);

  const coarse = metric(shift.coarse, 'coarse|line', 'out');
  assert.equal(coarse.value, 800);
  assert.equal(coarse.offTarget, false, 'exactly on target is on target');

  // Two charges on the day, one in each shift. Counted across the day because a
  // charge is cooked across the handover - a per-shift count would report the
  // same day's work differently depending on when the crew changed over.
  const charges = metric(shift.autoclaves, 'autoclave|AC_A', 'runs');
  assert.equal(charges.value, 2);
  assert.equal(charges.ideal, 3);
  assert.equal(charges.offTarget, true);

  // The vessel that took none still gets a card, or a day it sat idle would read
  // as a day nobody set a target for.
  const idle = metric(shift.autoclaves, 'autoclave|AC_M', 'runs');
  assert.equal(idle.value, 0);
});

test('a reason keeps the two numbers it was written about', async () => {
  const api = await startApi({ tables: seed({ 'prod.GRD_K': 1200 }) });

  const posted = await api.call('/reports/variance-reasons', {
    method: 'POST',
    body: {
      date: DAY,
      shift: 'Day',
      parameter: 'prod.GRD_K',
      label: 'Grinder 1 · Output',
      ideal: 1200,
      actual: 1000,
      reason: 'Feedstock ran out at 14:00',
    },
  });
  assert.equal(posted.status, 201);

  const row = api.tables.variance_reasons[0];
  assert.equal(row.parameter, 'prod.GRD_K');
  assert.equal(row.ideal, 1200);
  assert.equal(row.actual, 1000);
  assert.equal(row.entered_by, 'manager', 'signed with the account, not with the body');

  // And it comes back with the shift it was written against.
  const shift = await shiftOf(api);
  assert.equal(shift.varianceReasons.length, 1);
  assert.equal(shift.varianceReasons[0].reason, 'Feedstock ran out at 14:00');
});

test('the benchmarks are the back office’s, to read and to move', async () => {
  const api = await startApi({ tables: seed({ 'prod.GRD_K': 1200 }) });

  for (const role of ['worker', 'supervisor', 'lab']) {
    const read = await api.call('/rates/ideal-values', { role });
    assert.equal(read.status, 403, `${role} may not read the targets`);

    const write = await api.call('/rates/ideal-values', {
      role,
      method: 'PUT',
      body: { data: { 'prod.GRD_K': 1 } },
    });
    assert.equal(write.status, 403, `${role} may not move the targets`);

    const reason = await api.call('/reports/variance-reasons', {
      role,
      method: 'POST',
      body: { date: DAY, parameter: 'prod.GRD_K', reason: 'anything' },
    });
    assert.equal(reason.status, 403, `${role} may not answer for them`);
  }

  assert.equal(api.tables.ideal_values[0].data['prod.GRD_K'], 1200, 'nothing moved');
});
