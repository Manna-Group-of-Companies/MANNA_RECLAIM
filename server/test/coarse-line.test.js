import test from 'node:test';
import assert from 'node:assert/strict';
import { coarseUnits, coarsePending } from '../src/services/efficiency.service.js';

/**
 * The coarse line is two machines and one flow, and it is measured as one.
 *
 * PR1 pre-refines and never weighs anything - nought of its 103 passes on
 * record - and R2 finishes and always does, all 104 of its own. So PR1's crew
 * is half the labour behind every kilogram R2 books, and a shift counted on the
 * passes logged against it alone is counted on whichever half of the line
 * happened to fall inside it.
 *
 * On 89 of the 91 days the line has run, both machines are logged in the same
 * shift and the question never comes up. On 16 August 2026 it did: PR1 worked
 * 10.4 hours with three crew through the day, R2 weighed 7,046 kg that night on
 * 4.3 hours with three, and the night was published at 546.2 kg per man-hour
 * against an ideal of 75 - a 628% overshoot on a figure the plant pays an
 * incentive against, while the day showed no card at all for a shift that had
 * worked the line all day.
 *
 * The real figure is 159.8, which is what the line does.
 */

const run = (over = {}) => ({
  id: `c-${Math.random().toString(36).slice(2, 9)}`,
  line: 'coarse',
  kind: 'coarse',
  machine_id: 'PR1',
  machine: 'Pre-Refiner 1',
  shift_date: '2026-08-16',
  shift: 'Day',
  workers: 3,
  hours_run: 10.4,
  kwh: 191,
  weight_kg: null,
  ...over,
});

/** The plant's own 16 August: PR1 through the day, R2 weighing that night. */
const SPLIT = [
  run({ machine_id: 'PR1', machine: 'Pre-Refiner 1', shift: 'Day', hours_run: 10.4, kwh: 191 }),
  run({
    machine_id: 'R2', machine: 'Refiner 2', kind: 'refiner',
    shift: 'Night', hours_run: 4.3, kwh: 75, weight_kg: 7046,
  }),
];

const at = (units, shift) => units.find((u) => u.shift === shift) ?? null;

test('the shift that weighed out carries the pre-refining that fed it', async () => {
  const [night] = coarseUnits(SPLIT);

  assert.equal(night.shift, 'Night');
  assert.equal(night.out, 7046);
  // 3 x 10.4 + 3 x 4.3 = 44.1, not the night's own 12.9.
  assert.equal(round(night.labour), 44.1);
  assert.equal(round(night.pmh, 1), 159.8);

  // 546.2 is what it published, and it is the number somebody will find in an
  // old screenshot and ask about, so it is asserted rather than described.
  assert.notEqual(round(night.pmh, 1), 546.2);
});

test('the shift the pre-refining ran in is not left holding a hollow card', async () => {
  const units = coarseUnits(SPLIT);

  // A card with labour and no output reads as a shift that produced nothing. It
  // flags, it asks for a reason, and the honest answer - "we did produce, R2
  // weighed it after midnight" - is not a reason anybody should have to write.
  assert.equal(at(units, 'Day'), null);
  assert.equal(units.length, 1);
});

test('every pass says which shift it actually ran in', async () => {
  const [night] = coarseUnits(SPLIT);
  const moved = night.parts.find((p) => p.machineId === 'PR1');

  // The figure belongs to the weighing shift; the hours were worked when they
  // were worked. A detail panel that said otherwise would answer "when did this
  // happen" with the wrong night.
  assert.equal(moved.ranIn, 'Day');
  assert.equal(moved.ranOn, '2026-08-16');
  assert.equal(night.parts.find((p) => p.machineId === 'R2').ranIn, 'Night');
});

test('a day where both shifts weighed leaves both shifts alone', async () => {
  /*
   * 19 August, and the ordinary shape of the record: each shift ran both
   * machines and weighed its own output. Nothing may move here - the fix is for
   * the shift that weighed nothing, and a rule that reached into the days that
   * are already right would be a worse bug than the one it replaced.
   */
  const units = coarseUnits([
    run({ shift_date: '2026-08-19', shift: 'Day', hours_run: 7.9 }),
    run({ shift_date: '2026-08-19', shift: 'Day', machine_id: 'R2', hours_run: 3.4, weight_kg: 5353 }),
    run({ shift_date: '2026-08-19', shift: 'Night', hours_run: 12 }),
    run({ shift_date: '2026-08-19', shift: 'Night', machine_id: 'R2', hours_run: 5, weight_kg: 7506 }),
  ]);

  assert.equal(units.length, 2);
  assert.equal(round(at(units, 'Day').labour), 33.9);
  assert.equal(round(at(units, 'Night').labour), 51);
  assert.equal(round(at(units, 'Night').pmh, 1), 147.2);
});

test('labour on a day that weighed nothing is charged to no shift', async () => {
  /*
   * 9 March, where PR1 worked and neither shift weighed. There is no batch on
   * this line to carry the hours forward with, so they are charged to nobody
   * rather than to the next day the line happened to run - which would be the
   * same error moved one day sideways.
   */
  const orphan = [run({ shift_date: '2026-03-09', shift: 'Day', hours_run: 8.2 })];

  assert.deepEqual(coarseUnits(orphan), []);

  const pending = coarsePending(orphan);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].day, '2026-03-09');
  assert.equal(pending[0].labour, 24.6);
  assert.deepEqual(pending[0].machines, ['PR1']);
});

test('a vessel is not the line, however coarse the work it did', async () => {
  /*
   * A coarse-form autoclave charge is logged on this line, correctly - it is
   * coarse work. It is not this line's labour: a vessel cooking for eight hours
   * with one hand attending is not a crew working a refiner, and the 354 of
   * them on record would make the benchmark three times too lax.
   */
  const withVessel = [
    ...SPLIT,
    run({ kind: 'autoclave', machine_id: 'AC_M', shift: 'Night', workers: 1, hours_run: 7.8 }),
  ];

  const [night] = coarseUnits(withVessel);
  assert.equal(round(night.labour), 44.1);
  assert.equal(night.parts.length, 2);
  // And it is not quietly reported as unweighed labour either.
  assert.equal(coarsePending(withVessel).length, 0);
});

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
