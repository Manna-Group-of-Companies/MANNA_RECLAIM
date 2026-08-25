import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What the special line made, on whichever machine weighed it.
 *
 * This counted R4 alone, on the reasoning that the earlier passes are the same
 * material moving on and counting their weights too would double-count the
 * shift. The first half of that is right; the conclusion was not. A pass that is
 * only moving material on does not get weighed at all - most of the plant's runs
 * carry no weight - and a weighed pass is one that finished a grade.
 *
 * What it cost: Medium is finished on R2, which is a coarse-line machine. Those
 * runs are logged on the special line with a grade and a weight, so refinerUnits
 * skipped them for not being R4 and coarseUnits skipped them for not being
 * coarse. They were counted by no figure on the efficiency screen - which is why
 * the night of 24 August 2026 showed a Medium card reading 0 kg with both its
 * rates blank while History showed the 822 kg that shift had made.
 *
 * The thing that must not come back with the fix is the vessels. A charge cooks
 * for eight hours with one hand attending, and averaged into the line's labour
 * it makes kg per man-hour several times too lax - the same distortion the
 * coarse line already guards against.
 */

const DAY = '2026-08-01';

const run = (id, over = {}) => ({
  id,
  machine_id: 'R4',
  machine: 'Refiner 4',
  line: 'special',
  kind: 'refiner',
  shift_date: DAY,
  shift: 'Night',
  quality: 'Fine',
  workers: 2,
  hours_run: 5,
  kwh: 100,
  ...over,
});

const gradeCard = async (tables, quality) => {
  const api = await startApi({ tables });
  const res = await api.call(`/reports/shift-efficiency?date=${DAY}&shift=Night`, { role: 'md' });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  return { api, card: data.refiners.find((c) => c.quality === quality) ?? null, all: data };
};

test('a grade finished on a coarse machine is still the line’s output', async (t) => {
  const { api, card } = await gradeCard(
    {
      runs: [
        // The pass that worked it, weighing nothing - material moving on.
        run('r-1', { machine_id: 'R1', quality: 'Medium', weight_kg: null, hours_run: 2.5 }),
        // And the pass that finished it, on R2, which is a coarse-line machine.
        run('r-2', {
          machine_id: 'R2',
          kind: 'coarse',
          quality: 'Medium',
          weight_kg: 822,
          workers: 2,
          hours_run: 0.9,
        }),
      ],
      ideal_values: [{ id: 'current', data: { 'pmh.SPECIAL.Medium': 34.9 } }],
    },
    'Medium',
  );
  t.after(() => api.stop());

  assert.ok(card, 'the card is there');
  assert.equal(card.out, 822, 'and it says what the shift actually made');
  // 822 kg over (2 × 2.5) + (2 × 0.9) = 6.8 labour-hours.
  const pmh = card.metrics.find((m) => m.key === 'pmh');
  assert.equal(pmh.value, 120.9, '822 kg over (2 x 2.5) + (2 x 0.9) = 6.8 labour-hours');
  assert.equal(pmh.offTarget, false);
});

test('a vessel on the special line is not part of the line’s labour', async (t) => {
  const { api, card } = await gradeCard(
    {
      runs: [
        run('r-1', { weight_kg: 1000, workers: 2, hours_run: 5 }),
        // A charge logged on the special line - the plant does this, 138 times
        // over. Eight hours with one hand attending is not the same kind of
        // labour-hour as a crew working a refiner.
        run('r-2', {
          machine_id: 'AC_M',
          kind: 'autoclave',
          quality: 'Fine',
          weight_kg: null,
          workers: 1,
          hours_run: 8,
        }),
      ],
      ideal_values: [{ id: 'current', data: {} }],
    },
    'Fine',
  );
  t.after(() => api.stop());

  // 1000 kg over the refiner's own 10 labour-hours. With the vessel's eight
  // hours in as well it would read 55.6 and the line would look half as busy as
  // it was for the same work.
  assert.equal(card.metrics.find((m) => m.key === 'pmh').value, 100);
});

test('a batch yield counts everything that came off the charge', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        {
          id: 'ac-1',
          machine_id: 'AC_M',
          kind: 'autoclave',
          line: 'special',
          shift_date: DAY,
          shift: 'Day',
          batch_no: '3134',
          capacity: 4000,
        },
        run('r-1', { batch_no: '3134', weight_kg: 3000, quality: 'Fine' }),
        // The Medium off the same charge, finished on R2. Left out, the batch
        // reports a yield of 75% when it gave back 90.
        run('r-2', {
          machine_id: 'R2',
          kind: 'coarse',
          batch_no: '3134',
          quality: 'Medium',
          weight_kg: 600,
        }),
      ],
      ideal_values: [{ id: 'current', data: { 'yield.BATCH': 80 } }],
    },
  });
  t.after(() => api.stop());

  const res = await api.call(`/reports/shift-efficiency?date=${DAY}&shift=Night`, { role: 'md' });
  const { data } = await res.json();
  const yieldCard = data.yields.find((c) => c.batch === '3134');
  assert.ok(yieldCard, 'the batch was weighed out on this shift');
  assert.equal(yieldCard.metrics[0].value, 90);
  assert.equal(yieldCard.metrics[0].offTarget, false);
});
