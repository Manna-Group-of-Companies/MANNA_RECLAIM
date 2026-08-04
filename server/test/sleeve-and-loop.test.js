import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { runService, mergePatch } from '../src/services/run.service.js';
import { stockService, targetOf } from '../src/services/stock.service.js';
import { qualityService } from '../src/services/quality.service.js';
import { mouldingBatchNo, expectedPieces, variancePct } from '../src/utils/mouldingBatch.js';

/**
 * Sleeve and loop: the batch number nobody types, and the lot it files.
 *
 * These two activities sit beside the presses and are recorded quite
 * differently, and the difference is the whole reason they exist as their own
 * kinds. A press pools by the product and the pack it is boxed in, so one lab
 * verdict moves every loop the plant has ever made. Sleeve and loop are made a
 * shift at a time and answered for a shift at a time, like a batch of reclaim.
 *
 * Five rules are pinned down here, and each is one that would be invisible if it
 * broke - which is the only kind worth a test:
 *
 *   the number    generated from the shift date and the shift, on the server,
 *                 and never taken from the request. A tablet that could name its
 *                 own lot could file this shift's pieces into last week's.
 *   the key       the lot is the product AND that number. The number is the
 *                 shift alone, so the sleeve bench and the loop bench working
 *                 one shift carry the same one - and must stay two lots, in two
 *                 rows, under two verdicts.
 *   one lot       a second run of the same product in the same shift joins the
 *                 record the shift already has rather than opening a second one.
 *   the yard      boxed pieces file into a `lot` group keyed on that pair,
 *                 counted in pieces, opening `pending` for the bench.
 *   the verdict   a lab pass releases that lot and nothing else - not every
 *                 sleeve in the yard, which is what a press verdict does, and
 *                 not the loop bench's shift.
 */

const PRODUCT = {
  id: 'SLEVE',
  name: 'Sleve',
  // No longer part of the batch number - the code is what an order names, and
  // the lot is keyed on the product's id beside the shift. Left on the fixture
  // because a real product row has one and nothing should now depend on it.
  code: 'SLEEVE',
  active: true,
  moulded: true,
  cyclic_min: 5,
  cavities: 4,
  pack_size: 100,
  piece_kg: 0.25,
  compound_rate: 30,
};

/** The other bench, for the case one number covers two lots. */
const LOOP = {
  id: 'LOOP',
  name: 'Loop',
  code: 'LOOP',
  active: true,
  moulded: true,
  cyclic_min: 5,
  cavities: 4,
  pack_size: 50,
  piece_kg: 0.4,
  compound_rate: 30,
};

const MACHINE = {
  id: 'SLEEVE',
  name: 'Sleeve',
  short: 'Sleeve',
  kind: 'sleeve',
  group_name: 'Sleeve & Loop',
  enabled: true,
  sort_order: 17,
};

/** A sleeve lot that has stopped with its pieces counted and nothing boxed. */
const LOT_RUN = {
  id: 'run-sleeve-1',
  kind: 'sleeve',
  line: 'sleeve',
  machine_id: 'SLEEVE',
  machine: 'Sleeve',
  batch_no: '03/Aug/26-day',
  product: 'SLEVE',
  shift_date: '2026-08-03',
  shift: 'Day',
  started_at: '2026-08-03T09:00:00Z',
  ended_at: '2026-08-03T17:00:00Z',
  runtime_min: 480,
  cyclic_min: 5,
  cavities: 4,
  pieces: 380,
  pieces_expected: 384,
  packed_pieces: null,
  weight_kg: 95,
  flash_kg: 4,
  workers: 2,
  labour_rate: 60,
  compound_rate: 30,
};

/**
 * record_packed_stock() as far as these tests care - the same stub the moulded
 * stock tests use. The `on conflict` half is what makes a second boxing of the
 * same lot append to it rather than open a second row.
 */
