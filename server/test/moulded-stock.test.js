import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';
import { stockService } from '../src/services/stock.service.js';
import { runService } from '../src/services/run.service.js';

/**
 * What the presses make, and how it reaches the yard.
 *
 * A moulding press turns reclaim compound into finished goods and counts them
 * one at a time. Until this existed that count stopped at the run: nothing filed
 * the pieces anywhere, so the Stock page - which is meant to be every packed
 * thing standing in the plant - could not see a shift's moulding at all. The
 * yard could be holding four thousand loops and the screen said nothing.
 *
 * Three things are worth pinning down here, and each of them is a rule that
 * would be invisible if it broke.
 *
 *   the unit    a moulded group is counted in pieces and a bagged one in sacks,
 *               in the same column. `unit` is the only thing standing between
 *               "4,000 loops" and a screen that reads four thousand sacks.
 *   the pack    the pack size is read off the product on the server and never
 *               taken from the request, the same way a coarse pool's period is
 *               worked out from the packing date. A client that could name its
 *               own pack could file a hundred loose pieces as two packs of
 *               fifty.
 *   the verdict boxed pieces open `pending` and are released by the lab, not by
 *               being packed - which is the opposite of a coarse pool, and the
 *               difference is that a press run has a lot the bench can test.
 */

const PRODUCT = {
  id: 'LOOP',
  name: 'Loop',
  active: true,
  pack_size: 50,
  pack_label: 'bag of 50',
  piece_kg: 0.4,
  compound_rate: 30,
};

/** A press run that has stopped with its pieces counted and nothing boxed. */
const PRESS_RUN = {
  id: 'run-press-1',
  kind: 'press',
  line: 'press',
  machine_id: 'PRS_P3',
  machine: 'Press 3',
  batch_no: 'B2200',
  product: 'LOOP',
  shift_date: '2026-08-07',
  shift: 'Day',
  started_at: '2026-08-07T09:00:00Z',
  ended_at: '2026-08-07T17:00:00Z',
  pieces: 4000,
  packed_pieces: null,
  weight_kg: 1600,
  flash_kg: 40,
  compound_rate: 30,
};

