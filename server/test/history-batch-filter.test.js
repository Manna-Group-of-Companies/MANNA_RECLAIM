import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The batch picker on the History tab.
 *
 * It was built from the batch numbers the runs mention, which is very nearly
 * right and wrong in exactly the case somebody opens the picker for. A charge
 * opened this morning has no run against it yet; an orphan never will. Both
 * were missing from the list, so the number a supervisor went looking for was
 * the one number not offered - and for the orphan, "there is nothing under this
 * batch" is the whole question being asked.
 *
 * So the picker is the union: every number the runs carry, plus every batch the
 * plant has opened. Held here because the two lists live in different places -
 * runs in their table, batches inside the shared_state blob - and nothing else
 * would notice them drifting apart.
 */

const plantDoc = (batches) => [
  {
    id: 'plant',
    version: 1,
    doc: { batches },
  },
];

const run = (over = {}) => ({
  id: 'r1',
  machine_id: 'R4',
  machine: 'Refiner 4',
  shift_date: '2026-08-01',
  shift: 'Day',
  batch_no: '3050',
  ...over,
});

test('a batch with no run against it is still offered in the picker', async (t) => {
  const api = await startApi({
    tables: {
      runs: [run()],
      // 3081 was opened this morning and nothing has been logged on it; 3082 is
      // an orphan whose load was cancelled. Neither appears on any run.
      shared_state: plantDoc([
        { id: 'b1', no: '3050' },
        { id: 'b2', no: '3081' },
        { id: 'b3', no: '3082' },
      ]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/reports/filters', { role: 'supervisor' });
  assert.equal(res.status, 200);
  const { batches } = (await res.json()).data;

  assert.ok(batches.includes('3050'), 'the number the run carries is still there');
  assert.ok(batches.includes('3081'), 'so is the charge opened with nothing logged on it yet');
  assert.ok(batches.includes('3082'), 'and the orphan, which is the one worth looking up');
});

test('a batch is offered once, however the crew keyed it', async (t) => {
  const api = await startApi({
    tables: {
      // The run says B-104 and the batch record says b-104. One charge to
      // everyone on the floor, so one entry in the picker - see sameRef.
      runs: [run({ batch_no: 'B-104' })],
      shared_state: plantDoc([{ id: 'b1', no: 'b-104' }]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/reports/filters', { role: 'supervisor' });
  const { batches } = (await res.json()).data;

  const keyed = batches.filter((b) => b.toLowerCase() === 'b-104');
  assert.deepEqual(keyed, ['B-104'], 'one entry, and it is the one the runs are filed under');
});

test('the newest number is the first one offered, prefix or no prefix', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        run({ id: 'r1', batch_no: '3077' }),
        run({ id: 'r2', batch_no: 'H-3077' }),
        run({ id: 'r3', batch_no: '3079' }),
        run({ id: 'r4', batch_no: 'H-3080' }),
        run({ id: 'r5', batch_no: '2617' }),
        run({ id: 'r6', batch_no: 'scrap' }),
      ],
      shared_state: plantDoc([]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/reports/filters', { role: 'supervisor' });
  const { batches } = (await res.json()).data;

  /*
   * The count is what orders this, not the spelling. Reading it with parseFloat
   * made every prefixed number NaN, which put the whole set of them above the
   * lot: the plant's picker opened on sixteen H- numbers with the batch charged
   * that morning seventeenth, and a supervisor scrolling the first screenful
   * read that as the list not carrying their batch at all.
   */
  assert.deepEqual(
    batches,
    ['H-3080', '3079', '3077', 'H-3077', '2617', 'scrap'],
    'newest first, a prefixed number beside the bare one it matches, and the ' +
      'one with no number in it at the bottom rather than the top',
  );
});

test('the pickers still come up when the batch blob cannot be read', async (t) => {
  // No shared_state row at all. The days, shifts and machines are read off the
  // runs and are worth having on their own - losing the whole History tab over
  // a missing batch list would be the wrong trade.
  const api = await startApi({ tables: { runs: [run()] } });
  t.after(() => api.stop());

  const res = await api.call('/reports/filters', { role: 'supervisor' });
  assert.equal(res.status, 200, 'the tab opens rather than failing');
  const { batches, days, machines } = (await res.json()).data;
  assert.deepEqual(days, ['2026-08-01']);
  assert.equal(machines.length, 1);
  assert.ok(batches.includes('3050'), 'and the numbers the runs carry are still offered');
});