const recordPackedStock = () => (args, store) => {
  const rows = (store.stock_groups ||= []);
  const existing = rows.find((row) => row.label === args.p_label);

  if (existing) {
    existing.packed_sacks += args.p_delta ?? 0;
    existing.available_sacks = existing.packed_sacks - (existing.dispatched_sacks ?? 0);
    existing.product_id ??= args.p_product_id ?? null;
    existing.pack_size ??= args.p_pack_size ?? null;
    if (args.p_kg_per_unit > 0) existing.kg_per_unit = args.p_kg_per_unit;
    if (args.p_qc_status && existing.qc_status === 'pending') {
      existing.qc_status = args.p_qc_status;
      existing.qc_source = 'lab';
    }
    return existing;
  }

  const packed = Math.max(args.p_delta ?? 0, 0);
  const row = {
    id: `group-${rows.length + 1}`,
    kind: args.p_kind,
    label: args.p_label,
    quality: args.p_quality,
    packed_sacks: packed,
    dispatched_sacks: 0,
    available_sacks: packed,
    qc_status: args.p_qc_status ?? 'pending',
    unit: args.p_unit ?? 'sacks',
    product_id: args.p_product_id ?? null,
    pack_size: args.p_pack_size ?? null,
    kg_per_unit: args.p_kg_per_unit ?? 0,
    first_packed_on: args.p_packed_on ?? null,
    last_packed_on: args.p_packed_on ?? null,
    qc_source: args.p_qc_status ? 'lab' : null,
    created_at: '2026-08-03T12:00:00Z',
  };
  rows.push(row);
  return row;
};

const bootWith = (tables = {}) =>
  startApi({
    tables: {
      stock_groups: [],
      quality_tests: [],
      machines: [{ ...MACHINE }, { ...MACHINE, id: 'LOOP', name: 'Loop', kind: 'loop' }],
      products: [{ ...PRODUCT }, { ...LOOP }],
      runs: [],
      ...tables,
    },
    functions: { record_packed_stock: recordPackedStock() },
  });

// ---------------------------------------------------------------------------
// the number
// ---------------------------------------------------------------------------

test('a batch number is the shift date and the shift, and nothing else', () => {
  assert.equal(mouldingBatchNo({ shiftDate: '2026-08-03', shift: 'Day' }), '03/Aug/26-day');
  assert.equal(mouldingBatchNo({ shiftDate: '2026-08-03', shift: 'Night' }), '03/Aug/26-night');
});

test('the product is not in the number - two benches on one shift share it', () => {
  // The point of taking it out. One string used to carry two facts and every
  // reader had to split it apart to get either; now the number names the shift
  // and the product is the column beside it. What that costs is exactly this,
  // and the composite key below is what pays for it.
  assert.equal(
    mouldingBatchNo({ shiftDate: '2026-08-03', shift: 'Day' }),
    mouldingBatchNo({ shiftDate: '2026-08-03', shift: 'day' }),
  );
});

test('the date is read by hand, so a lot never lands on the day before', () => {
  // `new Date('2026-03-01')` is UTC midnight and reads as February to anyone
  // west of Greenwich, which would put a whole shift into the previous month's
  // series. Parsed by hand, the 1st is the 1st everywhere.
  assert.equal(mouldingBatchNo({ shiftDate: '2026-03-01', shift: 'Day' }), '01/Mar/26-day');
});

test('no date or no shift, no number - and nothing is filed unnamed', () => {
  assert.equal(mouldingBatchNo({ shiftDate: '', shift: 'Day' }), '');
  assert.equal(mouldingBatchNo({ shiftDate: '2026-08-03', shift: '' }), '');
  assert.equal(mouldingBatchNo({ shiftDate: 'not-a-date', shift: 'Day' }), '');
});

test('the server generates the number, and ignores one the tablet sent', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  const run = await runService.start({
    machineId: 'SLEEVE',
    product: 'SLEVE',
    shiftDate: '2026-08-03',
    shift: 'Day',
    // A tablet that has gone stale, or one being clever. Either way this is not
    // where a lot gets its name.
    batchNo: 'SOMETHING-ELSE',
  });

  assert.equal(run.batch_no, '03/Aug/26-day');
  assert.equal(run.kind, 'sleeve');
  assert.equal(run.line, 'sleeve', 'each activity is its own line, so they read apart');
  assert.equal(run.needs_weigh, false, 'weighed at the bench and entered at stop');
  // The curing settings and the labour rate are snapshots off the product and
  // the rate card, so a master edited next month does not rewrite this run.
  assert.equal(run.cyclic_min, 5);
  assert.equal(run.cavities, 4);
});

// ---------------------------------------------------------------------------
// one lot per product per shift
// ---------------------------------------------------------------------------

