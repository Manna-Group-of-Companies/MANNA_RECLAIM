import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, keeperPatch, shiftPart, prefixPart, mergedQc } from '../scripts/lot-key-split.js';

/**
 * The one-off that takes the product back out of a sleeve or loop batch number.
 *
 * Asserted on the planning half rather than through a database, because what can
 * go wrong here is arithmetic and judgement rather than SQL: which rows are
 * still in the old shape, which of them collapse onto one key, what the merged
 * row ends up holding - and, above all, that running it twice does not double a
 * count. A migration that doubles the yard is not something to find out about on
 * the plant's data.
 *
 * The rule the whole thing rests on: a row is only touched while it is still in
 * the old shape, and "old shape" is decided on the columns rather than on what
 * the label looks like. The new label reads exactly like an old one - both are
 * `SLEVE-03/Aug/26-day` - so a test on the string would rewrite a finished row
 * forever.
 */

const PRODUCTS = [
  // Two prefixes for one product, which is where the merge comes from: lots
  // filed before the code was set carry the id, and lots filed after carry the
  // code.
  { id: 'SLEVE', code: 'SLEEVE' },
  { id: 'LOOP', code: 'LOOP' },
];

const group = (over = {}) => ({
  id: 'g1',
  kind: 'lot',
  label: 'SLEEVE-03/Aug/26-day',
  batch_no: null,
  product_id: 'SLEVE',
  quality: 'SLEVE',
  packed_sacks: 380,
  dispatched_sacks: 0,
  qc_status: 'pending',
  kg_per_unit: 0.25,
  first_packed_on: '2026-08-03',
  last_packed_on: '2026-08-03',
  created_at: '2026-08-03T12:00:00Z',
  ...over,
});

// ---------------------------------------------------------------------------
// reading the old number
// ---------------------------------------------------------------------------

test('the shift comes off the end, whatever the prefix is', () => {
  assert.equal(shiftPart('SLEEVE-03/Aug/26-day'), '03/Aug/26-day');
  assert.equal(prefixPart('SLEEVE-03/Aug/26-day'), 'SLEEVE');

  // Anchored on the date rather than on the first hyphen. A product code may
  // contain one, and splitting at the first would leave `2-03/Aug/26-day`.
  assert.equal(prefixPart('SLV-2-03/Aug/26-night'), 'SLV-2');
  assert.equal(shiftPart('SLV-2-03/Aug/26-night'), '03/Aug/26-night');

  // Already split: the shift is the whole string and there is no prefix.
  assert.equal(prefixPart('03/Aug/26-day'), '');

  // Not a lot number at all - a coarse pool, a reclaim batch, an empty column.
  assert.equal(shiftPart('B1041'), null);
  assert.equal(shiftPart(''), null);
});

// ---------------------------------------------------------------------------
// what gets touched
// ---------------------------------------------------------------------------

test('runs and lab tests lose the prefix and keep everything else', () => {
  const { runEdits, testEdits, problems } = plan({
    products: PRODUCTS,
    runs: [{ id: 'r1', product: 'SLEVE', batch_no: 'SLEEVE-03/Aug/26-day' }],
    tests: [{ id: 't1', quality: 'LOOP', batch_no: 'LOOP-03/Aug/26-night' }],
  });

  assert.deepEqual(problems, []);
  assert.equal(runEdits.length, 1);
  assert.equal(runEdits[0].to, '03/Aug/26-day');
  assert.equal(testEdits[0].to, '03/Aug/26-night');
});

test('a prefix the product column does not recognise is reported, not rewritten', () => {
  // The label says these are loops and the column says sleeves. One of the two
  // is wrong and a script is not the thing to decide which - rewriting on the
  // column would file the goods as something nobody made.
  const { runEdits, problems } = plan({
    products: PRODUCTS,
    runs: [{ id: 'r1', product: 'SLEVE', batch_no: 'LOOP-03/Aug/26-day' }],
  });

  assert.equal(runEdits.length, 0, 'left alone');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /prefixed LOOP but the row says SLEVE/);
});

test('a product with no code still splits - the id was the fallback prefix', () => {
  const { runEdits } = plan({
    products: [{ id: 'SLEVE', code: null }],
    runs: [{ id: 'r1', product: 'SLEVE', batch_no: 'SLEVE-03/Aug/26-day' }],
  });
  assert.equal(runEdits[0].to, '03/Aug/26-day');
});

// ---------------------------------------------------------------------------
// the merge
// ---------------------------------------------------------------------------

