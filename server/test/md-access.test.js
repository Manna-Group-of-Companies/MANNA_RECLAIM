import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * What the managing director's account reaches, and what it must not.
 *
 * The role was added for one screen - the plant summary, with the shift
 * efficiency beside it - and the whole risk in adding it is that it is one line
 * away from being something else. `md` is not in ADMIN_ROLES, and the temptation
 * when a route 403s in testing is to put it there; that single edit would hand
 * this account the rate card, the ideal values, run corrections, dispatches and
 * every delete in the app, on screens it never opens and where nobody would see
 * it happen.
 *
 * So the boundary is asserted from both sides. Not only that the three summary
 * routes answer, which is the part that gets noticed when it breaks, but that
 * the writes on those same routes and the money screens beside them still
 * refuse - which is the part that does not.
 *
 * The tokens are signed rather than logged in for, because what is under test is
 * the gate on the route and not the PIN in front of it.
 */

const DAY = '2026-07-01';

const run = (over = {}) => ({
  id: 'run-1',
  machine_id: 'GRD_K',
  machine: 'Grinder 1',
  line: 'grind',
  kind: 'grind',
  shift_date: DAY,
  shift: 'Day',
  workers: 2,
  hours_run: 10,
  kwh: 300,
  weight_kg: 2000,
  ...over,
});

const seed = () => ({
  runs: [run(), run({ id: 'run-2', shift: 'Night' })],
  ideal_values: [{ id: 'current', data: { 'prod.GRD_K': 2500 }, updated_by: 'Manager' }],
  efficiency_notes: [],
  variance_reasons: [],
  maintenance: [],
  dispatches: [],
  users: [],
});

/**
 * The reads this account is for.
 *
 * `/reports/dashboard` is on the list and no MD screen draws it any more - the
 * Overview tab was taken off that dashboard as a view nobody used. The route
 * stays open to the role rather than being narrowed with the screen: the
 * account is defined by what it may read, not by which of those a tab happens
 * to show this month, and re-opening it later should not need a second
 * argument about permissions.
 */
const SUMMARY_READS = [
  `/reports/dashboard?from=${DAY}&to=${DAY}`,
  '/reports/shifts',
  `/reports/shift-efficiency?date=${DAY}&shift=Day`,
  `/reports/variance-reasons?from=${DAY}&to=${DAY}`,
];

/**
 * The two the shop floor reads as well, and why they are not a leak.
 *
 * The plant pays an incentive on how a shift did against its benchmarks, and
 * a target somebody is paid against and cannot see is not a target - it is a
 * surprise at the end of the month. So the crew reads the shift it worked.
 *
 * They carry kg per man-hour and kWh per kg against what they were meant to
 * be, and no rate, no wage and no customer. What stays shut is below.
 */
const FLOOR_READS = [
  '/reports/shifts',
  `/reports/shift-efficiency?date=${DAY}&shift=Day`,
  // The shift writes the reason for a miss, so the shift reads back whether
  // the office accepted it. Writing one is narrower - supervisors only.
  `/reports/variance-reasons?from=${DAY}&to=${DAY}`,
];

/**
 * And the office's own screens, which the floor still does not reach.
 *
 * The overview totals the plant and prices it - conversion cost, dispatched
 * value - and the variance reasons are the answers supervisors are asked to
 * give for a miss, which is a record kept about them rather than for them.
 */
const OFFICE_ONLY_READS = [`/reports/dashboard?from=${DAY}&to=${DAY}`];

/**
 * Everything the account is not. Two kinds, and both matter:
 * the writes on the very routes it can read, and the back office's own screens.
 */
/**
 * The writes that are open to everyone signed in, which is where this went
 * wrong the first time.
 *
 * Correcting a run and deleting one are deliberately ungated - the crews find
 * their own mistakes first, see run.routes.js - so the MD inherited both the day
 * the role was added, and the screen hiding the buttons made it look closed. It
 * was not: a request is a request, and DELETE /runs/:id answered 200.
 *
 * Which is why the rule is now a property of the role, applied where every
 * authenticated request passes, rather than a list of routes to remember. These
 * cases are here so a route left open on purpose cannot quietly hand this
 * account a write again.
 */