test('a second run of the same product in the same shift joins the same lot', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  const second = await runService.start({
    machineId: 'SLEEVE',
    product: 'SLEVE',
    shiftDate: '2026-08-03',
    shift: 'Day',
  });
  assert.equal(second.batch_no, '03/Aug/26-day', 'the same number, not a second one');

  const merged = await runService.stop(second.id, { pieces: 120, outWeight: 30, workers: 2 });

  assert.equal(merged.id, LOT_RUN.id, 'folded into the record the shift already had');
  assert.equal(merged.merged_from, second.id, 'and the tablet is told which row went');
  assert.equal(merged.passes, 2, 'two start/stops, one lot');
  assert.equal(merged.pieces, 500, '380 on the first start, 120 on the second');
  assert.equal(merged.weight_kg, 125);
  assert.equal(merged.batch_no, '03/Aug/26-day');
});

test('a different shift is a different lot', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  const night = await runService.start({
    machineId: 'SLEEVE',
    product: 'SLEVE',
    shiftDate: '2026-08-03',
    shift: 'Night',
  });
  assert.equal(night.batch_no, '03/Aug/26-night');

  const stopped = await runService.stop(night.id, { pieces: 200, outWeight: 50 });
  assert.equal(stopped.id, night.id, 'its own record - the day shift is not its lot');
  assert.equal(stopped.merged_from, undefined);
});

test('a lot folds what both starts made, and keeps the number it opened with', () => {
  // Asserted on mergePatch directly as well, because this is the arithmetic and
  // the round trip above cannot show that a leg with nothing measurable against
  // it contributes nothing rather than dragging the total to null.
  const merged = mergePatch(
    { passes: 1, pieces: 380, pieces_expected: 384, flash_kg: 4, batch_no: '03/Aug/26-day' },
    { batch_no: '03/Aug/26-day' },
    { ended_at: '2026-08-03T20:30:00Z', pieces: 120, pieces_expected: null, flash_kg: 1 },
  );
  assert.equal(merged.pieces, 500);
  assert.equal(merged.pieces_expected, 384, 'a leg with no cycle measured adds nothing');
  assert.equal(merged.flash_kg, 5);
  assert.equal(merged.batch_no, '03/Aug/26-day');
});

// ---------------------------------------------------------------------------
// the expected count, and the flag
// ---------------------------------------------------------------------------

test('the expected count is whole cycles times the mould, or nothing at all', () => {
  assert.equal(expectedPieces({ runtimeMin: 480, cyclicMin: 5, cavities: 4 }), 384);
  // A run stopped two thirds of the way through a cycle has an unfinished piece
  // in the mould, not two thirds of one.
  assert.equal(expectedPieces({ runtimeMin: 483, cyclicMin: 5, cavities: 4 }), 384);
  // Null, not zero: "nothing was expected" and "we have no way to say what was
  // expected" are different, and only the second is true of an unmeasured item.
  assert.equal(expectedPieces({ runtimeMin: 480, cyclicMin: null, cavities: 4 }), null);
  assert.equal(expectedPieces({ runtimeMin: 480, cyclicMin: 5, cavities: null }), null);
});

test('a run states its variance, and whether it is wide enough to look at', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  const run = await runService.findById(LOT_RUN.id);
  // 380 counted against 384 expected is about one per cent short - an ordinary
  // shift, and flagging it would make the flag meaningless.
  assert.equal(run.pieces_variance_pct, variancePct(380, 384));
  assert.equal(run.pieces_flagged, false);

  const short = await runService.edit(LOT_RUN.id, { pieces: 300 });
  assert.equal(short.pieces_flagged, true, '300 against 384 is a mould running short all shift');
  assert.ok(short.pieces_variance_pct < 0, 'and the sign says which way');
});

test('labour on a lot is the crew, the hours and the rate of the day', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  const run = await runService.findById(LOT_RUN.id);
  // Two hands for eight booked hours at sixty an hour. The rate is the run's own
  // snapshot, so a raise entered next month leaves this shift where it is.
  assert.equal(run.labour_hours, 16);
  assert.equal(run.labour_cost, 960);
});

// ---------------------------------------------------------------------------
// the yard
// ---------------------------------------------------------------------------