/**
 * record_packed_stock() as far as these tests care: it files what it is given,
 * carrying the columns 0005 added. The `on conflict` half is what makes a
 * correction move the group by the difference rather than filing twice.
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
    if (args.p_packed_on) {
      existing.first_packed_on = [existing.first_packed_on, args.p_packed_on]
        .filter(Boolean)
        .sort()[0];
      existing.last_packed_on = [existing.last_packed_on, args.p_packed_on]
        .filter(Boolean)
        .sort()
        .pop();
    }
    if (args.p_qc_status && existing.qc_status === 'pending') {
      existing.qc_status = args.p_qc_status;
      existing.qc_by = args.p_qc_by ?? null;
      existing.qc_at = '2026-08-07T12:00:00Z';
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
    period_start: args.p_period_start ?? null,
    period_end: args.p_period_end ?? null,
    unit: args.p_unit ?? 'sacks',
    product_id: args.p_product_id ?? null,
    pack_size: args.p_pack_size ?? null,
    kg_per_unit: args.p_kg_per_unit ?? 0,
    first_packed_on: args.p_packed_on ?? null,
    last_packed_on: args.p_packed_on ?? null,
    qc_by: args.p_qc_status ? (args.p_qc_by ?? null) : null,
    qc_at: args.p_qc_status ? '2026-08-07T12:00:00Z' : null,
    qc_source: args.p_qc_status ? 'lab' : null,
    created_at: '2026-08-07T12:00:00Z',
  };
  rows.push(row);
  return row;
};

const bootWith = (tables = {}) =>
  startApi({
    tables: {
      stock_groups: [],
      quality_tests: [],
      products: [{ ...PRODUCT }],
      runs: [{ ...PRESS_RUN }],
      ...tables,
    },
    functions: { record_packed_stock: recordPackedStock() },
  });

const groupOf = (api, label) => api.tables.stock_groups.find((row) => row.label === label);

test('boxing a press run files a moulded group, counted in pieces', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  const saved = await runService.pack(PRESS_RUN.id, { pieces: 4000 });
  assert.equal(saved.packed_pieces, 4000, 'the run remembers how much of it has been boxed');

  const group = groupOf(api, 'LOOP-50');
  assert.ok(group, 'the group is keyed on the product and the pack it is boxed in');
  assert.equal(group.kind, 'product');
  assert.equal(group.unit, 'pieces', 'the count is pieces, not sacks');
  assert.equal(group.packed_sacks, 4000);
  assert.equal(group.pack_size, 50, 'the pack is read off the product, never sent');
  assert.equal(group.kg_per_unit, 0.4);
  assert.equal(group.product_id, 'LOOP');
  assert.equal(group.first_packed_on, '2026-08-07', 'and the day it was boxed is on the row');
});

test('boxed pieces wait for the lab - unlike a coarse pool, there is a lot to test', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 4000 });

  assert.equal(
    groupOf(api, 'LOOP-50').qc_status,
    'pending',
    'a press moulds a batch of compound, so there is something for the bench to certify',
  );
});

test('a product with no pack size set is the product on its own', async (t) => {
  const api = await bootWith({
    products: [{ ...PRODUCT, pack_size: null, pack_label: null, piece_kg: null }],
  });
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 120 });

  // A real state, not an error: the presses run whether or not the back office
  // has filled the field in, and stranding a shift's moulding for want of a
  // settings row would be the worse failure. The label is what the floor reads
  // off a pallet, so it names the goods; the screens carry "boxed loose" on the
  // line beneath, which is where a note about an unfilled field belongs.
  const group = groupOf(api, 'LOOP');
  assert.ok(group, 'loose pieces get their own group rather than an invented pack');
  assert.equal(group.pack_size, null);
  assert.equal(group.kg_per_unit, 0, 'and no piece weight means no weight, not a guessed one');

  const row = await stockService.findById(group.id);
  assert.equal(row.available_packs, null, 'a pack count off an unset field is a number nobody entered');
  assert.equal(row.available_kg, null);
});

/**
 * Setting the pack later does not fold the loose pieces into it.
 *
 * That is what the `-LOOSE` suffix was guarding, and dropping it changes
 * nothing: `LOOP` and `LOOP-50` are two labels and `label` is unique, so they
 * are two rows. A yard that pooled both could not say how many of either it
 * held.
 */
test('loose pieces and a pack set later stay two groups', async (t) => {
  const api = await bootWith({
    products: [{ ...PRODUCT, pack_size: null, piece_kg: null }],
  });
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 120 });
  assert.equal(groupOf(api, 'LOOP').packed_sacks, 120);

  // The back office fills the pack in, and the bench boxes the rest.
  api.tables.products[0].pack_size = 50;
  await runService.pack(PRESS_RUN.id, { pieces: 4000 });

  assert.equal(groupOf(api, 'LOOP').packed_sacks, 120, 'the loose row is left where it was');
  assert.equal(groupOf(api, 'LOOP-50').packed_sacks, 3880, 'and the pack gets the change');
});

test('re-boxing sends the change, not the count again', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 3000 });
  assert.equal(groupOf(api, 'LOOP-50').packed_sacks, 3000);

  // The bench found another box. Sending the total again would file 3,000 of
  // them twice and leave the yard holding stock the plant never made.
  await runService.pack(PRESS_RUN.id, { pieces: 4000 });
  assert.equal(groupOf(api, 'LOOP-50').packed_sacks, 4000, 'the group moves by the difference');

  // And a correction downwards takes them back off.
  await runService.pack(PRESS_RUN.id, { pieces: 3500 });
  assert.equal(groupOf(api, 'LOOP-50').packed_sacks, 3500);
});

