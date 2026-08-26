import test from 'node:test';
import assert from 'node:assert/strict';
import { batchUnits, recipeSummary } from '../src/services/efficiency.service.js';
import { startApi } from './helpers/app.js';

/**
 * The special line read by batch, so the plant can see what a way of working
 * costs.
 *
 * The grades come off a charge in sequence and which of them are taken is
 * decided by the week's orders - Special then Fine, or Fine alone, or Special
 * and SuperFine and Medium. Each is a different amount of refining done to the
 * same 2,200 kg, and until this there was nowhere to see what each one gives
 * back, because the cost lands in whichever shifts the batch happened to
 * straddle.
 *
 * Four things have to hold, and each of them is a way to publish a
 * recommendation that is worse than no recommendation at all:
 *
 *   The batch is counted whole. A window that cut one in half would set the
 *   passes inside it against output weighed outside it.
 *
 *   The order of the cuts is the order they were worked. It decides which
 *   recipe a batch is counted under, and getting it from row order rather than
 *   from the sheet split one real practice into two on 8 batches.
 *
 *   A defective record is not ranked. A pass with no crew on it counts as no
 *   labour, and the batch it belongs to tops the plant - which is not a batch
 *   anybody should be sent off to copy.
 *
 *   A product is compared with its own. DRC comes off in one pass at the charge
 *   weight and reads at 126 kg per man-hour; ranked against Special charges it
 *   would sit at the top of a table answering a question nobody asked.
 */

const pass = (over = {}) => ({
  id: `p-${Math.random().toString(36).slice(2, 9)}`,
  line: 'special',
  kind: 'refiner',
  machine_id: 'R4',
  machine: 'Refiner 4',
  batch_no: '3043',
  quality: 'Fine',
  shift_date: '2026-08-04',
  shift: 'Day',
  started_at: '2026-08-04T10:00:00.000Z',
  workers: 3,
  hours_run: 4.8,
  kwh: 68,
  weight_kg: 1991,
  ...over,
});

const charge = (over = {}) => ({
  id: `c-${Math.random().toString(36).slice(2, 9)}`,
  kind: 'autoclave',
  machine_id: 'AC_M',
  line: 'special',
  batch_no: '3043',
  formulation: 'Special 2200',
  capacity: 2200,
  shift_date: '2026-08-03',
  shift: 'Day',
  workers: 1,
  hours_run: 7.8,
  ...over,
});

const only = (rows) => {
  const units = batchUnits(rows);
  assert.equal(units.length, 1, 'one batch');
  return units[0];
};

test('a batch is counted whole, across every shift it took', async () => {
  const unit = only([
    charge(),
    pass({ shift: 'Day', quality: 'Fine', workers: 2, hours_run: 4.2, kwh: 68, weight_kg: null, machine_id: 'R3' }),
    pass({ shift: 'Day', quality: 'Fine', weight_kg: 1991 }),
    // Finished the next night, which is where a shift view loses it.
    pass({ shift_date: '2026-08-05', shift: 'Night', quality: 'Medium', hours_run: 1, kwh: 15, weight_kg: 255 }),
  ]);

  assert.equal(unit.out, 2246);
  // 2 x 4.2 + 3 x 4.8 + 3 x 1 = 25.8, over two days and two shifts.
  assert.equal(unit.labour, 25.8);
  assert.equal(unit.pmh, 87.05);
  assert.equal(unit.shifts, 2);
  assert.equal(unit.firstDay, '2026-08-04');
  assert.equal(unit.lastDay, '2026-08-05');
});

test('yield is what came out of what was charged', async () => {
  const unit = only([charge({ capacity: 2200 }), pass({ weight_kg: 1100 })]);
  assert.equal(unit.charged, 2200);
  assert.equal(unit.yieldPct, 50);
  assert.equal(unit.formulation, 'Special 2200');
  assert.equal(unit.family, 'Special');
});