test('a lot is keyed on the product and the shift together, and a press is not', () => {
  const lot = targetOf({ kind: 'lot', batchNo: '03/Aug/26-day', productId: 'SLEVE' });
  assert.equal(lot.kind, 'lot');
  assert.equal(lot.label, 'SLEVE-03/Aug/26-day', 'both halves, in one key');
  assert.equal(lot.quality, 'SLEVE', 'the product, which is what the lab answers on');

  // The other bench, same shift, same number. Two lots, and the only thing
  // keeping them apart is that the product is in the key.
  const loop = targetOf({ kind: 'lot', batchNo: '03/Aug/26-day', productId: 'LOOP' });
  assert.notEqual(loop.label, lot.label, 'one shift, two products, two groups');

  // The press's group, for contrast: keyed on the product and the pack, so every
  // shift of it pools into one row.
  const press = targetOf({ kind: 'product', productId: 'LOOP', packSize: 50 });
  assert.equal(press.label, 'LOOP-50');

  // Either half missing is nothing to file under, and it says so rather than
  // inventing a label. A lot keyed on the number alone would take in whatever
  // the other bench made that shift.
  assert.equal(targetOf({ kind: 'lot', productId: 'SLEVE' }), null);
  assert.equal(targetOf({ kind: 'lot', batchNo: '03/Aug/26-day' }), null);
});

test('boxing a lot files pieces into its own group, awaiting the lab', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  const boxed = await runService.pack(LOT_RUN.id, { pieces: 380 });
  assert.equal(boxed.packed_pieces, 380);
  assert.equal(boxed.stock_filed, true);

  const { rows } = await stockService.list();
  assert.equal(rows.length, 1);
  const [group] = rows;
  assert.equal(group.kind, 'lot');
  assert.equal(group.label, 'SLEVE-03/Aug/26-day');
  assert.equal(group.unit, 'pieces', 'a sleeve is a sleeve, not a fraction of a sack');
  assert.equal(group.available_qty, 380);
  assert.equal(group.product_id, 'SLEVE');
  assert.equal(group.qc_status, 'pending', 'there is a lot here, and the bench can test it');
  assert.equal(group.available_kg, 95, '380 at a quarter kilo each');
});

test('boxing the same lot again moves it by the difference, not by the total', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  await runService.pack(LOT_RUN.id, { pieces: 300 });
  await runService.pack(LOT_RUN.id, { pieces: 380 });

  const { rows } = await stockService.list();
  assert.equal(rows.length, 1, 'one lot, corrected - not two');
  assert.equal(rows[0].available_qty, 380, 'the correction, not 680');
});

test('a lot cannot be bagged in sacks, and more cannot be boxed than was made', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  await assert.rejects(() => runService.pack(LOT_RUN.id, { sacks: 4 }), /boxed by the piece/);
  await assert.rejects(() => runService.pack(LOT_RUN.id, { pieces: 500 }), /moulded 380 pieces/);
});

// ---------------------------------------------------------------------------
// the verdict
// ---------------------------------------------------------------------------

test('a lab pass releases that lot alone', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  // Two lots of the same product, in the yard together. This is the case a
  // press's product-wide verdict cannot serve.
  await runService.pack(LOT_RUN.id, { pieces: 380 });
  await stockService.recordPacking({
    kind: 'lot',
    batchNo: '04/Aug/26-day',
    productId: 'SLEVE',
    quality: 'SLEVE',
    delta: 200,
    packedOn: '2026-08-04',
  });

  const filed = await qualityService.record({
    kind: 'lot',
    batchNo: '03/Aug/26-day',
    grade: 'SLEVE',
    verdict: 'pass',
    testedBy: 'Lab',
  });
  assert.equal(filed.stock_released?.label, 'SLEVE-03/Aug/26-day');

  const { rows } = await stockService.list();
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
  assert.equal(byLabel['SLEVE-03/Aug/26-day'].qc_status, 'pass');
  assert.equal(
    byLabel['SLEVE-04/Aug/26-day'].qc_status,
    'pending',
    'the next shift is a different lot and is not released with it',
  );
});

test('sleeve and loop on one shift are two lots, and one verdict moves one', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  /*
   * The case the whole composite key exists for.
   *
   * Both benches worked 03 Aug day, so both lots carry `03/Aug/26-day` - the
   * number no longer says which is which. Keyed on it alone the loop bench's
   * pieces would be boxed into the sleeve bench's row, and the pass below would
   * certify goods nobody tested.
   */
  await runService.pack(LOT_RUN.id, { pieces: 380 });
  await stockService.recordPacking({
    kind: 'lot',
    batchNo: '03/Aug/26-day',
    productId: 'LOOP',
    quality: 'LOOP',
    delta: 240,
    packedOn: '2026-08-03',
  });

  const { rows } = await stockService.list();
  assert.equal(rows.length, 2, 'one shift, two products, two rows');
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
  assert.equal(byLabel['SLEVE-03/Aug/26-day'].available_qty, 380);
  assert.equal(byLabel['LOOP-03/Aug/26-day'].available_qty, 240, 'not added to the sleeve lot');

  const filed = await qualityService.record({
    kind: 'lot',
    batchNo: '03/Aug/26-day',
    grade: 'SLEVE',
    verdict: 'pass',
    testedBy: 'Lab',
  });
  assert.equal(filed.stock_released?.label, 'SLEVE-03/Aug/26-day');

  const after = Object.fromEntries((await stockService.list()).rows.map((row) => [row.label, row]));
  assert.equal(after['SLEVE-03/Aug/26-day'].qc_status, 'pass');
  assert.equal(
    after['LOOP-03/Aug/26-day'].qc_status,
    'pending',
    'the other bench shares the number and is not released by it',
  );
});