test('boxing more than the press moulded is refused', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await assert.rejects(
    () => runService.pack(PRESS_RUN.id, { pieces: 4500 }),
    /moulded 4000 pieces/,
    'a count above what came off the press is a mis-key, not a discovery',
  );
  assert.equal(api.tables.stock_groups.length, 0, 'and nothing is filed');
});

/**
 * `runs.product` holds the product's id, and holding anything else breaks the
 * whole path silently.
 *
 * It is a key, not a caption. The yard files moulded stock under it,
 * `stock_groups.product_id` is a foreign key to `products.id`, and the lab's
 * verdict on what a press moulded is addressed by it. It held the product's
 * *name* until this was fixed, which read better on a card and matched nothing:
 * productOf() found no product, so the pack and the piece weight were lost, and
 * the group was filed against a value the products table had never heard of -
 * which the foreign key refuses, so nothing reached the yard or the bench at
 * all. Every failure on that path is caught and logged rather than raised at
 * the crew, so it looked from the tablet exactly like it had worked.
 */
test('a press run is filed against the product id, not the name on the card', async (t) => {
  const api = await bootWith({
    machines: [{ id: 'PRS_P3', name: 'Press 3', kind: 'press' }],
    runs: [],
  });
  t.after(() => api.stop());

  const run = await runService.start({
    machineId: 'PRS_P3',
    product: 'LOOP',
    shiftDate: '2026-08-07',
    shift: 'Day',
  });

  assert.equal(run.product, 'LOOP', 'the id, which is what the yard and the bench key on');
  assert.notEqual(run.product, 'Loop', 'and not the name, which is a caption and matches nothing');
});

/**
 * Boxing that did not reach the yard says so.
 *
 * Filing the stock is deliberately not allowed to fail the request - the run is
 * saved and the group is a derived ledger that boxing again puts right - but
 * that was being read as "say nothing", and the bench got a toast reading
 * "→ Stock · awaiting QC" over a yard holding none of it. A project without
 * migration 0005 is exactly that case and it ran for days looking like it
 * worked.
 */
test('boxing that never reached the yard is reported, not dressed as a success', async (t) => {
  const api = await startApi({
    tables: { stock_groups: [], quality_tests: [], products: [{ ...PRODUCT }], runs: [{ ...PRESS_RUN }] },
    // No record_packed_stock - a project that has not run 0005 has no way to
    // hold moulded stock at all.
    functions: {},
  });
  t.after(() => api.stop());

  const saved = await runService.pack(PRESS_RUN.id, { pieces: 4000 });

  assert.equal(saved.packed_pieces, 4000, 'the count is still recorded on the run');
  assert.equal(saved.stock_filed, false, 'but the bench is told it did not reach the yard');
  assert.match(saved.stock_note, /did not reach the yard/);
  assert.equal(api.tables.stock_groups.length, 0);
});

test('boxing that did reach the yard says so plainly', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  const saved = await runService.pack(PRESS_RUN.id, { pieces: 4000 });
  assert.equal(saved.stock_filed, true);
  assert.equal(saved.stock_note, null);
});

test('a run written with the product name still files against the id', async (t) => {
  // Rows already on the table from before the fix, with pieces on them nobody
  // has boxed yet. Read as an id the name finds nothing, and the pieces would
  // box loose under a label the products table does not know.
  const api = await bootWith({ runs: [{ ...PRESS_RUN, product: 'Loop' }] });
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 4000 });

  const group = groupOf(api, 'LOOP-50');
  assert.ok(group, 'the legacy name is resolved back to the product it names');
  assert.equal(group.product_id, 'LOOP', 'so the group satisfies the foreign key');
  assert.equal(group.quality, 'LOOP', 'and the lab addresses its verdict by the same id');
  assert.equal(group.pack_size, 50, 'the pack is found rather than lost');
  assert.equal(group.kg_per_unit, 0.4);
});

/**
 * The two benches cannot be crossed.
 *
 * A press run has no weight to divide into sacks and a refiner run has no
 * pieces, so a count entered against the wrong field is a count somebody
 * believes was recorded. Refused rather than ignored, which is the difference
 * between an error message and stock quietly missing from the yard.
 */
