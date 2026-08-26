import test from 'node:test';
import assert from 'node:assert/strict';
import { refinerUnits, refinerPending } from '../src/services/efficiency.service.js';

/**
 * A grade belongs to the shift that weighed it out, wherever its passes ran.
 *
 * The special line refines a grade through two to four passes and weighs only
 * the finishing one, and the passes need not be in the same shift. Batch 3096
 * Special was worked on R3 through the day of 15 August 2026 and finished on R4
 * that night.
 *
 * Counted by the clock - which is what this did - the day showed 12.4 man-hours
 * against no output, and the night 1,083 kg against only its own 19.2. So the
 * day read as a crew that produced nothing and the night as one making 56.4 kg
 * per man-hour, when the material cost 31.6 man-hours and came to 34.3. Both
 * wrong, in opposite directions, on the figure the plant pays an incentive
 * against, on 36 of its 267 batch-grades.
 *
 * Three things follow, and each is a way to get it wrong again:
 *
 *   1. Leaving the earlier passes where they ran. The shift that finishes a
 *      grade gets credit for hours it did not spend.
 *
 *   2. Leaving a hollow unit behind on the shift the work started in - labour
 *      with no output, which reads as a wasted shift and flags for a reason
 *      nobody can give.
 *
 *   3. Charging labour on unweighed material against another batch's output.
 *      That is the same error wearing a different coat, and it is what made 15
 *      August night read 21.6 instead of 34.3 even after the passes moved.
 */

const run = (over = {}) => ({
  id: `r-${Math.random().toString(36).slice(2, 9)}`,
  line: 'special',
  kind: 'refiner',
  quality: 'Special',
  batch_no: '3096',
  machine_id: 'R3',
  machine: 'Refiner 3',
  shift_date: '2026-08-15',
  shift: 'Day',
  workers: 2,
  hours_run: 6.2,
  kwh: 50,
  weight_kg: null,
  ...over,
});

/** The plant's own 15 August: R3 through the day, R4 finishing that night. */
const SPLIT = [
  run({ machine_id: 'R3', shift: 'Day', workers: 2, hours_run: 6.2 }),
  run({ machine_id: 'R4', shift: 'Night', workers: 3, hours_run: 6.4, weight_kg: 1083 }),
];

const unitFor = (units, shift) =>
  units.find((u) => u.shift === shift && u.quality === 'Special') ?? null;

test('a grade is counted in the shift that weighed it out', async () => {
  const units = refinerUnits(SPLIT);

  const night = unitFor(units, 'Night');
  assert.ok(night, 'the night weighed it, so the night owns it');
  assert.equal(night.out, 1083);
  // 2 x 6.2 + 3 x 6.4 = 31.6, not the night's own 19.2.
  assert.equal(night.labour, 31.6);
  assert.equal(+night.pmh.toFixed(2), 34.27);

  /*
   * And 56.4 is what it used to say - the weighing shift's own hours alone.
   * Kept as an assertion rather than a comment because it is the number
   * somebody will find in an old screenshot and ask about.
   */
  assert.notEqual(+night.pmh.toFixed(1), 56.4);
});

test('the shift the work started in is not left holding a hollow unit', async () => {
  const units = refinerUnits(SPLIT);

  /*
   * No day unit at all. A unit with labour and no output reads as a shift that
   * produced nothing - it flags, it asks for a reason, and the honest answer is
   * "we did produce, it was weighed after midnight", which is not a reason
   * anybody should have to write.
   */
  assert.equal(unitFor(units, 'Day'), null);
  assert.equal(units.length, 1);
});

test('every pass says which shift it actually ran in', async () => {
  const [night] = refinerUnits(SPLIT);
  const moved = night.parts.find((p) => p.machineId === 'R3');

  // The figure belongs to the weighing shift; the hours were still worked when
  // they were worked. A detail panel that said otherwise would answer "when did
  // this happen" with the wrong night.
  assert.equal(moved.ranIn, 'Day');
  assert.equal(moved.ranOn, '2026-08-15');
  assert.equal(night.parts.find((p) => p.machineId === 'R4').ranIn, 'Night');
});

test('labour on material never weighed is charged to no shift', async () => {
  const withPending = [
    ...SPLIT,
    // Batch 3088 worked that night and never weighed - which is true of sixteen
    // groups on the record, months old and not coming back.
    run({ batch_no: '3088', shift: 'Night', workers: 3, hours_run: 6.2, weight_kg: null }),
  ];

  const night = unitFor(refinerUnits(withPending), 'Night');
  /*
   * Still 31.6. Left in, 3088's 18.6 hours are charged against 3096's kilograms
   * and the night reads 21.6 kg per man-hour for material that cost 34.3 -
   * which is the original bug, moved one batch sideways.
   */
  assert.equal(night.labour, 31.6);
  assert.equal(+night.pmh.toFixed(2), 34.27);
});

test('what was left out is countable, not silent', async () => {
  const pending = refinerPending([
    ...SPLIT,
    run({ batch_no: '3088', shift: 'Night', workers: 3, hours_run: 6.2 }),
  ]);

  // A rate that quietly drops labour is a rate nobody can reconcile against the
  // timesheets, so the exclusion is a list somebody can read.
  assert.equal(pending.length, 1);
  assert.equal(pending[0].batch, '3088');
  assert.equal(pending[0].labour, 18.6);
  assert.equal(pending[0].lastDay, '2026-08-15');
});

test('weighed in two shifts, the last weighing takes it', async () => {
  const twice = [
    run({ machine_id: 'R3', shift: 'Day', workers: 2, hours_run: 5 }),
    run({ machine_id: 'R4', shift: 'Day', workers: 3, hours_run: 2, weight_kg: 200 }),
    run({ machine_id: 'R4', shift: 'Night', workers: 3, hours_run: 3, weight_kg: 700 }),
  ];

  const units = refinerUnits(twice);
  /*
   * One unit, on the night. The grade was finished there, and splitting the
   * day's unweighed pass between the two weighings would mean inventing how
   * much of it belonged to each.
   */
  assert.equal(units.length, 1);
  assert.equal(units[0].shift, 'Night');
  assert.equal(units[0].out, 900);
  assert.equal(units[0].labour, 25);
});

test('a grade worked and weighed in one shift is untouched', async () => {
  const tidy = [
    run({ machine_id: 'R3', shift: 'Day', workers: 2, hours_run: 4 }),
    run({ machine_id: 'R4', shift: 'Day', workers: 3, hours_run: 3, weight_kg: 600 }),
  ];

  // 231 of the plant's 267 batch-grades are like this, and none of them may
  // move: a fix that changed the ordinary case would be a worse bug than the
  // one it replaced.
  const [unit] = refinerUnits(tidy);
  assert.equal(unit.shift, 'Day');
  assert.equal(unit.out, 600);
  assert.equal(unit.labour, 17);
});
