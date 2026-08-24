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

test('a blank saved back stays blank, and does not become a target of nought', async () => {
  /*
   * The sheet is read, edited and written whole: the form loads every declared
   * benchmark, unset ones as null, and PUTs the lot back. So a null in the
   * payload is the ordinary case, not an odd one - it is what "nobody has set
   * this yet" looks like on the wire every single time anybody saves.
   *
   * It was being stored as 0. The body schema is a union and a zod union takes
   * the first branch that accepts; coercion came first and Number(null) is 0, so
   * z.null() never got a turn. Every untouched figure on the sheet became a
   * target of nought the moment a manager pressed Save.
   *
   * Which is the one outcome this sheet exists to prevent. On a figure where
   * less is better, a target of nought flags every shift forever; on one where
   * more is better nothing can fall below it, so a benchmark nobody filled in
   * reads as one the plant meets every day.
   *
   * Asserted through the route rather than against the service, because the
   * service was always right - it skips null. The coercion happened in front of
   * it, and a service-level test cannot see that.
   */
  const api = await startApi({ tables: seed(null) });

  const saved = await api.call('/rates/ideal-values', {
    method: 'PUT',
    body: {
      data: {
        'prod.GRD_K': 1200,
        'pmh.GRD_K': null,        // never set
        'kwhkg.GRD_K': '',        // cleared by hand on the form
        'prod.GRD_S': '2000',     // a form sends numbers as text
      },
    },
  });
  assert.equal(saved.status, 200);

  const { data } = (await saved.json()).data;
  assert.equal(data['prod.GRD_K'], 1200);
  assert.equal(data['prod.GRD_S'], 2000, 'a numeric string is still coerced');
  assert.equal(data['pmh.GRD_K'], null, 'a null stays unset - it is not a target of nought');
  assert.equal(data['kwhkg.GRD_K'], null, 'and neither is a cleared field');

  // And nothing was written under those keys, rather than merely read back null.
  const stored = api.tables.ideal_values[0].data;
  assert.ok(!('pmh.GRD_K' in stored), 'the unset benchmark is absent from the row');
  assert.ok(!('kwhkg.GRD_K' in stored), 'and so is the cleared one');

  // The screen must then say "no ideal set" rather than compare against nought.
  const shift = await shiftOf(api);
  const pmh = metric(shift.grinders, 'grind|GRD_K', 'pmh');
  assert.equal(pmh.ideal, null);
  assert.equal(pmh.offTarget, false, 'an unset benchmark flags nothing');
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

  // Energy and labour sit on this same card and are compared on the same span
  // as the output: this shift. One card per machine, every row about the shift
  // in front of you.
  const pmh = metric(shift.grinders, 'grind|GRD_K', 'pmh');
  assert.equal(pmh.parameter, 'pmh.GRD_K', 'labour productivity is answered for here');
  assert.equal(pmh.span, 'shift');
  assert.equal(metric(shift.grinders, 'grind|GRD_K', 'out').span, 'shift');
});

test("energy and labour are the picked shift's own, not the day's", async () => {
  // Two shifts on the one grinder. The day shift made 1000 kg on 20
  // labour-hours at 500 kWh; the night made 500 kg on 20 at 700. The day view
  // must read the day shift and nothing else.
  const api = await startApi({
    tables: {
      ...seed({ 'kwhkg.GRD_K': 0.6, 'pmh.GRD_K': 40 }),
      runs: [
        grinderRun(),
        grinderRun({ id: 'run-grd-n', shift: 'Night', weight_kg: 500, kwh: 700 }),
      ],
    },
  });

  const cards = (await shiftOf(api)).grinders;
  const kwh = metric(cards, 'grind|GRD_K', 'kwhkg');
  const pmh = metric(cards, 'grind|GRD_K', 'pmh');

  assert.equal(kwh.value, 0.5, '500 kWh over 1000 kg - the day shift alone');
  assert.equal(kwh.ideal, 0.6);
  assert.equal(kwh.offTarget, false, 'under the energy target is a win');

  assert.equal(pmh.value, 50, '1000 kg over 20 labour-hours');
  assert.equal(pmh.parameter, 'pmh.GRD_K');
  // The day fold would have said 37.5 and 0.8 here, which is neither shift.
});

