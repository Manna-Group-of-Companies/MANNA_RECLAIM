import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The stage times a batch carries, which the Batch pick at the refiners reads.
 *
 * A charge is broken down at a pre-refiner before a refiner has anything to
 * work through, so "has PR2 had this one, and when" is what the crew is
 * actually asking when they choose a batch off the list. It used to be
 * answerable only by walking to the machine or reading it back off History
 * afterwards, and the number on the tile said nothing at all.
 *
 * Held here because the answer is assembled rather than stored: batches live
 * inside the shared_state blob and the times come off the runs table, so
 * nothing else would notice the two drifting apart.
 */

const plantDoc = (batches) => [{ id: 'plant', version: 1, doc: { batches } }];

const run = (over = {}) => ({
  id: 'r1',
  machine_id: 'R1',
  machine: 'Refiner 1',
  shift_date: '2026-08-01',
  shift: 'Day',
  batch_no: '3084',
  ...over,
});

test('a batch says when each machine first went on it', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        run({ id: 'r1', machine_id: 'PR2', started_at: '2026-08-01T09:12:00.000Z' }),
        // R1 twice: the batch went back through it for a second grade. The
        // first pass is when R1 opened the batch, so the later one must not
        // overwrite it.
        run({ id: 'r2', machine_id: 'R1', started_at: '2026-08-01T11:40:00.000Z' }),
        run({ id: 'r3', machine_id: 'R1', started_at: '2026-08-01T15:05:00.000Z' }),
        // No start stamp at all. Skipped rather than counted as midnight, which
        // would read on the tile as a machine that had it before any other.
        run({ id: 'r4', machine_id: 'R4', started_at: null }),
      ],
      shared_state: plantDoc([
        { id: 'b1', no: '3084', autoclaveDone: true, formulation: 'Special 2200' },
      ]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/batches/open', { role: 'supervisor' });
  assert.equal(res.status, 200);
  const [batch] = (await res.json()).data;

  assert.equal(batch.opened_on.PR2, '2026-08-01T09:12:00.000Z');
  assert.equal(batch.opened_on.R1, '2026-08-01T11:40:00.000Z', 'the first pass, not the last');
  assert.ok(!('R4' in batch.opened_on), 'a run with no start stamp is left out');
});

test('a machine that has not had the batch is simply absent', async (t) => {
  const api = await startApi({
    tables: {
      runs: [run({ machine_id: 'PR2', started_at: '2026-08-01T09:12:00.000Z' })],
      shared_state: plantDoc([{ id: 'b1', no: '3084', autoclaveDone: true }]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/batches/open', { role: 'supervisor' });
  const [batch] = (await res.json()).data;

  // The pick shows a dash for this, which is how it says the batch has not been
  // through that stage yet - so the absence has to be an absence, not a blank
  // string the screen would print as a time.
  assert.equal(batch.opened_on.R1, undefined);
});
