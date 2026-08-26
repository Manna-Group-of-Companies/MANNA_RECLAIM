import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Reading the record across days, and by a cut of the machine list.
 *
 * The History tab could answer "one day, one machine" and nothing else, so
 * comparing three autoclaves over a fortnight meant reading the page forty-two
 * times. Two things follow from widening it, and both are ways to be quietly
 * wrong rather than visibly broken:
 *
 *   A window that answers with nothing. `from`/`to` are two clauses on one
 *   column, which is a shape the query builder did not have; built wrong it
 *   comes back empty, and an empty History tab reads as a plant that did not
 *   run rather than as a filter that does not work.
 *
 *   A category that quietly covers the wrong machines. Somebody comparing the
 *   grinders and handed the cracker's figures as well gets an answer that is
 *   plausible, wrong, and impossible to spot from the total.
 */

const run = (id, over = {}) => ({
  id,
  machine_id: 'GRD_K',
  machine: 'Grinder 1',
  line: 'grind',
  kind: 'grind',
  shift_date: '2026-08-10',
  shift: 'Day',
  weight_kg: 100,
  ended_at: '2026-08-10T20:00:00.000Z',
  ...over,
});

const machine = (id, kind, name) => ({ id, name, kind, enabled: true, sort_order: 1 });

const PLANT = [
  machine('CRK', 'grind', 'Cracker'),
  machine('GRD_K', 'grind', 'Grinder 1'),
  machine('GRD_S', 'grind', 'Grinder 2'),
  machine('AC_A', 'autoclave', 'Autoclave A'),
  machine('AC_M', 'autoclave', 'Autoclave M'),
  machine('R4', 'refiner', 'Refiner 4'),
  machine('PR2', 'prerefiner', 'Pre-Refiner 2'),
];

const RUNS = [
  run('r-01', { shift_date: '2026-08-01' }),
  run('r-05', { shift_date: '2026-08-05', quality: 'Fine' }),
  run('r-10', { shift_date: '2026-08-10', quality: 'Medium' }),
  run('r-15', { shift_date: '2026-08-15', machine_id: 'CRK', machine: 'Cracker' }),
  run('r-20', { shift_date: '2026-08-20', machine_id: 'AC_A', machine: 'Autoclave A', kind: 'autoclave' }),
  run('r-21', { shift_date: '2026-08-21', machine_id: 'R4', machine: 'Refiner 4', kind: 'refiner', line: 'special', quality: 'Fine' }),
  run('r-22', { shift_date: '2026-08-22', machine_id: 'PR2', machine: 'Pre-Refiner 2', kind: 'prerefiner', line: 'special' }),
];

const ids = async (api, query) => {
  const res = await api.call(`/runs?${query}`, { role: 'md' });
  assert.equal(res.status, 200, `${query} was refused`);
  return (await res.json()).data.map((r) => r.id).sort();
};

test('a window covers its own ends and nothing outside them', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  assert.deepEqual(
    await ids(api, 'from=2026-08-05&to=2026-08-15'),
    ['r-05', 'r-10', 'r-15'],
    'both ends are inside the window',
  );
  // An open end means "since" and "until", which is what a manager reading back
  // from the first of the month is asking for.
  assert.deepEqual(await ids(api, 'from=2026-08-21'), ['r-21', 'r-22']);
  assert.deepEqual(await ids(api, 'to=2026-08-01'), ['r-01']);
});

test('one day still means one day', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  // The office corrects last night by the day, and that has to go on working
  // exactly as it did - the window is an addition, not a replacement.
  assert.deepEqual(await ids(api, 'date=2026-08-10'), ['r-10']);
});

test('the grinders are the machines that grind, not the line they sit on', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  /*
   * The cracker shares the grinders' kind and the plant's own grouping puts it
   * with them, but it grinds nothing - it breaks tyres for the yard and weighs
   * no output. Averaged in, it drags every figure the grinders are judged on.
   */
  assert.deepEqual(await ids(api, 'category=grinders'), ['r-01', 'r-05', 'r-10']);
  assert.deepEqual(await ids(api, 'category=cracker'), ['r-15']);
  assert.deepEqual(await ids(api, 'category=autoclaves'), ['r-20']);
  // The pre-refiners are refiners here: they are passes of the same line.
  assert.deepEqual(await ids(api, 'category=refiners'), ['r-21', 'r-22']);
});

test('a category and a window narrow together', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  assert.deepEqual(await ids(api, 'category=grinders&from=2026-08-05'), ['r-05', 'r-10']);
});

test('an explicit machine beats the category it belongs to', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  // Both were given. The narrower answer is the one that was meant - the other
  // reading would widen a request into one nobody made.
  assert.deepEqual(await ids(api, 'category=grinders&machineId=CRK'), ['r-15']);
});