test('a press cannot be bagged in sacks, and a bagged run cannot be boxed', async (t) => {
  const api = await bootWith({
    runs: [
      { ...PRESS_RUN },
      {
        id: 'run-r4-1',
        kind: 'refiner',
        line: 'special',
        machine_id: 'R4',
        batch_no: 'B1041',
        quality: 'Fine',
        shift_date: '2026-08-07',
        shift: 'Day',
        started_at: '2026-08-07T09:00:00Z',
        ended_at: '2026-08-07T17:00:00Z',
        weight_kg: 500,
      },
    ],
  });
  t.after(() => api.stop());

  await assert.rejects(
    () => runService.pack(PRESS_RUN.id, { sacks: 10 }),
    /boxed by the piece/,
  );
  await assert.rejects(
    () => runService.pack('run-r4-1', { pieces: 10 }),
    /boxed by the piece/,
  );

  // And the bagging line still works exactly as it did - one route now serves
  // two benches, and the older of the two is the one with years of use behind
  // it. 500 kg is ten sacks, with nothing left to carry forward.
  const bagged = await runService.pack('run-r4-1', { sacks: 10 });
  assert.equal(bagged.packed_sacks, 10);
  assert.equal(bagged.leftout_out, 0);

  const group = groupOf(api, 'B1041-Fine');
  assert.ok(group, 'filed against its batch and grade');
  assert.equal(group.unit, 'sacks');
  assert.equal(group.packed_sacks, 10);
  assert.equal(group.kg_per_unit, 50, 'a sack is fifty kilos, as it always was');
  assert.equal(group.qc_status, 'pending', 'and it waits for the lab');
});

/**
 * The lab's verdict on what a press made.
 *
 * The bench tests loops rather than a grade of rubber, so the test names the
 * product and the batch of compound the press was running - and the group it
 * releases is keyed on the product, because that is what a moulded group is
 * keyed on. Every pack of that product moves together, which is the cost of
 * grouping moulded stock by product and pack: it is the safe direction to be
 * wrong in, since it holds stock rather than releasing it.
 */
test('a moulded verdict releases that product and signs the row', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 4000 });
  assert.equal(groupOf(api, 'LOOP-50').qc_status, 'pending');

  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: {
      kind: 'product',
      batchNo: 'B2200',
      grade: 'LOOP',
      verdict: 'pass',
      testedBy: 'anitha',
    },
  });
  assert.equal(res.status, 201, await res.text());

  const group = groupOf(api, 'LOOP-50');
  assert.equal(group.qc_status, 'pass');
  /*
   * The account that filed the verdict, and not the name on the test.
   *
   * This assertion used to read `qc_by === 'anitha'`, and it passed here for the
   * only reason a wrong assertion ever passes: the stub is not Postgres and has
   * no foreign keys. `stock_groups.qc_by` references `users`, so against the
   * real database the name was refused - and because that refusal came out of
   * the same statement that sets `qc_status`, it did not lose the signature, it
   * lost the release. Every verdict the lab filed left the yard untouched.
   *
   * So the column holds the account, which is what the back office's own path
   * through PATCH /stock/:id/qc has always written into it. `anitha` is a person
   * at a bench rather than a login, and she stays on the test row, which is
   * where the Stock card reads the tester from.
   */
  assert.equal(group.qc_by, 'user-lab', 'the account that signed, which is what the column references');
  assert.equal(group.qc_source, 'lab', 'and it is marked as having a test behind it');
  assert.ok(group.qc_at, 'with the moment it happened');

  const test = api.tables.quality_tests.at(-1);
  assert.equal(test.tester, 'anitha', 'the bench’s own name is kept, on the row that is free text');
});

test('a hold on a moulded product blocks it rather than releasing it', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 4000 });
  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { kind: 'product', batchNo: 'B2200', grade: 'LOOP', verdict: 'hold' },
  });
  assert.equal(res.status, 201, await res.text());

  assert.equal(groupOf(api, 'LOOP-50').qc_status, 'fail');
});

