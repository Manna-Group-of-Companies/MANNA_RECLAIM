import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The clock times an autoclave cycle turns on.
 *
 * A charge already recorded when it went in and when it came out, which is the
 * whole cook and says nothing about where the time went. Two more split it:
 * when the vessel reached 21 bar, and when the discharge door was opened.
 *
 * There is deliberately no third. A cycle runs: door closed on a fresh charge,
 * heat to 21 bar, cook, door opened to discharge, emptied and re-charged, door
 * closed again - and that last moment is where the next cycle begins. The plant
 * already records it as the discharge, so asking for it a second time under
 * another name would let one charge disagree with itself. Door opened to
 * discharge is the vessel standing open being emptied and re-charged, which is
 * dead time on a machine that only earns while it is shut and hot.
 *
 * Three ways to get it wrong:
 *
 *   1. Requiring them. They are being asked for from today, and a crew that did
 *      not note one down must still be able to close the charge - a sheet that
 *      refuses is a sheet that gets a made-up time typed into it.
 *
 *   2. Clearing one that was already recorded. A discharge that leaves the box
 *      blank is saying "I did not note it", not "it did not happen".
 *
 *   3. Storing a duration instead of the clock time. A duration is one
 *      subtraction away and cannot be checked afterwards; a figure the plant is
 *      measured on has to be something somebody can point at on a shift.
 */

const LOADED = '2026-08-20T02:00:00.000Z';

const charge = (over = {}) => ({
  id: 'run-ac',
  machine_id: 'AC_A',
  machine: 'Autoclave A',
  line: 'special',
  kind: 'autoclave',
  shift_date: '2026-08-20',
  shift: 'Day',
  capacity: 2500,
  batch_no: '3100',
  started_at: LOADED,
  ended_at: null,
  ...over,
});

const seed = (over = {}) => ({ runs: [charge(over)], batches: [], stock_groups: [] });

const stop = (api, body) => api.call('/runs/run-ac/stop', { role: 'supervisor', method: 'POST', body });

test('a discharge records the cycle times', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const res = await stop(api, {
    stoppedAt: '2026-08-20T11:40:00.000Z',
    firewoodKg: 400,
    pressureAt: '2026-08-20T04:30:00.000Z',
    doorOpenAt: '2026-08-20T11:00:00.000Z',
  });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  // Stored as the instants they were, not as the gaps between them: the gaps
  // are one subtraction away and these can be read back against the shift.
  assert.equal(new Date(row.pressure_at).toISOString(), '2026-08-20T04:30:00.000Z');
  assert.equal(new Date(row.door_open_at).toISOString(), '2026-08-20T11:00:00.000Z');
  // And the door closing is the discharge, recorded once - not a fourth field
  // holding the same instant under another name.
  assert.equal(new Date(row.ended_at).toISOString(), '2026-08-20T11:40:00.000Z');
  assert.equal('door_close_at' in row, false, 'there is no separate column for it');
});

test('and a charge can still be closed without them', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  // The crew did not note any of it. That must not stop the vessel being
  // emptied on the record, or the sheet teaches people to invent a time.
  const res = await stop(api, { stoppedAt: '2026-08-20T11:00:00.000Z', firewoodKg: 400 });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  assert.ok(row.ended_at, 'the charge is closed');
  assert.equal(row.pressure_at ?? null, null);
  assert.equal(row.door_open_at ?? null, null);
});

test('a blank does not wipe a time already recorded', async (t) => {
  const api = await startApi({
    tables: seed({ pressure_at: '2026-08-20T04:30:00.000Z' }),
  });
  t.after(() => api.stop());

  const res = await stop(api, {
    stoppedAt: '2026-08-20T11:00:00.000Z',
    doorOpenAt: '2026-08-20T11:00:00.000Z',
  });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  assert.equal(
    new Date(row.pressure_at).toISOString(),
    '2026-08-20T04:30:00.000Z',
    'the pressure time was left alone, not cleared by being absent from this payload',
  );
  assert.equal(new Date(row.door_open_at).toISOString(), '2026-08-20T11:00:00.000Z');
});

test('a time that is not a time is refused rather than stored', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const res = await stop(api, {
    stoppedAt: '2026-08-20T11:00:00.000Z',
    pressureAt: '4:30 pm',
  });
  assert.equal(res.status, 422, 'the sheet sends an instant, not whatever was typed');
  assert.equal(api.tables.runs[0].ended_at ?? null, null, 'and nothing else landed either');
});