test('a category nobody has heard of does not answer with silence', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  /*
   * A mistyped category resolves to no filter rather than to an empty set. The
   * alternative is a blank page that looks exactly like a plant that has not
   * run, which is the reading a person actually takes from it.
   */
  assert.equal((await ids(api, 'category=widgets')).length, RUNS.length);
});

test('the grade cuts across every machine that made it', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  // The question is "the Fine runs over these days" - the grade, not the line
  // it happened to be refined on.
  assert.deepEqual(await ids(api, 'quality=Fine'), ['r-05', 'r-21']);
  assert.deepEqual(await ids(api, 'quality=Fine&from=2026-08-20'), ['r-21']);
});

test('the pickers offer the categories the record actually holds', async (t) => {
  const api = await startApi({ tables: { runs: RUNS, machines: PLANT } });
  t.after(() => api.stop());

  const res = await api.call('/reports/filters', { role: 'md' });
  assert.equal(res.status, 200);
  const { categories, machines } = (await res.json()).data;

  const offered = categories.map((c) => c.key);
  assert.deepEqual(offered.sort(), ['autoclaves', 'cracker', 'grinders', 'refiners']);
  // Grinder 2 is on the plant and has never run, so offering it would be
  // offering a filter that answers with nothing.
  const grinders = categories.find((c) => c.key === 'grinders');
  assert.deepEqual(grinders.machineIds, ['GRD_K']);
  // And each machine says which cut it falls under, so the picker can group.
  assert.equal(machines.find((m) => m.id === 'CRK').category, 'cracker');
  assert.equal(machines.find((m) => m.id === 'PR2').category, 'refiners');
});

test('a batch search finds the runs that name it beside another', async (t) => {
  const api = await startApi({
    tables: {
      machines: PLANT,
      runs: [
        run('b-1', { batch_no: '3134' }),
        // A pass that worked two batches - the plant writes both on the run.
        run('b-2', { batch_no: '3134,3140' }),
        run('b-3', { batch_no: '3140,3134' }),
        run('b-4', { batch_no: '3140' }),
        // The ones a contains-match would wrongly drag in.
        run('b-5', { batch_no: '13134' }),
        run('b-6', { batch_no: '31340' }),
      ],
    },
  });
  t.after(() => api.stop());

  /*
   * Being shown some of a batch's runs is worse than being shown none: the
   * answer looks complete. So the two passes that name 3134 alongside 3140
   * count, and 13134 does not - a batch search that returns another batch's
   * runs is the one failure this must not have.
   */
  assert.deepEqual(await ids(api, 'batch=3134'), ['b-1', 'b-2', 'b-3']);
  assert.deepEqual(await ids(api, 'batch=3140'), ['b-2', 'b-3', 'b-4']);
});

test('a batch search finds the passes that mixed the batch into another', async (t) => {
  const api = await startApi({
    tables: {
      machines: PLANT,
      runs: [
        // The shape a mix is recorded in: the batch it is filed under, and the
        // whole list across the source columns.
        run('x-1', { batch_no: '3056', src1: '3056', src2: '3058' }),
        run('x-2', { batch_no: '3056' }),
        run('x-3', { batch_no: '3058' }),
        run('x-4', { batch_no: '3059', src1: '3059', src2: '30581' }),
      ],
    },
  });
  t.after(() => api.stop());

  /*
   * 3058 was mixed into 3056 on x-1, so a pass on 3058 is what that run is -
   * and it is the search somebody runs when they are asking where the rest of a
   * batch went. Searching the filed-under column alone answers with x-3 and
   * looks complete, which is the failure mode that matters: nobody re-runs a
   * search that already gave them an answer.
   */
  assert.deepEqual(await ids(api, 'batch=3058'), ['x-1', 'x-3']);
  // And the batch it is filed under still finds it once, not twice, though the
  // number is in two columns of the same row.
  assert.deepEqual(await ids(api, 'batch=3056'), ['x-1', 'x-2']);
  // A source column is matched whole, like every other clause here.
  assert.deepEqual(await ids(api, 'batch=30581'), ['x-4']);
});

test('a batch search narrows with everything else', async (t) => {
  const api = await startApi({
    tables: {
      machines: PLANT,
      runs: [
        run('m-1', { batch_no: '3134', machine_id: 'GRD_K' }),
        run('m-2', { batch_no: '3134', machine_id: 'CRK', machine: 'Cracker' }),
      ],
    },
  });
  t.after(() => api.stop());

  // The or-clause is one filter among the others, not instead of them.
  assert.deepEqual(await ids(api, 'batch=3134&category=grinders'), ['m-1']);
});