/**
 * A verdict filed against a product nobody has boxed yet moves nothing, and that
 * is correct rather than a failure - a verdict releases stock that exists, it
 * does not create any. The API says which happened, because a write that
 * succeeded and looked like nothing is the fault this reporting closes.
 */
test('a verdict on unboxed goods releases nothing and says so', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  const res = await api.call('/quality-tests', {
    method: 'POST',
    role: 'lab',
    body: { kind: 'product', batchNo: 'B2200', grade: 'LOOP', verdict: 'pass' },
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.stock_released, null);
});

/**
 * The back office setting a verdict by hand is signed too, and marked apart.
 *
 * This is the one path onto `qc_status` with no test row behind it. Without the
 * account on the row there is no record at all of who released the goods, and it
 * is precisely the write somebody eventually asks that about.
 */
test('a verdict set by hand records the account that set it, marked manual', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  await runService.pack(PRESS_RUN.id, { pieces: 4000 });
  const group = groupOf(api, 'LOOP-50');

  const res = await api.call(`/stock/${group.id}/qc`, {
    method: 'PATCH',
    role: 'manager',
    body: { qc_status: 'pass' },
  });
  assert.equal(res.status, 200, await res.text());

  const saved = groupOf(api, 'LOOP-50');
  assert.equal(saved.qc_status, 'pass');
  assert.equal(saved.qc_source, 'manual', 'told apart from a verdict the bench filed');
  assert.ok(saved.qc_by, 'and signed by the account that set it');
  assert.ok(saved.qc_at);
});

// ---------------------------------------------------------------------------
// Selling it
// ---------------------------------------------------------------------------

const MOULDED = {
  id: '66666666-6666-4666-8666-666666666666',
  kind: 'product',
  label: 'LOOP-50',
  quality: 'LOOP',
  product_id: 'LOOP',
  unit: 'pieces',
  pack_size: 50,
  kg_per_unit: 0.4,
  packed_sacks: 4000,
  dispatched_sacks: 0,
  available_sacks: 4000,
  qc_status: 'pass',
  first_packed_on: '2026-08-07',
  last_packed_on: '2026-08-07',
  created_at: '2026-08-07T12:00:00Z',
};

const CUSTOMER_ID = '77777777-7777-4777-8777-777777777777';

/**
 * post_dispatch() as far as these tests care: the refusals, the draw-down and
 * the unit copied off the group onto the line.
 *
 * The unit check is the one worth modelling rather than assuming. The price on
 * a line was typed per whatever the form thought it was selling, so a request
 * that names the wrong unit is refused rather than corrected - correcting it
 * would put moulded goods out at a sack rate and the document would look right.
 */
const postDispatch = () => (args, store) => {
  const groups = (store.stock_groups ||= []);
  const lines = (store.dispatch_lines ||= []);
  (store.dispatches ||= []).push({ id: args.p_id, customer_id: args.p_customer_id });

  const raise = (marker, label) => {
    const err = new Error(`${marker}:${label}`);
    err.pgCode = 'P0001';
    throw err;
  };

  let goods = 0;
  for (const line of args.p_lines) {
    const group = groups.find((g) => g.id === line.stock_group_id);
    if (!group) raise('STOCK_MISSING', line.stock_group_id);
    if (group.qc_status !== 'pass') raise('STOCK_QC', group.label);
    if (line.unit != null && line.unit !== group.unit) raise('STOCK_UNIT', group.label);
    if (group.packed_sacks - group.dispatched_sacks < line.sacks) raise('STOCK_SHORT', group.label);

    group.dispatched_sacks += line.sacks;
    group.available_sacks = group.packed_sacks - group.dispatched_sacks;
    lines.push({
      id: `line-${lines.length + 1}`,
      dispatch_id: args.p_id,
      stock_group_id: group.id,
      quality: line.quality ?? group.quality,
      sacks: line.sacks,
      // Written from the group, never from the request.
      unit: group.unit,
      unit_price: line.unit_price,
      line_total: line.sacks * line.unit_price,
    });
    goods += line.sacks * line.unit_price;
  }

  return { id: args.p_id, lines: args.p_lines.length, goods_total: goods, total: goods };
};

