import test from 'node:test';
import assert from 'node:assert/strict';
import { poolFor, displayLabel, halfIndex, batchLabel } from '../src/utils/stockPeriod.js';

/**
 * Which ten-day pool a coarse sack lands in. The label is what the yard reads
 * off a pallet, so the boundaries have to be exactly where the plant says they
 * are - the 10th is still H1, the 11th is H2, and a short month's H3 ends on
 * whatever its last day is rather than on a notional 30th.
 */

test('the thirds of a month fall where the plant says they do', () => {
  assert.equal(halfIndex(1), 1);
  assert.equal(halfIndex(10), 1);
  assert.equal(halfIndex(11), 2);
  assert.equal(halfIndex(20), 2);
  assert.equal(halfIndex(21), 3);
  // The 31st is capped into H3 rather than opening a fourth period of one day.
  assert.equal(halfIndex(31), 3);
});

test('a pool carries the stored label, the shown one and its dates', () => {
  assert.deepEqual(poolFor('2026-08-07'), {
    label: '2026-08-H1',
    display: 'AUG-H1',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-10',
  });
  assert.deepEqual(poolFor('2026-08-15'), {
    label: '2026-08-H2',
    display: 'AUG-H2',
    periodStart: '2026-08-11',
    periodEnd: '2026-08-20',
  });
  assert.equal(poolFor('2026-08-31').periodEnd, '2026-08-31');
  // February, and a leap February - H3 ends on the month's own last day.
  assert.equal(poolFor('2026-02-25').periodEnd, '2026-02-28');
  assert.equal(poolFor('2028-02-25').periodEnd, '2028-02-29');
});

test('a stored pool label is shown as the yard reads it', () => {
  assert.equal(displayLabel('2026-08-H1'), 'AUG-H1');
  assert.equal(displayLabel('2026-12-H3'), 'DEC-H3');
  // A batch group's label is already the thing to show.
  assert.equal(displayLabel('B1041-Fine'), 'B1041-Fine');
  assert.equal(displayLabel(null), '');
});

test('a batch group is keyed on the batch and the grade it yielded', () => {
  // One batch yields several grades, and each is its own stock. The label is
  // unique, so the grade has to be part of it.
  assert.equal(batchLabel('B1041', 'Fine'), 'B1041-Fine');
  assert.notEqual(batchLabel('B1041', 'Fine'), batchLabel('B1041', 'Special'));
});