test('a lot verdict missing either half of its key moves nothing', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  await runService.pack(LOT_RUN.id, { pieces: 380 });

  // The validator refuses a lot test with no number, so this is the other side
  // of the same rule: applyLabVerdict() will not guess at a lot from one half.
  const released = await stockService.applyLabVerdict({
    kind: 'lot',
    batchNo: '03/Aug/26-day',
    quality: '',
    verdict: 'pass',
  });
  assert.equal(released, null, 'no product, no lot - and nothing is released on a guess');

  const { rows } = await stockService.list();
  assert.equal(rows[0].qc_status, 'pending');
});

test('a hold stops the lot it names, and nothing else', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  await runService.pack(LOT_RUN.id, { pieces: 380 });
  const filed = await qualityService.record({
    kind: 'lot',
    batchNo: '03/Aug/26-day',
    grade: 'SLEVE',
    verdict: 'hold',
    testedBy: 'Lab',
  });

  assert.equal(filed.stock_released?.qc_status, 'fail', 'the yard has no state between the two');
});

test('a lot boxed after the bench has answered opens on that answer', async (t) => {
  const api = await bootWith({
    runs: [{ ...LOT_RUN }],
    quality_tests: [
      {
        id: 'qt-1',
        kind: 'lot',
        batch_no: '03/Aug/26-day',
        quality: 'SLEVE',
        verdict: 'pass',
        ts: '2026-08-03T18:00:00Z',
      },
    ],
  });
  t.after(() => api.stop());

  // The group is created once. Boxed the next morning after the bench has been
  // round, it would otherwise be created `pending` with a passed test sitting
  // beside it and nothing that would ever reconcile the two.
  await runService.pack(LOT_RUN.id, { pieces: 380 });
  const { rows } = await stockService.list();
  assert.equal(rows[0].qc_status, 'pass');
});

// ---------------------------------------------------------------------------
// corrections
// ---------------------------------------------------------------------------

test('a lot whose pieces are in the yard cannot be moved out from under them', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN, packed_pieces: 380 }] });
  t.after(() => api.stop());

  // The product, the date and the shift *are* the lot, so correcting any of them
  // moves it - and the boxed pieces are standing under the old key. Refused
  // rather than silently orphaning them, which is the one shape of error that is
  // invisible from both ends.
  await assert.rejects(
    () => runService.edit(LOT_RUN.id, { shiftDate: '2026-08-04' }),
    /already boxed/,
  );

  // The product is the half that is not in the number, so this is the case a
  // guard watching the batch string would let straight through: the row would
  // read `03/Aug/26-day` before and after, and 380 sleeves would be left in a
  // group nothing points at.
  await assert.rejects(() => runService.edit(LOT_RUN.id, { product: 'LOOP' }), /already boxed/);
});

test('a lot with nothing boxed is renumbered when its shift is corrected', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  const moved = await runService.edit(LOT_RUN.id, { shift: 'Night' });
  assert.equal(moved.batch_no, '03/Aug/26-night', 'the number follows the lot');
});

test('a batch number typed into a correction is dropped', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  const same = await runService.edit(LOT_RUN.id, { batchNo: 'MADE-UP', remarks: 'second mould short' });
  assert.equal(same.batch_no, '03/Aug/26-day', 'generated, never typed');
  assert.equal(same.remarks, 'second mould short', 'and the rest of the correction still lands');
});

test('deleting a lot takes its pieces back out of the yard', async (t) => {
  const api = await bootWith({ runs: [{ ...LOT_RUN }] });
  t.after(() => api.stop());

  await runService.pack(LOT_RUN.id, { pieces: 380 });
  const removed = await runService.discard(LOT_RUN.id);

  assert.equal(removed.stock_cleared?.taken, 380);
  assert.equal(removed.stock_cleared?.removed, true, 'the group was only ever this run');
  assert.equal(removed.stock_note, null);
});
