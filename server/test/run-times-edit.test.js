import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Correcting when a run started and when it ended.
 *
 * The autoclaves are what this is for. Neither end of a charge is stamped the
 * way a refiner's start is - the load sheet takes a loading time, and a charge
 * pulled at 02:00 is discharged on the record when the crew get back to the
 * office - so both are typed, and a typed time is a mistyped time. Until now the
 * only screen that ever asked was the one that logged it, and that sheet is gone
 * the moment the vessel is empty.
 *
 * Three things a correction has to carry, and two it has to refuse:
 *
 *   - the run time. A vessel has no hour meter, so what a charge ran is the
 *     clock between its two ends, which is exactly how the discharge timed it.
 *     Moving an end without moving that leaves the charge reading the length it
 *     was first mis-logged as, and every hour the reports add up carries it.
 *   - a figure typed by hand still winning. The tablets stamped both ends of
 *     some old rows at the moment they flushed them, so the clock on those says
 *     nothing and the typed hours are the only record.
 *   - `loaded_at` and `unloaded_at`, the vessel's own pair, which the batch card
 *     reads before started_at/ended_at.
 *   - a run that ends before it starts.
 *   - and an end dated onto a run that is still going. Stopping a machine
 *     weighs the firewood, releases the batch and marks the card; writing a time
 *     here does none of it.
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
  loaded_at: LOADED,
  ended_at: '2026-08-20T11:40:00.000Z',
  unloaded_at: '2026-08-20T11:40:00.000Z',
  hours_run: 9.67,
  runtime_min: 580,
  firewood_kg: 400,
  ...over,
});

const boot = (over = {}) =>
  startApi({ tables: { runs: [charge(over)], batches: [], stock_groups: [] } });

const edit = (api, body) => api.call('/runs/run-ac', { role: 'supervisor', method: 'PATCH', body });

test('correcting the end time moves the run time with it', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  // The vessel was actually emptied at 11:20; 11:40 was the crew writing it up.
  const res = await edit(api, { endedAt: '2026-08-20T11:20:00.000Z' });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  assert.equal(new Date(row.ended_at).toISOString(), '2026-08-20T11:20:00.000Z');
  assert.equal(row.runtime_min, 560, 'nine hours twenty, off the clock');
  assert.equal(row.hours_run, 9.33);
  assert.equal(
    new Date(row.unloaded_at).toISOString(),
    '2026-08-20T11:20:00.000Z',
    "the vessel's own discharge follows, or the batch card keeps the wrong time",
  );
});

test('and correcting the start time moves it from the other end', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const res = await edit(api, { startedAt: '2026-08-20T03:00:00.000Z' });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  assert.equal(row.runtime_min, 520, 'eight hours forty');
  assert.equal(row.hours_run, 8.67);
  assert.equal(new Date(row.loaded_at).toISOString(), '2026-08-20T03:00:00.000Z');
});

test('a run time entered by hand still wins over the clock', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const res = await edit(api, { endedAt: '2026-08-20T11:20:00.000Z', hoursRun: 9 });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  assert.equal(row.hours_run, 9);
  assert.equal(row.runtime_min, 540);
});

test('and so does an hour meter, on a machine that has one', async (t) => {
  const api = await startApi({
    tables: {
      runs: [
        {
          ...charge(),
          id: 'run-r3',
          machine_id: 'R3',
          machine: 'Refiner 3',
          kind: 'refiner',
          hour_start: 1204.5,
          hour_end: 1214.2,
          hours_run: 9.7,
          runtime_min: 582,
        },
      ],
      batches: [],
      stock_groups: [],
    },
  });
  t.after(() => api.stop());

  // The meter is the authority on its own machine's hours, exactly as it is
  // when a reading is corrected. Moving the clock does not take that away.
  const res = await api.call('/runs/run-r3', {
    role: 'supervisor',
    method: 'PATCH',
    body: { endedAt: '2026-08-20T11:20:00.000Z' },
  });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  assert.equal(row.hours_run, 9.7, 'still the meter pair, not the clock');
  assert.equal(row.runtime_min, 582);
});

test('a pause taken during the charge stays out of the run time', async (t) => {
  const api = await boot({ paused_ms: 1_800_000 });
  t.after(() => api.stop());

  // Half an hour stood still. The clock says nine hours twenty; the vessel ran
  // eight fifty, which is what the discharge would have booked.
  const res = await edit(api, { endedAt: '2026-08-20T11:20:00.000Z' });
  assert.equal(res.status, 200);
  assert.equal(api.tables.runs[0].runtime_min, 530);
});

test('a run cannot be made to end before it started', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const res = await edit(api, { endedAt: '2026-08-20T01:00:00.000Z' });
  assert.equal(res.status, 400);

  const row = api.tables.runs[0];
  assert.equal(new Date(row.ended_at).toISOString(), '2026-08-20T11:40:00.000Z');
  assert.equal(row.runtime_min, 580, 'and the run time is untouched');
});

test('nor can a start be dragged past the end already on the row', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  // Checked against the run as it will read, not only against what this patch
  // happens to carry.
  const res = await edit(api, { startedAt: '2026-08-20T12:00:00.000Z' });
  assert.equal(res.status, 400);
  assert.equal(new Date(api.tables.runs[0].started_at).toISOString(), LOADED);
});

test('a charge still in the vessel is discharged, not dated', async (t) => {
  const api = await boot({ ended_at: null, unloaded_at: null, hours_run: null, runtime_min: null });
  t.after(() => api.stop());

  const res = await edit(api, { endedAt: '2026-08-20T11:40:00.000Z' });
  assert.equal(res.status, 409, 'that is the Machines tab, and it does more than write a time');
  assert.equal(api.tables.runs[0].ended_at ?? null, null);
});

test('a start can still be corrected while the charge is cooking', async (t) => {
  const api = await boot({ ended_at: null, unloaded_at: null, hours_run: null, runtime_min: null });
  t.after(() => api.stop());

  // The loading time was typed wrong and the vessel is still shut. Nothing about
  // that has to wait for the discharge.
  const res = await edit(api, { startedAt: '2026-08-20T01:30:00.000Z' });
  assert.equal(res.status, 200);

  const row = api.tables.runs[0];
  assert.equal(new Date(row.loaded_at).toISOString(), '2026-08-20T01:30:00.000Z');
  assert.equal(row.hours_run ?? null, null, 'an open charge has run no hours yet');
});