test('a shift that logged the weight but not the work reads high, on that shift', async () => {
  /*
   * 22 August 2026 is what this is written from. Fine weighed 810 kg off R4 on
   * the day shift with an R3 pass behind it, and 737 kg on the night with no R3
   * pass logged at all - so the night showed 737 kg against 6.9 labour-hours,
   * which is 107 kg per man-hour and cannot be true.
   *
   * Folded into a day figure that read 45.6 against a target of 21.7 and looked
   * like a triumph. The arithmetic was right and the input was not, and the
   * fold hid which shift the hole was on.
   *
   * Per shift, the impossible number lands on the shift that owns it. That is
   * not a fix for the missing entry - nothing here can invent it - but it puts
   * it where somebody will ask about it.
   */
  const api = await startApi({
    tables: {
      ...seed({ 'pmh.GRD_K': 40 }),
      runs: [
        grinderRun(),
        grinderRun({
          id: 'run-grd-n',
          shift: 'Night',
          weight_kg: 900,
          workers: 1,
          hours_run: 1,
        }),
      ],
    },
  });

  const day = metric((await shiftOf(api)).grinders, 'grind|GRD_K', 'pmh');
  assert.equal(day.value, 50, 'the day shift reads its own honest figure');

  const res = await api.call(`/reports/shift-efficiency?date=${DAY}&shift=Night`);
  const night = metric((await res.json()).data.grinders, 'grind|GRD_K', 'pmh');
  assert.equal(night.value, 900, 'and the night carries its own impossible one, where it can be asked about');
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

  const pmh = metric((await shiftOf(api)).grinders, 'grind|GRD_K', 'pmh');
  assert.equal(pmh.value, 30, '1080 kg over 36 labour-hours');
});