test('with no charge on record there is no yield, and it says so', async () => {
  const unit = only([pass({ weight_kg: 1100 })]);
  assert.equal(unit.yieldPct, null);
  assert.equal(unit.limits.find((l) => l.key === 'no-charge').what, 'no autoclave charge on record');
  // The labour is still its own, so it is still worth ranking.
  assert.equal(unit.comparable, true);
  assert.ok(unit.pmh > 0);
});

test('the cuts are in the order the sheet was worked down, not row order', async () => {
  /*
   * Both passes are in one shift, so the shift cannot order them and the row
   * order is whatever the table hands over. `started_at` is when the record was
   * typed, which is the sheet's order even on a batch entered months late.
   */
  const unit = only([
    charge(),
    pass({ quality: 'Fine', started_at: '2026-08-04T10:05:00.000Z', weight_kg: 900 }),
    pass({ quality: 'Special', started_at: '2026-08-04T10:01:00.000Z', weight_kg: 1100 }),
  ]);

  assert.deepEqual(unit.recipe, ['Special', 'Fine']);
  assert.equal(unit.recipeKey, 'Special › Fine');
});

test('each cut carries what it gave and what it cost', async () => {
  const unit = only([
    charge(),
    pass({ quality: 'Special', started_at: '2026-08-04T10:01:00.000Z', hours_run: 6, kwh: 90, weight_kg: 1600 }),
    pass({ quality: 'Medium', started_at: '2026-08-04T10:05:00.000Z', hours_run: 3, kwh: 45, weight_kg: 400 }),
  ]);

  const [special, medium] = unit.cuts;
  assert.equal(special.quality, 'Special');
  assert.equal(special.out, 1600);
  assert.equal(special.share, 80);
  assert.equal(special.pmh, 88.89);
  // Medium took a third of the hours for a fifth of the weight, which is the
  // comparison the panel exists to make.
  assert.equal(medium.share, 20);
  assert.equal(medium.pmh, 44.44);
});

test('a pass with no crew is a fault, and the batch is not ranked on it', async () => {
  const unit = only([
    charge(),
    pass({ quality: 'Special', workers: null, hours_run: 7.8, weight_kg: 1010 }),
    pass({ quality: 'SuperFine', started_at: '2026-08-04T11:00:00.000Z', workers: 2, hours_run: 2.5, weight_kg: 564 }),
  ]);

  assert.equal(unit.comparable, false);
  const fault = unit.faults.find((f) => f.key === 'no-crew');
  assert.equal(fault.what, '1 pass with no crew recorded');
  // Still returned. A batch that vanished would read as a batch never worked.
  assert.equal(unit.out, 1574);
  // And it is kept out of the comparison rather than out of sight.
  assert.equal(recipeSummary([unit]).length, 0);
});

test('hours a shift cannot hold are a fault', async () => {
  // 88.2 hours inside a twelve-hour shift is a slipped decimal, and it put one
  // batch last on the plant at 11.2 kg per man-hour.
  const unit = only([charge(), pass({ hours_run: 88.2 })]);
  assert.equal(unit.comparable, false);
  assert.equal(unit.faults.find((f) => f.key === 'hours').what, '1 pass with hours a shift cannot hold');
});

test('the same meter span twice is one pass entered twice', async () => {
  /*
   * Two passes of one batch on one machine can weigh the same and run the same
   * hours - that is a plant working steadily. They cannot both start and finish
   * at the same reading on both meters, which only move forward.
   */
  const meters = { elec_start: 82402, elec_end: 82501, hour_start: 5738.9, hour_end: 5746 };
  const unit = only([
    charge(),
    pass({ quality: 'Special', ...meters, weight_kg: 1072, started_at: '2026-08-04T10:00:00.000Z' }),
    pass({ quality: 'Special', ...meters, weight_kg: 1072, started_at: '2026-08-04T16:00:00.000Z' }),
  ]);

  assert.equal(unit.comparable, false);
  assert.equal(unit.faults.find((f) => f.key === 'entered-twice').what, '1 pass entered twice');
  assert.equal(unit.parts.filter((p) => p.entered === 'twice').length, 1);
});

