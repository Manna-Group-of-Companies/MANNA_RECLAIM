import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { runService } from '../src/services/run.service.js';

/**
 * A machine has one run open, or none.
 *
 * This was not true, and what made it untrue was a check followed by an insert:
 * start() asked whether the machine had an open run and then wrote one, with a
 * round trip in between. Two Starts sent close enough together both passed the
 * check before either row landed. A tablet double-tapped through a slow reply
 * put seven open runs on the Cracker inside 0.26 seconds.
 *
 * The reason it is worth a test rather than a shrug is what it does to the
 * screen. The Machines page keys one card per machine, so six of those seven
 * were invisible: stopping the run on the card closed one row and the next open
 * one took its place, and the Cracker went on reading as Running however many
 * times the crew stopped it. A duplicate row nobody can see or reach is worse
 * than a duplicate row.
 *
 * The database now refuses the second row outright - migrations/0009 - and this
 * is the server's own half, which is what covers a project that migration has
 * not been run against yet.
 */

const CRACKER = {
  id: 'CRK',
  name: 'Cracker',
  short: 'CRK',
  kind: 'grind',
  group_name: 'Grinding line',
  enabled: true,
  sort_order: 1,
};

const bootWith = (tables = {}) =>
  startApi({ tables: { machines: [{ ...CRACKER }], runs: [], ...tables } });

const openRuns = (api, machineId = 'CRK') =>
  api.tables.runs.filter((r) => r.machine_id === machineId && !r.ended_at);

test('a machine with a run already open refuses the next start', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await runService.start({ machineId: 'CRK', shiftDate: '2026-08-03', shift: 'Day' });
  await assert.rejects(
    () => runService.start({ machineId: 'CRK', shiftDate: '2026-08-03', shift: 'Day' }),
    /already has a run in progress/,
  );

  assert.equal(openRuns(api).length, 1, 'and the machine is left with the one run');
});

test('starts fired together leave one run, not one each', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  // The double tap. Both calls read the table before either has written to it,
  // so both get past the guard at the top of start() - which is the whole point
  // of the check made again underneath.
  const settled = await Promise.allSettled(
    Array.from({ length: 7 }, () =>
      runService.start({ machineId: 'CRK', shiftDate: '2026-08-03', shift: 'Day' }),
    ),
  );

  const started = settled.filter((r) => r.status === 'fulfilled');
  const refused = settled.filter((r) => r.status === 'rejected');

  assert.equal(openRuns(api).length, 1, 'one row is left open on the machine');
  assert.equal(started.length, 1, 'and exactly one caller is told it started the run');
  assert.equal(refused.length, 6);
  for (const r of refused) {
    assert.match(r.reason.message, /already has a run in progress/);
    assert.equal(r.reason.statusCode, 409, 'a conflict, which the tablet already knows how to show');
  }
  // The survivor is the run the crew watched appear, not whichever request the
  // network happened to finish last.
  const [open] = openRuns(api);
  assert.equal(open.id, started[0]?.value.id, 'and it is the one its caller was told about');
});

test('another machine started at the same time is not touched', async (t) => {
  const api = await bootWith({
    machines: [{ ...CRACKER }, { ...CRACKER, id: 'GRD_K', name: 'Grinder 1', short: 'Grind 1' }],
  });
  t.after(() => api.stop());

  const both = await Promise.all([
    runService.start({ machineId: 'CRK', shiftDate: '2026-08-03', shift: 'Day' }),
    runService.start({ machineId: 'GRD_K', shiftDate: '2026-08-03', shift: 'Day' }),
  ]);

  assert.equal(both.length, 2);
  assert.equal(openRuns(api, 'CRK').length, 1);
  assert.equal(openRuns(api, 'GRD_K').length, 1, 'the rule is per machine, not per plant');
});

test('a machine whose runs are all finished can start again', async (t) => {
  const api = await bootWith({
    runs: [
      {
        id: 'run-yesterday',
        machine_id: 'CRK',
        machine: 'Cracker',
        kind: 'grind',
        line: 'grind',
        shift_date: '2026-08-02',
        shift: 'Day',
        started_at: '2026-08-02T04:00:00Z',
        ended_at: '2026-08-02T12:00:00Z',
      },
    ],
  });
  t.after(() => api.stop());

  const run = await runService.start({ machineId: 'CRK', shiftDate: '2026-08-03', shift: 'Day' });

  assert.ok(run.id);
  assert.equal(openRuns(api).length, 1, 'a closed run is not in the way of the next one');
});
