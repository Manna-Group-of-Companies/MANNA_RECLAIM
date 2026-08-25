import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The same figures the shift view holds against a benchmark, followed across a
 * window instead of read one shift at a time.
 *
 * A single shift against a target says hit or miss and nothing about whether
 * the line has been drifting for a fortnight - and the plant pays an incentive
 * on these figures, so one bad shift is an argument and ten in a row is a fact.
 *
 * Three ways to answer that question wrongly:
 *
 *   1. Calling the biggest number the best. The best kWh per kg is the smallest
 *      one; a screen that ranked it the other way would congratulate the line on
 *      the shift it wasted the most electricity.
 *
 *   2. Averaging in the shifts that recorded nothing. A missing figure is not a
 *      zero, and a nought dragged into a mean is a line reported as half as good
 *      as it ran.
 *
 *   3. Offering subjects the window does not hold. A picker listing the whole
 *      plant and answering half of it with a blank page reads as a broken screen
 *      rather than as a line that did not run that week.
 */

/** 1000 kg on 10 labour-hours = 100 kg/man-hour; 500 kWh = 0.5 kWh/kg. */
const grind = (day, over = {}) => ({
  id: `r-${day}`,
  machine_id: 'GRD_K',
  machine: 'Grinder 1',
  line: 'grind',
  kind: 'grind',
  shift_date: day,
  shift: 'Day',
  workers: 2,
  hours_run: 5,
  kwh: 500,
  weight_kg: 1000,
  ...over,
});

const IDEALS = {
  id: 'current',
  data: { 'pmh.GRD_K': 90, 'kwhkg.GRD_K': 0.4, 'prod.GRD_K': 1200 },
};

const trend = async (api, query, role = 'md') => {
  const res = await api.call(`/reports/efficiency-trend?${query}`, { role });
  assert.equal(res.status, 200, `${query} was refused`);
  return (await res.json()).data;
};

test('a subject is followed shift by shift across the window', async (t) => {
  const api = await startApi({
    tables: {
      runs: [grind('2026-08-01'), grind('2026-08-02'), grind('2026-08-09')],
      ideal_values: [IDEALS],
    },
  });
  t.after(() => api.stop());

  const t1 = await trend(api, 'from=2026-08-01&to=2026-08-02&subject=machine:GRD_K');
  assert.equal(t1.points.length, 2, 'the ninth is outside the window');
  assert.deepEqual(
    t1.points.map((p) => p.date),
    ['2026-08-01', '2026-08-02'],
    'oldest first - a series is read forwards',
  );
  assert.equal(t1.subject.label, 'Grinder 1');
});

test('best and worst follow which way is good, not which number is bigger', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        grind('2026-08-01'),                       // 100 kg/man-h, 0.500 kWh/kg
        grind('2026-08-02', { kwh: 200 }),         // 100 kg/man-h, 0.200 kWh/kg
        grind('2026-08-03', { weight_kg: 600, kwh: 300 }), // 60 kg/man-h, 0.500
      ],
      ideal_values: [IDEALS],
    },
  });
  t.after(() => api.stop());

  const { summary } = await trend(api, 'from=2026-08-01&to=2026-08-03&subject=machine:GRD_K');

  const pmh = summary.find((m) => m.key === 'pmh.GRD_K');
  assert.equal(pmh.best.value, 100, 'more kg per man-hour is better');
  assert.equal(pmh.worst.value, 60);
  assert.equal(pmh.average, 86.67);
  assert.equal(pmh.onTarget, 2, '90 is the target, so the 60 is the only miss');
  assert.equal(pmh.offTarget, 1);

  const energy = summary.find((m) => m.key === 'kwhkg.GRD_K');
  assert.equal(energy.best.value, 0.2, 'fewer kWh per kg is better');
  assert.equal(energy.worst.value, 0.5);
  assert.equal(energy.lowerIsBetter, true);
  // And the best names the shift it was, so somebody can go and ask about it.
  assert.equal(energy.best.date, '2026-08-02');
});

