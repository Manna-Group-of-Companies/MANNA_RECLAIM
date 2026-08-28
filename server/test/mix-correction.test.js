import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { runService } from '../src/services/run.service.js';

/**
 * The batches that went through together, said after the machine started.
 *
 * A refining pass often carries the tailings of other batches with the one it
 * is filed under, and the plant records that in four columns - src1 first, the
 * batch the run is keyed on. It could only ever be set at the moment of
 * starting, which is the wrong moment: the second batch goes in when it is
 * ready, ten minutes into a pass that is already running.
 *
 * What the crews did instead is on the record. Five runs in August carry both
 * numbers in `batch_no` with a comma between them - "3056,3058" - which every
 * report reads as a batch number and no report can match to either batch.
 *
 * So the mix is correctable, and the two rules here are both about src1, which
 * is not a free field: it is the batch the run is filed under.
 */

const R3 = {
  id: 'R3',
  name: 'Refiner 3',
  short: 'R3',
  kind: 'refiner',
  group_name: 'Refiners',
  needs_quality: true,
  enabled: true,
  sort_order: 1,
};

const boot = () => startApi({ tables: { machines: [{ ...R3 }], runs: [] } });

const start = () =>
  runService.start({
    machineId: 'R3',
    batchNo: '3125',
    quality: 'Fine',
    shiftDate: '2026-08-21',
    shift: 'Day',
  });

test('a running pass can be told a second batch went through it', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const run = await start();
  assert.deepEqual(run.sources, [], 'nothing mixed at the start');

  const after = await runService.edit(run.id, { sources: ['3125', '3123'] });

  assert.deepEqual(after.sources, ['3125', '3123']);
  const row = api.tables.runs.find((r) => r.id === run.id);
  assert.equal(row.src1, '3125', 'the batch it is filed under leads');
  assert.equal(row.src2, '3123');
});

test('a mix of one is no mix - that is what the batch number already says', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const run = await start();
  await runService.edit(run.id, { sources: ['3125', '3123'] });

  // Taking the second batch back off. A list of one would otherwise leave a run
  // reading as mixed with nothing.
  const after = await runService.edit(run.id, { sources: ['3125'] });
  assert.deepEqual(after.sources, []);

  const row = api.tables.runs.find((r) => r.id === run.id);
  assert.equal(row.src1, null);
  assert.equal(row.src2, null);
});

test('an emptied list takes the mix off', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const run = await start();
  await runService.edit(run.id, { sources: ['3125', '3123'] });
  const after = await runService.edit(run.id, { sources: [] });

  assert.deepEqual(after.sources, []);
});

test('correcting the batch number moves the mix with it', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const run = await start();
  await runService.edit(run.id, { sources: ['3125', '3123'] });

  // The run was filed against the wrong batch. Left alone, src1 would name the
  // batch it used to be on and every read of the mix would report it there.
  const after = await runService.edit(run.id, { batchNo: '3127' });

  assert.equal(after.batch_no, '3127');
  assert.deepEqual(after.sources, ['3127', '3123'], 'the lead follows the batch');
});

test('a run with no mix is left alone when its batch number is corrected', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const run = await start();
  const after = await runService.edit(run.id, { batchNo: '3127' });

  assert.deepEqual(after.sources, [], 'nothing invented for a run that never mixed');
});

test('the machine can be told at the stop, which is when the crew know', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  // Started on the one batch that was ready. The tailings of the last pass go
  // in ten minutes later, which is the ordinary way round and was unsayable.
  const run = await start();
  const stopped = await runService.stop(run.id, {
    outWeight: 900,
    sources: ['3125', '3123'],
  });

  assert.deepEqual(stopped.sources, ['3125', '3123']);
  assert.equal(stopped.ended_at != null, true, 'and it still stopped');
});

test('a stop sheet cannot re-file the run by way of its mix', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const run = await start();
  // src1 is the batch the run is filed under, not a free field: a list naming
  // some other batch first leaves the run where it was.
  const stopped = await runService.stop(run.id, { sources: ['3123', '3125'] });

  assert.equal(stopped.batch_no, '3125');
  assert.deepEqual(stopped.sources, ['3125', '3123'], 'the run leads its own mix');
});

test('a stop that says nothing about the mix leaves the one it was started with', async (t) => {
  const api = await boot();
  t.after(() => api.stop());

  const run = await start();
  await runService.edit(run.id, { sources: ['3125', '3123'] });
  const stopped = await runService.stop(run.id, { outWeight: 900 });

  assert.deepEqual(stopped.sources, ['3125', '3123']);
});
