import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What the plant should have made, beside what it did.
 *
 * The Efficiency tab used to measure the plant against its own median as well.
 * That answers "is this shift worse than usual" and it cannot answer "is usual
 * any good" - a line that has run under its capacity for two years has a median
 * that says so, and a screen that never once flags it. Worse for a screen whose
 * job is to ask a supervisor why a shift came in short, the median moved: a bad
 * month lowered the bar the next month was judged by. The manager's ideals are
 * now the only thing anything is compared with, and there are four ways to get
 * that wrong:
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
 *   4. Letting the plant's own history back in. A figure that matches what the
 *      plant has always managed and misses what it was told to manage is a miss,
 *      and the run history must not soften it.
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

/** R4 is the only refiner that weighs, so it is what settles a batch's yield. */
const refinerRun = (over = {}) => ({
  id: 'run-r4',
  machine_id: 'R4',
  machine: 'Refiner 4',
  line: 'special',
  kind: 'refiner',
  shift_date: DAY,
  shift: 'Day',
  quality: 'Special',
  batch_no: '3100',
  workers: 2,
  hours_run: 10,
  kwh: 400,
  weight_kg: 1500,
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

/** Every metric on the screen, whatever card it sits on. */
const allMetrics = (shift) =>
  [
    ...shift.refiners,
    ...shift.grinders,
    ...shift.coarse,
    ...shift.autoclaves,
    ...shift.days,
    ...shift.yields,
  ].flatMap((c) => c.metrics.map((m) => ({ card: c.key, ...m })));

test('the sheet keeps every declared benchmark and drops anything else', async () => {
  const api = await startApi({ tables: seed(null) });

  const saved = await api.call('/rates/ideal-values', {
    method: 'PUT',
    body: {
      data: {
        'prod.GRD_K': 1200,
        'kwhkg.GRD_K': 0.4,
        'pmh.SPECIAL.Special': 13,
        // Not a benchmark this API declares. A stale field left by an older
        // screen must not become a target nothing compares against.
        nonsense: 42,
        // Retired: the special line's grade split is a market decision, so a
        // kg/shift target per grade would flag the plant for making what it was
        // asked to make. A sheet saved before it was dropped must not bring it
        // back - same rule as `nonsense`, different reason.
        'prod.SPECIAL.Special': 900,
      },
    },
  });
  assert.equal(saved.status, 200);

  const { data } = (await saved.json()).data;
  assert.equal(data['prod.GRD_K'], 1200);
  assert.equal(data['kwhkg.GRD_K'], 0.4);
  assert.equal(data['pmh.SPECIAL.Special'], 13);
  assert.equal(data.nonsense, undefined);
  assert.equal(data['prod.SPECIAL.Special'], undefined, 'the retired benchmark stays retired');
  // Every declared key comes back, unset ones as null rather than absent, so the
  // form renders before anyone has ever saved.
  assert.equal(data['pmh.GRD_S'], null);
  assert.ok('runs.AC_M' in data);

  assert.equal(api.tables.ideal_values.length, 1);
  assert.equal(api.tables.ideal_values[0].id, 'current');
  assert.equal(api.tables.ideal_values[0].data.nonsense, undefined);
});

test('production is compared per shift, which is how it is set', async () => {
  const api = await startApi({
    tables: seed({
      'prod.GRD_K': 1200, // made 1000 in the shift - short
    }),
  });

  const shift = await shiftOf(api);
  const out = metric(shift.grinders, 'grind|GRD_K', 'out');

  assert.equal(out.value, 1000);
  assert.equal(out.ideal, 1200);
  assert.equal(out.variance, -200);
  assert.equal(out.variancePct, -16.7);
  assert.equal(out.offTarget, true);
  // The key a reason travels under, so the record stays attached to the figure
  // rather than to a card on a screen that may be laid out differently later.
  assert.equal(out.parameter, 'prod.GRD_K');

  // And the two day-level benchmarks are not also compared here, or the same
  // target would be answered for twice under one key - once for each shift.
  const pmh = metric(shift.grinders, 'grind|GRD_K', 'pmh');
  assert.equal(pmh.ideal, null, 'labour productivity is judged over the day');
  assert.equal(pmh.parameter, null, 'and it is not a figure a reason is filed against here');
});

test('energy and labour productivity are compared over the whole day', async () => {
  // Two shifts on the one grinder: 1000 kg on 20 labour-hours at 500 kWh, then
  // 500 kg on 20 at 700 kWh. The day is 1500 kg, 40 labour-hours, 1200 kWh -
  // 0.8 kWh/kg and 37.5 kg/man-hour, neither of which is either shift's figure.
  const api = await startApi({
    tables: {
      ...seed({ 'kwhkg.GRD_K': 0.6, 'pmh.GRD_K': 40 }),
      runs: [
        grinderRun(),
        grinderRun({ id: 'run-grd-n', shift: 'Night', weight_kg: 500, kwh: 700 }),
      ],
    },
  });

  const day = (await shiftOf(api)).days;
  const kwh = metric(day, 'day|GRD_K', 'kwhkg');
  const pmh = metric(day, 'day|GRD_K', 'pmh');

  assert.equal(kwh.value, 0.8, '1200 kWh over 1500 kg, both shifts');
  assert.equal(kwh.ideal, 0.6);
  assert.equal(kwh.offTarget, true, 'over the energy target is a miss, not a win');

  assert.equal(pmh.value, 37.5, '1500 kg over 40 labour-hours');
  assert.equal(pmh.offTarget, true);
  assert.equal(pmh.parameter, 'pmh.GRD_K');
});

test('a day’s labour-hours are worked out inside each shift, then added', async () => {
  // 2 hands over 12 h, then 3 over 4 h. That is 24 + 12 = 36 labour-hours.
  // Summing the crews and multiplying by the summed hours would say 5 × 16 = 80,
  // and report the day as less than half as productive as it was.
  const api = await startApi({
    tables: {
      ...seed(null),
      runs: [
        grinderRun({ workers: 2, hours_run: 12, weight_kg: 720 }),
        grinderRun({ id: 'run-grd-n', shift: 'Night', workers: 3, hours_run: 4, weight_kg: 360 }),
      ],
    },
  });

  const pmh = metric((await shiftOf(api)).days, 'day|GRD_K', 'pmh');
  assert.equal(pmh.value, 30, '1080 kg over 36 labour-hours');
});

test('energy under the target is a win, not a miss', async () => {
  const api = await startApi({ tables: seed({ 'kwhkg.GRD_K': 0.6 }) });

  const kwh = metric((await shiftOf(api)).days, 'day|GRD_K', 'kwhkg');
  assert.equal(kwh.value, 0.5, '500 kWh over 1000 kg');
  assert.equal(kwh.variance, -0.1);
  assert.equal(kwh.offTarget, false, 'under the energy target is a win');
});

test('an unset benchmark compares to nothing rather than to nought', async () => {
  const api = await startApi({ tables: seed(null) });
  const shift = await shiftOf(api);

  assert.equal(shift.idealsSet, false, 'the screen has to tell "no target yet" from "on target"');
  const flagged = [...shift.grinders, ...shift.coarse, ...shift.autoclaves, ...shift.days]
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

test('nothing on the screen is compared with the plant’s own history', async () => {
  const api = await startApi({
    tables: {
      ...seed({ 'prod.GRD_K': 1200, 'yield.BATCH': 70 }),
      runs: [grinderRun(), coarseRun(), autoclaveRun(), refinerRun()],
    },
  });

  const metrics = allMetrics(await shiftOf(api));
  assert.ok(metrics.length > 0, 'there is a screen to check');

  // The running average is gone from the wire, not merely hidden by the client.
  // A baseline still being computed and shipped is a baseline somebody will
  // eventually put back on the screen.
  for (const m of metrics) {
    assert.ok(!('baseline' in m), `${m.card}/${m.key} still carries a baseline`);
    assert.ok(!('baselineLabel' in m), `${m.card}/${m.key} still carries a baseline label`);
  }

  // Utilisation is the one flag that is not a manager's benchmark - twelve hours
  // is twelve hours whatever the plant has averaged - and it says so on the
  // card, so it cannot be read as a target off the Ideal values tab.
  for (const m of metrics.filter((x) => x.warn)) {
    assert.equal(m.key, 'util', `${m.card}/${m.key} raises a flag that is not an ideal`);
    assert.equal(m.warnLabel, 'high downtime');
  }
});

test('a shift that matches the plant’s history and misses the ideal is still a miss', async () => {
  // Twenty shifts at 1000 kg, so the median this screen used to judge by is
  // exactly 1000 - and today's 1000 kg would have passed without a murmur. The
  // manager asked for 1200.
  const history = Array.from({ length: 20 }, (_, i) =>
    grinderRun({ id: `run-hist-${i}`, shift_date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
  );

  const api = await startApi({
    tables: { ...seed({ 'prod.GRD_K': 1200 }), runs: [...history, grinderRun()] },
  });

  const out = metric((await shiftOf(api)).grinders, 'grind|GRD_K', 'out');
  assert.equal(out.value, 1000);
  assert.equal(out.offTarget, true, 'the plant’s own history does not soften the miss');
  assert.equal(out.variance, -200);
  assert.equal(out.warn, false, 'and there is no second, softer verdict beside it');
});

test('batch yield is judged against the manager’s figure', async () => {
  // 1500 kg off a 2500 kg charge is 60%. The old screen compared that with the
  // median yield of every batch on record, which on a plant that has always
  // yielded 60% is 60% - the one figure that says how much rubber is being
  // thrown away, permanently reporting itself as normal.
  const api = await startApi({
    tables: {
      ...seed({ 'yield.BATCH': 70 }),
      runs: [autoclaveRun(), refinerRun()],
    },
  });

  const y = metric((await shiftOf(api)).yields, 'yield|3100', 'yield');
  assert.equal(y.value, 60);
  assert.equal(y.ideal, 70);
  assert.equal(y.variance, -10);
  assert.equal(y.offTarget, true);
  assert.equal(y.parameter, 'yield.BATCH', 'a reason for it files under the benchmark’s own key');
});

test('energy and labour on a shift card carry no target, and say where theirs is', async () => {
  const api = await startApi({
    tables: {
      ...seed({ 'pmh.GRD_K': 40, 'kwhkg.GRD_K': 0.4 }),
      runs: [grinderRun()],
    },
  });

  const shift = await shiftOf(api);

  for (const key of ['pmh', 'kwhkg']) {
    const m = metric(shift.grinders, 'grind|GRD_K', key);
    // Null, not merely unset. "No target is set against this figure here" and "a
    // target belongs here and nobody filled it in" are different sentences, and
    // only the second should nag anyone.
    assert.equal(m.parameter, null, `${key} is not benchmarked per shift`);
    assert.equal(m.ideal, null);
    assert.equal(m.offTarget, false);
    assert.match(m.context, /whole-day card/, `${key} says where it is compared`);
  }

  // And the day card does carry them.
  assert.equal(metric(shift.days, 'day|GRD_K', 'pmh').parameter, 'pmh.GRD_K');
  assert.equal(metric(shift.days, 'day|GRD_K', 'kwhkg').parameter, 'kwhkg.GRD_K');
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

test('the month’s reasons read back together, and the window holds', async () => {
  const api = await startApi({ tables: seed({ 'prod.GRD_K': 1200 }) });

  const write = (date, reason) =>
    api.call('/reports/variance-reasons', {
      method: 'POST',
      body: { date, shift: 'Day', parameter: 'prod.GRD_K', ideal: 1200, actual: 1000, reason },
    });

  await write('2026-08-01', 'Feedstock ran out');
  await write('2026-08-30', 'Grinder 1 belt');
  await write('2026-09-02', 'Next month');

  const inAugust = await api.call('/reports/variance-reasons?from=2026-08-01&to=2026-08-31');
  assert.equal(inAugust.status, 200);
  const rows = (await inAugust.json()).data;

  assert.deepEqual(
    rows.map((r) => r.reason).sort(),
    ['Feedstock ran out', 'Grinder 1 belt'],
    'the window is the month asked for, not the whole record',
  );
});

test('a reason’s wording can be corrected; what it is about cannot move', async () => {
  const api = await startApi({ tables: seed({ 'prod.GRD_K': 1200 }) });

  const posted = await api.call('/reports/variance-reasons', {
    method: 'POST',
    body: {
      date: DAY,
      shift: 'Day',
      parameter: 'prod.GRD_K',
      ideal: 1200,
      actual: 1000,
      reason: 'Feedstok ran out',
    },
  });
  const { id } = (await posted.json()).data;

  const fixed = await api.call(`/reports/variance-reasons/${id}`, {
    method: 'PATCH',
    body: {
      reason: 'Feedstock ran out at 14:00',
      // Sent and ignored. Re-pointing a reason at another parameter, or at other
      // figures, would be a second record wearing this one's id.
      parameter: 'kwhkg.GRD_K',
      ideal: 5,
      actual: 5,
    },
  });
  assert.equal(fixed.status, 200);

  const row = api.tables.variance_reasons[0];
  assert.equal(row.reason, 'Feedstock ran out at 14:00');
  assert.equal(row.parameter, 'prod.GRD_K', 'the parameter did not move');
  assert.equal(row.ideal, 1200, 'the figures it was written about did not move');
  assert.equal(row.actual, 1000);
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

    const review = await api.call('/reports/variance-reasons', { role });
    assert.equal(review.status, 403, `${role} may not read the answers back`);
  }

  assert.equal(api.tables.ideal_values[0].data['prod.GRD_K'], 1200, 'nothing moved');
});