test('two prefixes for one product collapse onto one key, and the pieces add up', () => {
  const { lots, merges } = plan({
    products: PRODUCTS,
    groups: [
      group({ id: 'g1', label: 'SLEEVE-03/Aug/26-day', packed_sacks: 360, created_at: '2026-08-03T12:00:00Z' }),
      group({ id: 'g2', label: 'SLEVE-03/Aug/26-day', packed_sacks: 140, created_at: '2026-08-05T12:00:00Z' }),
    ],
  });

  assert.equal(lots.length, 1, 'one lot, filed under two names');
  assert.equal(merges.length, 1);
  assert.equal(lots[0].key, 'SLEVE-03/Aug/26-day');
  assert.equal(lots[0].rows[0].id, 'g1', 'the oldest is the keeper, so created_at still means something');

  const patch = keeperPatch(lots[0]);
  assert.equal(patch.packed_sacks, 500, '360 + 140');
  assert.equal(patch.batch_no, '03/Aug/26-day');
  assert.equal(patch.label, 'SLEVE-03/Aug/26-day');
});

test('sleeve and loop on one shift stay two lots', () => {
  // The whole point of the composite key, seen from the migration's side: these
  // two end up with the same batch number and must not be brought together.
  const { lots, merges } = plan({
    products: PRODUCTS,
    groups: [
      group({ id: 'g1', label: 'SLEEVE-03/Aug/26-day', product_id: 'SLEVE' }),
      group({ id: 'g2', label: 'LOOP-03/Aug/26-day', product_id: 'LOOP', quality: 'LOOP' }),
    ],
  });

  assert.equal(lots.length, 2);
  assert.equal(merges.length, 0);
  assert.deepEqual(lots.map((lot) => lot.key).sort(), ['LOOP-03/Aug/26-day', 'SLEVE-03/Aug/26-day']);
});

test('a merged lot takes the safest verdict and the widest packing span', () => {
  const lot = {
    key: 'SLEVE-03/Aug/26-day',
    product: 'SLEVE',
    batchNo: '03/Aug/26-day',
    rows: [
      group({ id: 'g1', qc_status: 'pass', first_packed_on: '2026-08-03', last_packed_on: '2026-08-03' }),
      group({ id: 'g2', qc_status: 'fail', first_packed_on: '2026-08-02', last_packed_on: '2026-08-06' }),
    ],
  };

  const patch = keeperPatch(lot);
  // A hold on either half holds the lot. The two rows are the same goods, and
  // the bench having stopped some of them is a fact about all of them.
  assert.equal(patch.qc_status, 'fail');
  assert.equal(patch.first_packed_on, '2026-08-02');
  assert.equal(patch.last_packed_on, '2026-08-06');

  assert.equal(mergedQc([{ qc_status: 'pass' }, { qc_status: 'pending' }]), 'pending');
  assert.equal(mergedQc([{ qc_status: 'pass' }, { qc_status: 'pass' }]), 'pass');
});

// ---------------------------------------------------------------------------
// running it twice
// ---------------------------------------------------------------------------

test('a row already split is skipped, so a second run cannot double a count', () => {
  // Exactly what the first run leaves behind: the number in its own column and
  // the label built from the two fields. Note that the label still *looks*
  // prefixed - `SLEVE-` - which is why the skip is decided on the columns.
  const done = group({
    label: 'SLEVE-03/Aug/26-day',
    batch_no: '03/Aug/26-day',
    packed_sacks: 500,
  });

  const { lots, merges, problems } = plan({ products: PRODUCTS, groups: [done] });
  assert.deepEqual(lots, [], 'nothing to rekey');
  assert.deepEqual(merges, []);
  assert.deepEqual(problems, []);
});

test('a second run over a whole yard writes nothing at all', () => {
  const products = PRODUCTS;
  const runs = [{ id: 'r1', product: 'SLEVE', batch_no: 'SLEEVE-03/Aug/26-day' }];
  const tests = [{ id: 't1', quality: 'SLEVE', batch_no: 'SLEEVE-03/Aug/26-day' }];
  const groups = [
    group({ id: 'g1', label: 'SLEEVE-03/Aug/26-day', packed_sacks: 360 }),
    group({ id: 'g2', label: 'SLEVE-03/Aug/26-day', packed_sacks: 140, created_at: '2026-08-05T12:00:00Z' }),
  ];

  const first = plan({ products, runs, tests, groups });
  assert.equal(first.runEdits.length, 1);
  assert.equal(first.merges.length, 1);

  // The tables as the first run leaves them: the two groups merged into the
  // keeper, the loser deleted, the run and the test renumbered.
  const patch = keeperPatch(first.lots[0]);
  const after = plan({
    products,
    runs: runs.map((run) => ({ ...run, batch_no: first.runEdits[0].to })),
    tests: tests.map((row) => ({ ...row, batch_no: first.testEdits[0].to })),
    groups: [{ ...groups[0], ...patch }],
  });

  assert.deepEqual(after.runEdits, [], 'the run is already renumbered');
  assert.deepEqual(after.testEdits, []);
  assert.deepEqual(after.lots, [], 'and the group is already keyed');
  assert.deepEqual(after.problems, []);
  assert.equal(patch.packed_sacks, 500, 'still 500 - not 1000, and not 640');
});