test('an honest repeat on different meters is not a duplicate', async () => {
  const unit = only([
    charge(),
    pass({ elec_start: 100, elec_end: 200, hour_start: 10, hour_end: 15, weight_kg: 900 }),
    pass({ elec_start: 200, elec_end: 300, hour_start: 15, hour_end: 20, weight_kg: 900 }),
  ]);
  assert.equal(unit.comparable, true);
  assert.equal(unit.out, 1800);
});

test('a batch worked with another keeps its labour and loses its yield', async () => {
  const unit = only([
    charge(),
    pass({ src1: '3043', src2: '3058', weight_kg: 2400 }),
  ]);

  // The output includes material that was not charged as this batch, so the
  // yield would read high and the other batch would read starved.
  assert.equal(unit.yieldPct, null);
  assert.deepEqual(unit.mixedWith, ['3058']);
  assert.equal(unit.limits.find((l) => l.key === 'mixed').what, 'worked together with 3058');
  // The hours are still its own, so the rate is still worth comparing.
  assert.equal(unit.comparable, true);
  assert.equal(unit.pmh, 166.67);
});

test('a product is only compared with its own', async () => {
  const batches = batchUnits([
    charge({ batch_no: 'S1' }),
    pass({ batch_no: 'S1', weight_kg: 2000, hours_run: 6 }),
    charge({ batch_no: 'S2' }),
    pass({ batch_no: 'S2', weight_kg: 2000, hours_run: 6 }),
    charge({ batch_no: 'D1', formulation: 'DRC 2200' }),
    pass({ batch_no: 'D1', quality: 'DRC', weight_kg: 2200, hours_run: 2 }),
  ]);

  const recipes = recipeSummary(batches);
  const drc = recipes.find((r) => r.family === 'DRC');
  const special = recipes.find((r) => r.family === 'Special');

  assert.equal(drc.batches, 1);
  assert.equal(special.batches, 2);
  // Same cut name would otherwise collapse two products into one row.
  assert.notEqual(drc.key, special.key);
  assert.equal(special.refs.length, 2);
});

test('a recipe reports how many batches its yield is an average of', async () => {
  const batches = batchUnits([
    charge({ batch_no: 'A' }),
    pass({ batch_no: 'A', weight_kg: 2200, hours_run: 6 }),
    // Mixed, so this one has no yield though it has a rate.
    charge({ batch_no: 'B' }),
    pass({ batch_no: 'B', weight_kg: 2200, hours_run: 6, src1: 'B', src2: 'C' }),
  ]);

  const [recipe] = recipeSummary(batches);
  assert.equal(recipe.batches, 2);
  assert.equal(recipe.yieldFrom, 1, 'both are rated, one is yielded');
  assert.equal(recipe.yieldPct, 100);
});

test('the managing director can open it, and it answers by batch', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        charge({ id: 'c-1', batch_no: '3043' }),
        pass({ id: 'p-1', batch_no: '3043', quality: 'Special', started_at: '2026-08-04T10:01:00.000Z', weight_kg: 1200 }),
        pass({ id: 'p-2', batch_no: '3043', quality: 'Fine', started_at: '2026-08-04T10:05:00.000Z', weight_kg: 900 }),
      ],
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/reports/batch-efficiency', { role: 'md' });
  assert.equal(res.status, 200, 'the MD may read it');
  const { data } = await res.json();

  assert.equal(data.batches.length, 1);
  assert.equal(data.batches[0].batch, '3043');
  assert.equal(data.batches[0].recipeKey, 'Special › Fine');
  assert.equal(data.summary.comparable, 1);
  assert.equal(data.recipes[0].family, 'Special');
});