const UNGATED_WRITES = [
  { path: '/runs/run-1', method: 'PATCH', body: { remarks: 'no' } },
  { path: '/runs/run-1', method: 'DELETE' },
  { path: '/runs/start', method: 'POST', body: { machineId: 'GRD_K' } },
  { path: '/maintenance', method: 'POST', body: { machineId: 'GRD_K' } },
];

const FORBIDDEN = [
  { path: '/reports/variance-reasons', method: 'POST', body: {
    shift_date: DAY, shift: 'Day', parameter: 'prod.GRD_K', reason: 'no', entered_by: 'MD',
  } },
  { path: '/reports/efficiency-notes', method: 'POST', body: {
    shift_date: DAY, shift: 'Day', line: 'grind', metric: 'Grinder 1', reason: 'no',
  } },
  { path: `/reports/costing?from=${DAY}&to=${DAY}`, method: 'GET' },
  { path: `/reports/machine-log.csv?from=${DAY}&to=${DAY}`, method: 'GET' },
  { path: `/reports/downtime`, method: 'GET' },
  { path: '/rates/ideal-values', method: 'PUT', body: { data: { 'prod.GRD_K': 1 } } },
  { path: '/users', method: 'GET' },
];

test('the managing director reads the summary screens', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  for (const path of SUMMARY_READS) {
    const res = await api.call(path, { role: 'md' });
    assert.equal(res.status, 200, `${path} came back ${res.status} for md`);
  }
});

test('and cannot write, price or administer anything', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  for (const { path, method, body } of FORBIDDEN) {
    const res = await api.call(path, { role: 'md', method, body });
    assert.equal(res.status, 403, `${method} ${path} came back ${res.status} for md, not 403`);
  }
});

test('nor the writes that are open to everyone else signed in', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  for (const { path, method, body } of UNGATED_WRITES) {
    const res = await api.call(path, { role: 'md', method, body });
    assert.equal(res.status, 403, `${method} ${path} came back ${res.status} for md, not 403`);
  }

  // Reading is untouched by the rule - the whole point of the account.
  for (const path of SUMMARY_READS) {
    assert.equal((await api.call(path, { role: 'md' })).status, 200, `${path} still reads`);
  }
});

test('and the crews keep the corrections that were left open for them', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  // The mirror, and the reason the rule is on the role rather than the route: a
  // gate narrowed until md stopped getting through would have shut the floor out
  // of correcting its own runs, which is what those routes are open for.
  for (const role of ['supervisor', 'manager']) {
    const res = await api.call('/runs/run-1', { role, method: 'PATCH', body: { remarks: 'fixed' } });
    assert.notEqual(res.status, 403, `a ${role} may still correct a run`);
  }
});

test('the back office keeps every one of those', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  // The mirror of the test above, and the reason it is here: a gate narrowed by
  // hand until md stopped getting through would pass that test by locking the
  // manager out too, and nothing else in the suite would say so.
  for (const path of SUMMARY_READS) {
    const res = await api.call(path, { role: 'manager' });
    assert.equal(res.status, 200, `${path} came back ${res.status} for a manager`);
  }
  for (const { path, method, body } of FORBIDDEN) {
    const res = await api.call(path, { role: 'manager', method, body });
    assert.notEqual(res.status, 403, `${method} ${path} refused a manager`);
  }
});

test('the floor reads the shift it worked, and nothing else of the office\'s', async (t) => {
  const api = await startApi({ tables: seed() });
  t.after(() => api.stop());

  // The crew is paid on these figures, so the crew can read them.
  for (const role of ['supervisor', 'worker']) {
    for (const path of FLOOR_READS) {
      const res = await api.call(path, { role });
      assert.equal(res.status, 200, `${path} refused a ${role} with ${res.status}`);
    }
  }

  // And the widening stopped exactly there. The overview prices the plant and
  // the variance reasons are a record kept about supervisors, not for them.
  for (const role of ['supervisor', 'worker', 'lab']) {
    for (const path of OFFICE_ONLY_READS) {
      const res = await api.call(path, { role });
      assert.equal(res.status, 403, `${path} let a ${role} through with ${res.status}`);
    }
  }

  // The lab is not on the floor and is not paid on what the plant makes, so
  // it gets neither.
  for (const path of FLOOR_READS) {
    const res = await api.call(path, { role: 'lab' });
    assert.equal(res.status, 403, `${path} let the lab through with ${res.status}`);
  }
});