test('energy under the target is a win, not a miss', async () => {
  const api = await startApi({ tables: seed({ 'kwhkg.GRD_K': 0.6 }) });

  const kwh = metric((await shiftOf(api)).grinders, 'grind|GRD_K', 'kwhkg');
  assert.equal(kwh.value, 0.5, '500 kWh over 1000 kg');
  assert.equal(kwh.variance, -0.1);
  assert.equal(kwh.offTarget, false, 'under the energy target is a win');
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

test('a target with a half in it keeps its half', async () => {
  /*
   * A vessel takes whole charges, so the count is shown at nought decimals - and
   * the target is an average over a day, where 4.5 is an ordinary thing to ask
   * for. Rounded to the figure's precision, a 4.5 target rendered as 5 and a day
   * that took 3 charges was reported as two short. It is one and a half short.
   *
   * The percentage stayed correct the whole time, which is what made it quietly
   * wrong rather than obviously wrong: "-2 runs (-33.3%)" is arithmetic that does
   * not check out, and the reader has to guess which half to believe.
   */
  const api = await startApi({ tables: seed({ 'runs.AC_A': 4.5 }) });
  const shift = await shiftOf(api);

  // The seed charges AC_A once on each shift, so the day took 2.
  const charges = metric(shift.autoclaves, 'autoclave|AC_A', 'runs');
  assert.equal(charges.value, 2, 'a count of charges stays a whole number');
  assert.equal(charges.ideal, 4.5, 'the target is shown as it was set, not rounded to 5');
  assert.equal(charges.variance, -2.5, 'and the gap keeps the half');
  assert.equal(charges.variancePct, -55.6);

  // A whole-number target is still shown whole - the precision follows the
  // target, and does not simply add decimals to everything.
  const whole = await startApi({ tables: seed({ 'runs.AC_A': 3 }) });
  const w = metric((await shiftOf(whole)).autoclaves, 'autoclave|AC_A', 'runs');
  assert.equal(w.ideal, 3);
  assert.equal(w.variance, -1, 'no stray .0 on a target nobody wrote a decimal on');
});


test('the coarse line is judged on energy and labour, not tonnage alone', async () => {
  /*
   * It was benchmarked on output and nothing else - the one weighing line on the
   * plant that could come in short on nothing but tonnage. It carries crew,
   * hours and a meter on every run exactly as a grinder does, so it now answers
   * for the same two rates.
   *
   * The autoclave in the seed is the reason this test has one. A coarse-form
   * charge is logged with line 'coarse', correctly, and there are more
   * labour-hours in those charges across the record than in PR1 and R2 together
   * - counted as the line's own labour they put its productivity at a third of
   * what the line actually runs at, which would make any benchmark set from it
   * three times too lax on the crew.
   */
  const api = await startApi({
    tables: {
      ...seed({ 'pmh.COARSE': 40, 'kwhkg.COARSE': 0.5 }),
      runs: [
        // 800 kg on 2 hands over 10 h at 400 kWh: 40 kg/man-hour, 0.5 kWh/kg.
        coarseRun({ kwh: 400 }),
        // A coarse-form charge, 1 hand for 8 h. Not the line's labour.
        autoclaveRun({ id: 'run-ac-coarse', line: 'coarse', workers: 1, hours_run: 8 }),
      ],
    },
  });

  const shift = await shiftOf(api);

  const pmh = metric(shift.coarse, 'coarse|line', 'pmh');
  assert.equal(pmh.value, 40, '800 kg over 20 labour-hours - the vessel is not in it');
  assert.equal(pmh.ideal, 40);
  assert.equal(pmh.offTarget, false, 'exactly on target is on target');
  assert.equal(pmh.parameter, 'pmh.COARSE', 'and it can be answered for');
  assert.equal(pmh.lowerIsBetter, false, 'more kg per man-hour is better');

  const kwh = metric(shift.coarse, 'coarse|line', 'kwhkg');
  assert.equal(kwh.value, 0.5, '400 kWh over 800 kg');
  assert.equal(kwh.ideal, 0.5);
  assert.equal(kwh.lowerIsBetter, true, 'fewer kWh per kg is better');

  // And the benchmarks exist to be set, or the card would nag for a target the
  // Ideal values tab never offers.
  const sheet = (await (await api.call('/rates/ideal-values')).json()).data.data;
  assert.ok('pmh.COARSE' in sheet, 'the sheet offers the coarse labour benchmark');
  assert.ok('kwhkg.COARSE' in sheet, 'and the coarse energy benchmark');
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

test('energy and labour are compared on the machine’s own card, once', async () => {
  const api = await startApi({
    tables: {
      ...seed({ 'pmh.GRD_K': 40, 'kwhkg.GRD_K': 0.4 }),
      runs: [grinderRun()],
    },
  });

  const shift = await shiftOf(api);

  for (const key of ['pmh', 'kwhkg']) {
    const m = metric(shift.grinders, 'grind|GRD_K', key);
    assert.ok(m.parameter, `${key} carries the key a reason is filed under`);
    assert.ok(m.ideal != null, `${key} carries the ideal it is judged against`);
    // No sub-line repeating the shift's figure: the shift's figure is the
    // headline now, so a line under it saying the same number would be the card
    // telling you twice.
    assert.equal(m.context ?? null, null, `${key} does not repeat itself`);
  }

  // And there is no second card for the same machine anywhere in the response.
  assert.equal(shift.days, undefined, 'the whole-day cards are gone; the figures moved onto the card');
  const all = [...shift.refiners, ...shift.grinders, ...shift.coarse, ...shift.autoclaves];
  const keys = all.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, 'one card per machine or grade, not two');
});

test('a shift shows the grades that shift worked, and no others', async () => {
  /*
   * 20 August 2026 is what this is written from. Fine was worked on the day
   * shift and Special on the night, and the day shift's screen listed Special -
   * labelled "not worked this shift", but listed. Against a History tab that
   * says plainly it was a night batch, that reads as the two screens
   * contradicting each other, and a row on a shift's screen is taken to mean
   * that shift did it, whatever the label underneath says.
   *
   * The shift decides what is on the screen. The day still decides what the two
   * benchmarked figures are measured over, which is a different question and one
   * the card answers in its own corner.
   */
  const api = await startApi({
    tables: {
      ...seed({ 'pmh.SPECIAL.Fine': 20, 'pmh.SPECIAL.Special': 12, 'kwhkg.SPECIAL.Special': 0.2 }),
      runs: [
        refinerRun({ id: 'r-fine-day', quality: 'Fine', weight_kg: 800 }),
        refinerRun({ id: 'r-spec-night', quality: 'Special', shift: 'Night', weight_kg: 900 }),
      ],
    },
  });

  const view = async (shift) =>
    (await (await api.call(`/reports/shift-efficiency?date=${DAY}&shift=${shift}`)).json()).data;

  const day = await view('Day');
  assert.deepEqual(day.refiners.map((c) => c.quality), ['Fine'], 'the day shift worked Fine only');

  const night = await view('Night');
  assert.deepEqual(
    night.refiners.map((c) => c.quality),
    ['Special'],
    'the night shift worked Special only',
  );

  // Every card on a screen was worked by that shift, so every one of them has
  // that shift's own figures - no nulls standing in for a crew never there.
  for (const [shift, s] of [['Day', day], ['Night', night]]) {
    for (const card of s.refiners) {
      assert.ok(card.out > 0, `${card.quality} on the ${shift} view has its own output`);
      assert.ok(card.workers > 0, `${card.quality} on the ${shift} view has its own crew`);
      const pmh = card.metrics.find((m) => m.key === 'pmh');
      assert.ok(pmh.parameter, `${card.quality} can still be answered for`);
      assert.ok(card.dayNote, 'and still says what the day figures are folded out of');
    }
  }
});

test('no figure is shown on this screen without something to compare it to', async () => {
  const api = await startApi({
    tables: {
      ...seed({ 'prod.GRD_K': 1200, 'pmh.GRD_K': 40, 'kwhkg.GRD_K': 0.4, 'prod.COARSE': 700 }),
      runs: [grinderRun(), coarseRun(), autoclaveRun(), refinerRun()],
    },
  });

  const shift = await shiftOf(api);
  for (const m of allMetrics(shift)) {
    // Either a manager's benchmark, or the one fixed standard on the screen -
    // utilisation against the twelve hours of the shift, which names itself.
    const compared = m.parameter != null || m.warnLabel != null;
    assert.ok(compared, `${m.card} · ${m.label} is on the screen with nothing to judge it by`);
  }
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

    // Answering for a miss is the shift's now - the person who can say why a
    // belt was slipping was standing next to it. A worker is still out: a
    // shift is answered for by whoever signed it. So is the lab, which is not
    // on the floor.
    const reason = await api.call('/reports/variance-reasons', {
      role,
      method: 'POST',
      body: { date: DAY, parameter: 'prod.GRD_K', reason: 'anything' },
    });
    const mayAnswer = role === 'supervisor';
    assert.equal(
      reason.status === 403,
      !mayAnswer,
      `${role} answering for a target came back ${reason.status}`,
    );

    // And reading them back is wider still, because a supervisor has to see
    // whether what they wrote was accepted. The lab reads nothing here.
    const review = await api.call('/reports/variance-reasons', { role });
    const mayRead = role === 'supervisor' || role === 'worker';
    assert.equal(
      review.status === 403,
      !mayRead,
      `${role} reading the answers came back ${review.status}`,
    );
  }

  assert.equal(api.tables.ideal_values[0].data['prod.GRD_K'], 1200, 'nothing moved');
});
