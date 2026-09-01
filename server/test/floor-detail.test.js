import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The shop floor reads the same shift the office reads.
 *
 * The crew is paid an incentive on these figures. The office could open any of
 * them and see what it was added up from - the formula, the hours, the crew, the
 * arithmetic - and the shift being measured on them could not: the tablet drew
 * the number, the target and a verdict, and stopped there. A figure somebody is
 * paid against and cannot check is not a benchmark, it is an assertion.
 *
 * So this asserts on the payload rather than on the screen: whatever the office
 * is sent, the floor is sent. The two screens draw it differently - they have to,
 * since nearly every class the back office uses is declared under `.back-office`
 * - but neither may be handed less to draw.
 */

const PLANT = [
  { id: 'GRD_K', name: 'Grinder 1', kind: 'grind', enabled: true, sort_order: 1 },
];

const RUNS = [{
  id: 'r-1',
  machine_id: 'GRD_K',
  machine: 'Grinder 1',
  kind: 'grind',
  line: 'grind',
  shift_date: '2026-08-20',
  shift: 'Day',
  workers: 3,
  hours_run: 9,
  kwh: 100,
  weight_kg: 4000,
  ended_at: '2026-08-20T20:00:00.000Z',
}];

const read = async (app, role) => {
  const res = await app.call('/reports/shift-efficiency?date=2026-08-20&shift=Day', { role });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body.data;
};

test('a supervisor is sent the same shift as the manager, working included', async (t) => {
  const app = await startApi({ tables: { runs: RUNS, machines: PLANT, ideal_values: [] } });
  t.after(() => app.stop());

  const office = await read(app, 'manager');
  const floor = await read(app, 'supervisor');

  assert.deepEqual(floor, office, 'byte for byte the same shift');
});

test('every figure carries its own working', async (t) => {
  const app = await startApi({ tables: { runs: RUNS, machines: PLANT, ideal_values: [] } });
  t.after(() => app.stop());

  const floor = await read(app, 'supervisor');
  const card = floor.grinders[0];
  const pmh = card.metrics.find((m) => m.key === 'pmh');

  /*
   * The three things the floor screen had nothing to draw: how the number was
   * reached, what it was made of, and how far off it landed. Asserted here
   * because a card that quietly stops sending one of them looks exactly like a
   * card nobody has set a target on.
   */
  assert.ok(pmh.calc, 'the arithmetic');
  assert.ok(pmh.calc.formula);
  assert.ok(Array.isArray(pmh.calc.lines) && pmh.calc.lines.length);
  assert.ok(pmh.calc.result);

  const util = card.metrics.find((m) => m.key === 'util');
  assert.ok(util.context, 'what the figure is of');
  assert.equal(util.value, 75);
});

test('a worker may read it, and a breakdown is a real maintenance record', async (t) => {
  const app = await startApi({ tables: { runs: RUNS, machines: PLANT, maintenance: [] } });
  t.after(() => app.stop());

  // Reading is the whole point: they are paid on these figures.
  const res = await app.call('/reports/shift-efficiency?date=2026-08-20&shift=Day', { role: 'worker' });
  assert.equal(res.status, 200);

  /*
   * And the breakdown a reason points at is a real maintenance record - the
   * same one the Machines tab writes, so the machine goes DOWN and the repair
   * is owed. Not a second kind of breakdown filed from a second screen.
   */
  const down = await app.call('/maintenance', {
    method: 'POST',
    role: 'supervisor',
    body: { machineId: 'GRD_K', machine: 'Grinder 1', rootCause: 'bearing seized' },
  });
  assert.equal(down.status, 201, await down.text());

  const open = await app.call('/maintenance?status=open', { role: 'supervisor' });
  const { data } = await open.json();
  assert.equal(data.length, 1);
  assert.equal(data[0].machine_id, 'GRD_K');
  assert.equal(data[0].root_cause, 'bearing seized');
  assert.equal(data[0].repaired_at ?? null, null, 'still down until the repair is logged');
});