test('a shift that recorded nothing is left out rather than counted as nought', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        grind('2026-08-01'),
        // No meter reading on the second: the electricity figure does not exist
        // for that shift. Counted as zero it would halve the window's average
        // and report the line as twice as efficient as it ran.
        grind('2026-08-02', { kwh: null }),
      ],
      ideal_values: [IDEALS],
    },
  });
  t.after(() => api.stop());

  const { summary, points } = await trend(api, 'from=2026-08-01&to=2026-08-02&subject=machine:GRD_K');
  const energy = summary.find((m) => m.key === 'kwhkg.GRD_K');
  assert.equal(energy.count, 1, 'one shift measured it, not two');
  assert.equal(energy.average, 0.5);
  // The shift is still a point - it ran and it made its output. Only the figure
  // it did not record is absent.
  assert.equal(points.length, 2);
  assert.ok(!points[1].metrics.some((m) => m.key === 'kwhkg.GRD_K'));
});

test('the picker offers only what the window holds', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        grind('2026-08-01'),
        grind('2026-08-01', { id: 'r-s2', machine_id: 'GRD_S', machine: 'Grinder 2' }),
        // Outside the window, so Grinder 3 is not a subject worth offering.
        grind('2026-07-01', { id: 'r-old', machine_id: 'GRD_O', machine: 'Soorya Grinder' }),
      ],
      ideal_values: [IDEALS],
    },
  });
  t.after(() => api.stop());

  const { subjects } = await trend(api, 'from=2026-08-01&to=2026-08-31');
  assert.deepEqual(
    subjects.map((s) => s.key).sort(),
    ['machine:GRD_K', 'machine:GRD_S'],
  );
  assert.equal(subjects[0].points, 1);
});

test('asking for nothing in particular lists the subjects and no series', async (t) => {
  const api = await startApi({ tables: { runs: [grind('2026-08-01')], ideal_values: [IDEALS] } });
  t.after(() => api.stop());

  // The picker has to be filled before anything can be picked, so the subjects
  // come back on the same read rather than needing a call of their own.
  const answer = await trend(api, 'from=2026-08-01&to=2026-08-31');
  assert.equal(answer.subject, null);
  assert.deepEqual(answer.points, []);
  assert.ok(answer.subjects.length > 0);
});

test('the floor reads it too, because the floor is paid on it', async (t) => {
  const api = await startApi({ tables: { runs: [grind('2026-08-01')], ideal_values: [IDEALS] } });
  t.after(() => api.stop());

  for (const role of ['supervisor', 'manager', 'md']) {
    const res = await api.call('/reports/efficiency-trend?from=2026-08-01&to=2026-08-31', { role });
    assert.equal(res.status, 200, `${role} could not read the trend`);
  }
});

test('a figure with no benchmark is not reported as a perfect record', async (t) => {
  const api = await startApi({
    tables: {
      runs: [grind('2026-08-01'), grind('2026-08-02')],
      // Only the labour target is set. The electricity figure is measured on
      // both shifts and held to nothing.
      ideal_values: [{ id: 'current', data: { 'pmh.GRD_K': 90 } }],
    },
  });
  t.after(() => api.stop());

  const { summary } = await trend(api, 'from=2026-08-01&to=2026-08-02&subject=machine:GRD_K');
  const energy = summary.find((m) => m.key === 'kwhkg.GRD_K');

  /*
   * Counted the obvious way this comes back 2 of 2 on target, because a figure
   * with no target is off it on no point. On a screen an incentive is argued
   * from, "perfect record" is the worst thing it could say about a line nobody
   * has set a benchmark for.
   */
  assert.equal(energy.ideal, null);
  assert.equal(energy.onTarget, null);
  assert.equal(energy.offTarget, null);
  // It is still measured, and the average is still worth reading - what is
  // missing is the verdict, not the figure.
  assert.equal(energy.count, 2);
  assert.equal(energy.average, 0.5);

  const pmh = summary.find((m) => m.key === 'pmh.GRD_K');
  assert.equal(pmh.onTarget, 2, 'the one with a target still counts');
});
