import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Who was on each line, shift by shift.
 *
 * The plant pays an incentive on how a line did against its benchmarks, and
 * until now a shift's figures belonged to nobody: a run carries the supervisor
 * who signed it and a crew count - "3 workers" - so there was no way to say that
 * Suresh was on Grinder 2 last Tuesday night, and no way to pay him for it.
 *
 * Four things this has to get right:
 *
 *   1. One Suresh. Typed by hand each shift, "Suresh", "suresh" and "Sursh"
 *      would be three people and an incentive total would be wrong in a way
 *      nobody would spot. The list is what makes the same person the same row.
 *
 *   2. One operator per station per shift. Two names on one line for one shift
 *      is not a thing the plant does, and a total that found two would guess.
 *
 *   3. The name kept as it was. An operator renamed next year must not silently
 *      rewrite who the plant paid last March.
 *
 *   4. Who may do what. Keeping the list is the office's - a misspelt operator
 *      added mid-shift becomes a second person to pay. Assigning is the
 *      supervisor's, because it is a fact about the shift they are running.
 */

const DAY = '2026-08-01';

const seed = () => ({ operators: [], shift_operators: [], runs: [] });

const addOperator = async (api, name, role = 'manager') =>
  api.call('/operators', { role, method: 'POST', body: { name } });

test('an operator is added once, and cannot be added twice', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const first = await addOperator(api, 'Suresh');
  assert.equal(first.status, 201);

  // Case-insensitively the same person. The unique index makes it true; the
  // service checks first so it comes back as a sentence, not a constraint.
  const again = await addOperator(api, 'suresh');
  assert.equal(again.status, 409, 'the same name a second time is refused');
  assert.equal(api.tables.operators.length, 1, 'and there is still one Suresh');
});

test('the office keeps the list; the floor does not', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  for (const role of ['supervisor', 'worker', 'lab', 'md']) {
    const res = await addOperator(api, 'Someone ' + role, role);
    assert.equal(res.status, 403, `a ${role} added an operator (${res.status})`);
  }
  assert.equal(api.tables.operators.length, 0);
});

test('the supervisor puts somebody on a line for a shift', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  await addOperator(api, 'Suresh');
  const [suresh] = api.tables.operators;

  const res = await api.call('/operators/roster', {
    role: 'supervisor',
    method: 'POST',
    body: { date: DAY, shift: 'Day', station: 'GRD_S', operatorId: suresh.id },
  });
  assert.equal(res.status, 200);

  const [row] = api.tables.shift_operators;
  assert.equal(row.station, 'GRD_S');
  assert.equal(row.operator_id, suresh.id);
  // The name as it was when the shift was worked, beside the id on purpose.
  assert.equal(row.operator, 'Suresh');
  assert.ok(row.assigned_by, 'and who put them there');
});

test('re-assigning a station replaces, it does not add a second name', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  await addOperator(api, 'Suresh');
  await addOperator(api, 'Ramesh');
  const [suresh, ramesh] = api.tables.operators;

  const put = (id) =>
    api.call('/operators/roster', {
      role: 'supervisor',
      method: 'POST',
      body: { date: DAY, shift: 'Day', station: 'GRD_S', operatorId: id },
    });

  await put(suresh.id);
  await put(ramesh.id);

  assert.equal(api.tables.shift_operators.length, 1, 'one row for one station on one shift');
  assert.equal(api.tables.shift_operators[0].operator, 'Ramesh');

  // And nobody is a real answer, different from never having been asked.
  await put(null);
  assert.equal(api.tables.shift_operators.length, 1);
  assert.equal(api.tables.shift_operators[0].operator_id ?? null, null);
});

test('a renamed operator does not rewrite the shifts already recorded', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  await addOperator(api, 'Suresh');
  const [suresh] = api.tables.operators;
  await api.call('/operators/roster', {
    role: 'supervisor',
    method: 'POST',
    body: { date: DAY, shift: 'Day', station: 'GRD_S', operatorId: suresh.id },
  });

  const renamed = await api.call(`/operators/${suresh.id}`, {
    role: 'manager',
    method: 'PATCH',
    body: { name: 'Suresh Kumar' },
  });
  assert.equal(renamed.status, 200);

  assert.equal(
    api.tables.shift_operators[0].operator,
    'Suresh',
    'the shift still says the name it was worked under',
  );
});

test('a station that is not a station is refused', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const res = await api.call('/operators/roster', {
    role: 'supervisor',
    method: 'POST',
    body: { date: DAY, shift: 'Day', station: 'R4', operatorId: null },
  });
  // R4 is a machine on the special line, not a line somebody is put on. The
  // roster is keyed on lines because that is how the plant is operated.
  assert.equal(res.status, 422);
});

test('the roster comes back whole, named or not', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const res = await api.call(`/operators/roster?date=${DAY}&shift=Day`, { role: 'supervisor' });
  assert.equal(res.status, 200);
  const rows = (await res.json()).data;

  // Every station, so an unassigned line is a blank to fill rather than a row
  // that is simply not there for anybody to notice.
  assert.equal(rows.length, 7);
  assert.deepEqual(
    rows.map((r) => r.station),
    ['CRK', 'GRD_K', 'GRD_S', 'GRD_O', 'AUTOCLAVES', 'SPECIAL', 'COARSE'],
  );
  assert.equal(rows.every((r) => r.operator === null), true);
});
