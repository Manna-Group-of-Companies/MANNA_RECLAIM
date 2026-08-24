import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * A reason is written by the shift and signed off by the office.
 *
 * The plant pays an incentive on how a shift did against its benchmarks, and
 * that changes what a reason is. It is not merely an explanation - it is a
 * request to discount a miss, and a request that grants itself is not a control.
 * So the two halves belong to two people, and the ways to get that wrong are:
 *
 *   1. Letting the office write the reason. The person who can say why a belt
 *      was slipping is the one who was standing next to it; a manager typing
 *      that sentence two days later is writing down a phone call.
 *
 *   2. Letting the shift approve its own. That is the request granting itself.
 *
 *   3. Merging the manager's words into the supervisor's. These records are read
 *      back exactly once - months later, with an incentive being argued over -
 *      and a sentence that reads as the supervisor's and is not is the worst
 *      possible thing to find there.
 *
 *   4. Reading "nobody has looked yet" as a verdict. An unapproved reason is
 *      waiting, not refused, and a screen that cannot tell those apart will show
 *      a shift as having been turned down when nobody has read it.
 */

const DAY = '2026-08-01';

const seed = () => ({
  runs: [],
  ideal_values: [{ id: 'current', data: { 'prod.GRD_K': 1200 } }],
  efficiency_notes: [],
  variance_reasons: [],
});

const body = {
  date: DAY,
  shift: 'Day',
  parameter: 'prod.GRD_K',
  label: 'Grinder 1 · Output',
  ideal: 1200,
  actual: 1000,
  reason: 'the belt was slipping all shift',
};

/** Writes one as the shift, and hands back what came out of the store. */
const writeOne = async (api, role = 'supervisor') => {
  const res = await api.call('/reports/variance-reasons', { role, method: 'POST', body });
  assert.equal(res.status, 201, `a ${role} could not record a reason (${res.status})`);
  return api.tables.variance_reasons[0];
};

test('the shift writes the reason, and the office does not have to', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const row = await writeOne(api, 'supervisor');
  assert.equal(row.reason, body.reason);
  assert.equal(row.parameter, 'prod.GRD_K');
  // Snapshotted, not looked up later: a benchmark raised next month must not
  // rewrite what this shift was explaining.
  assert.equal(Number(row.ideal), 1200);
  assert.equal(Number(row.actual), 1000);
  assert.equal(row.approved_at ?? null, null, 'a fresh reason is not approved by being written');
});

test('a worker does not answer for a shift; a supervisor does', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  // A shift is answered for by whoever signed it - see SIGNER_ROLES.
  const worker = await api.call('/reports/variance-reasons', { role: 'worker', method: 'POST', body });
  assert.equal(worker.status, 403);

  const lab = await api.call('/reports/variance-reasons', { role: 'lab', method: 'POST', body });
  assert.equal(lab.status, 403, 'the lab is not on the floor');
});

test('the shift cannot approve its own reason', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const row = await writeOne(api);
  for (const role of ['supervisor', 'worker', 'lab', 'md']) {
    const res = await api.call(`/reports/variance-reasons/${row.id}/approve`, {
      role,
      method: 'POST',
      body: {},
    });
    assert.equal(res.status, 403, `a ${role} approved a reason (${res.status})`);
  }
  assert.equal(api.tables.variance_reasons[0].approved_at ?? null, null, 'and none of them landed');
});

test('the office approves it, and its own words stay its own', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const row = await writeOne(api);
  const res = await api.call(`/reports/variance-reasons/${row.id}/approve`, {
    role: 'manager',
    method: 'POST',
    body: { managerNote: 'agreed, the feed was short all week' },
  });
  assert.equal(res.status, 200);

  const after = api.tables.variance_reasons[0];
  assert.ok(after.approved_at, 'it is signed off');
  assert.ok(after.approved_by, 'and the sign-off carries a name');
  assert.equal(
    after.reason,
    body.reason,
    "the shift's own sentence is untouched - the note goes beside it, never over it",
  );
  assert.equal(after.manager_note, 'agreed, the feed was short all week');
});

test('approving without a note leaves the note alone', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  const row = await writeOne(api);
  const bare = await api.call(`/reports/variance-reasons/${row.id}/approve`, {
    role: 'manager',
    method: 'POST',
    body: {},
  });
  assert.equal(bare.status, 200, 'most sign-offs have nothing to add');
  assert.ok(api.tables.variance_reasons[0].approved_at);
  assert.equal(api.tables.variance_reasons[0].manager_note ?? null, null);
});

test('the shift can read back what it wrote and whether it stuck', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  await writeOne(api);
  const res = await api.call(`/reports/variance-reasons?from=${DAY}&to=${DAY}`, {
    role: 'supervisor',
  });
  assert.equal(res.status, 200, 'a supervisor who wrote it can see it');
  const rows = (await res.json()).data;
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0].approved_at ?? null,
    null,
    'and unapproved reads as waiting, not as refused - there is no reject',
  );
});
