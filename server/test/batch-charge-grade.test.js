import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The grade a batch goes by before anything has been marked on it.
 *
 * A batch's `qualities` are what somebody has ticked on the card, so they are
 * empty for the whole stretch between the vessel being charged and the first
 * refiner run coming off it - which is exactly the stretch the batch pick at
 * the refiners is read in. A charge put in as Special DRC therefore showed up
 * on that pick with no grade at all, while the machine card two screens away
 * was already drawing the grade off the same load run.
 *
 * So the load run is the fallback: the autoclave sheet asks for a quality, and
 * that answer stands until the refiners have marked one of their own.
 */

const plantDoc = (batches) => [{ id: 'plant', version: 1, doc: { batches } }];

const load = (over = {}) => ({
  id: 'r1',
  kind: 'autoclave',
  machine_id: 'AC_M',
  machine: 'Autoclave M',
  shift_date: '2026-08-13',
  shift: 'Night',
  batch_no: '3088',
  quality: 'Special DRC',
  started_at: '2026-08-13T21:00:00.000Z',
  ...over,
});

test('a batch with nothing marked on it yet goes by the grade it was charged for', async (t) => {
  const api = await startApi({
    tables: {
      runs: [load()],
      shared_state: plantDoc([
        // No `qualities`: nothing has come off it, which is the ordinary state
        // of a batch charged this shift.
        { id: 'b1', no: '3088', autoclaveDone: true, formulation: 'Special 2200' },
      ]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/batches/open', { role: 'supervisor' });
  assert.equal(res.status, 200);
  const [batch] = (await res.json()).data;

  assert.equal(batch.grade, 'Special DRC');
  assert.deepEqual(batch.qualities, [], 'and the refiners have still marked nothing');
});

test('a grade the refiners have marked outranks the one it was charged for', async (t) => {
  const api = await startApi({
    tables: {
      runs: [load()],
      shared_state: plantDoc([
        { id: 'b1', no: '3088', autoclaveDone: true, qualities: ['SuperFine'] },
      ]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/batches/open', { role: 'supervisor' });
  const [batch] = (await res.json()).data;

  // A batch yielding SuperFine is a SuperFine batch to anyone reading it,
  // whatever went into the vessel.
  assert.equal(batch.grade, 'SuperFine');
});

test('a Special DRC charge is tracked in two grades, not five', async (t) => {
  const api = await startApi({
    tables: {
      runs: [load()],
      shared_state: plantDoc([{ id: 'b1', no: '3088', autoclaveDone: true }]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/batches/open', { role: 'supervisor' });
  const [batch] = (await res.json()).data;

  assert.deepEqual(
    batch.grades.map((g) => g.quality),
    ['Special', 'Special DRC'],
    'the card offers what the charge can yield and nothing else',
  );

  // And the API is not wider than the card: a grade with no row cannot be
  // ticked, or it would have to be weighed before the batch would close and
  // could not be un-ticked once a refiner had run against it.
  const refused = await api.call(`/batches/${batch.id}/qualities`, {
    role: 'supervisor',
    method: 'POST',
    body: { quality: 'SuperFine', marked: true },
  });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /Special, Special DRC/);
});

test('an ordinary Special charge keeps the whole grid', async (t) => {
  const api = await startApi({
    tables: {
      runs: [load({ quality: 'Special' })],
      shared_state: plantDoc([{ id: 'b1', no: '3088', autoclaveDone: true }]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/batches/open', { role: 'supervisor' });
  const [batch] = (await res.json()).data;

  assert.deepEqual(batch.grades.map((g) => g.quality), [
    'Special',
    'SuperFine',
    'Fine',
    'Medium',
    'Special DRC',
  ]);
});

test('a batch whose load run named no quality still has no grade', async (t) => {
  const api = await startApi({
    tables: {
      runs: [load({ quality: null })],
      shared_state: plantDoc([{ id: 'b1', no: '3088', autoclaveDone: true }]),
    },
  });
  t.after(() => api.stop());

  const res = await api.call('/batches/open', { role: 'supervisor' });
  const [batch] = (await res.json()).data;

  // Null rather than a guess: the pick says "no grade marked yet" and that is
  // the honest answer for a charge nobody named a grade on.
  assert.equal(batch.grade, null);
});