const sellingApi = (group = MOULDED) =>
  startApi({
    tables: {
      stock_groups: [{ ...group }],
      dispatches: [],
      dispatch_lines: [],
      products: [{ ...PRODUCT }],
    },
    functions: { post_dispatch: postDispatch() },
  });

/** A moulded document: pieces on the line, and a price per piece. */
const sellBody = (qty, extra = {}) => ({
  customer_id: CUSTOMER_ID,
  dispatch_date: '2026-08-15',
  transport_provided: false,
  transport_charge: 0,
  lines: [{ stock_group_id: MOULDED.id, qty, unit: 'pieces', ...extra }],
  prices: { LOOP: 12 },
});

test('moulded goods are dispatched by the piece, priced per piece', async (t) => {
  const api = await sellingApi();
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { method: 'POST', role: 'manager', body: sellBody(500) });
  assert.equal(res.status, 201);

  const doc = (await res.json()).data;
  assert.equal(doc.pieces, 500, 'counted as pieces');
  assert.equal(doc.sacks, 0, 'and not folded into the sack count, which counts sacks');
  assert.equal(doc.kg, 200, '500 pieces at 0.4 kg apiece');
  assert.equal(doc.goods_total, 6000, 'at Rs 12 a piece');

  const [line] = api.tables.dispatch_lines;
  assert.equal(line.unit, 'pieces');
  assert.equal(api.tables.stock_groups[0].available_sacks, 3500, 'and the yard is drawn down');
});

test('moulded stock the lab has not released cannot leave, whatever the client sent', async (t) => {
  const api = await sellingApi({ ...MOULDED, qc_status: 'pending' });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { method: 'POST', role: 'manager', body: sellBody(500) });
  assert.equal(res.status, 409);
  assert.match((await res.json()).message, /QC/);
  assert.equal(api.tables.stock_groups[0].dispatched_sacks, 0);
});

test('a failed moulded group is refused too - it stays in the yard, unsellable', async (t) => {
  const api = await sellingApi({ ...MOULDED, qc_status: 'fail' });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { method: 'POST', role: 'manager', body: sellBody(500) });
  assert.equal(res.status, 409);
  assert.equal(api.tables.stock_groups[0].dispatched_sacks, 0);

  // Still listed. Failed stock is physical stock and does not disappear off the
  // page until it is reworked or written off.
  const yard = await api.call('/stock', { role: 'manager' });
  assert.equal((await yard.json()).data.length, 1);
});

test('more pieces than the yard holds is refused, naming the group', async (t) => {
  const api = await sellingApi();
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { method: 'POST', role: 'manager', body: sellBody(4001) });
  assert.equal(res.status, 409);
  assert.match((await res.json()).message, /LOOP-50/);
  assert.equal(api.tables.stock_groups[0].dispatched_sacks, 0);
});

/**
 * A form that has gone stale about what it is selling.
 *
 * It matters because of the price beside it: "44" against a line the form
 * thought was sacks means something quite different once the line turns out to
 * be pieces, and a document that absorbed the mismatch would look entirely
 * correct afterwards.
 */
test('a request naming the wrong unit is refused rather than repriced', async (t) => {
  const api = await sellingApi();
  t.after(() => api.stop());

  const res = await api.call('/dispatches', {
    method: 'POST',
    role: 'manager',
    body: {
      ...sellBody(500),
      lines: [{ stock_group_id: MOULDED.id, qty: 500, unit: 'sacks' }],
    },
  });
  assert.equal(res.status, 409);
  assert.match((await res.json()).message, /LOOP-50/);
  assert.equal(api.tables.stock_groups[0].dispatched_sacks, 0);
});
