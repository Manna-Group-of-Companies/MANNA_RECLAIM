import { crud } from './base.service.js';
import { rpc } from '../config/supabase.js';
import {
  TABLES,
  COARSE_GRADE,
  QC_STATUSES,
  DISPATCH_GRADES,
  SACK_KG,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { noSuchFunction } from '../utils/rpc.js';
import {
  poolFor,
  displayLabel,
  batchLabel,
  productLabel,
  lotLabel,
  slotsOf,
  slotOf,
} from '../utils/stockPeriod.js';
import { todayISO } from '../utils/shift.js';

/**
 * The yard, as a ledger.
 *
 * Every packed thing in the plant belongs to a stock group, and a dispatch can
 * only draw from one. A special-line batch makes a group per grade it yielded;
 * the coarse line makes one per ten-day period, because coarse sacks are not
 * batch-identified - see utils/stockPeriod.js; a moulding press makes one per
 * product and pack, because moulded goods are sold by the piece and boxed some
 * number at a time.
 *
 * Both counts on a group are moved by Postgres functions rather than from here.
 * `record_packed_stock` takes the *change* in a run's packed figure, so packing
 * a run twice to correct it moves the group by the difference; `post_dispatch`
 * draws stock down inside the same transaction that writes the document. Neither
 * count is a writable column in the registry, so there is no path that sets a
 * stock level by hand and steps around the oversell check.
 *
 * One column is worth reading the name of carefully. `packed_sacks` holds the
 * count whatever the group is counted in - sacks for reclaim and coarse, pieces
 * for moulded goods - and `unit` is what says which. The column was not renamed
 * when the presses arrived because it is what post_dispatch() moves and what the
 * oversell CHECK is written against; every serializer below reads `unit` and
 * answers in both names, so nothing above this file has to know.
 */

const base = crud(TABLES.stockGroups, { defaultSort: 'created_at' });

/**
 * The lab's table, reached from here rather than through quality.service.js.
 *
 * The verdict on a grade and the status of the stock made to that grade are the
 * same fact kept in two places - the lab writes a test row, post_dispatch()
 * reads `stock_groups.qc_status` - and something has to carry it across. Going
 * through the other service would make the two import each other, so the two
 * columns this needs are read straight off the table.
 */
const testsTable = crud(TABLES.qualityTests, { defaultSort: 'ts' });

const int = (value) => Number(value ?? 0);
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A lab verdict as a stock status. The lab records `pass` or `hold`; the yard
 * has no third state between passed and blocked, so a hold is a `fail` here.
 * Either way the sacks do not leave. Anything else answers null and changes
 * nothing, so an unrecognised verdict cannot release stock by accident.
 */
const toQcStatus = (verdict) => (verdict === 'pass' ? 'pass' : verdict === 'hold' ? 'fail' : null);

/** A batch test - one that names a batch and a grade - rather than a shift sample. */
const isBatchTest = (test) =>
  (test?.kind ?? 'batch') === 'batch' && Boolean(test?.batch_no) && Boolean(test?.quality);

/**
 * Whether a verdict's `quality` names a reclaim grade or a moulded product.
 *
 * The lab files a test against a batch and a "quality", and for a press that
 * quality is the product it moulded - the bench tests loops, not a grade of
 * rubber. The two are told apart by the grade list rather than by a flag on the
 * test, because the list is what the rest of the server already means by a
 * grade and a second flag would be a second place for them to disagree.
 */
const isGrade = (quality) => DISPATCH_GRADES.includes(String(quality ?? '').trim());

/**
 * The key a test files its verdict under, or null if it addresses no group.
 *
 * There are three shapes of key because there are three ways this plant keys a
 * lot: a batch group by `<batch>-<grade>`, a pool by its own label - which is
 * what a pool sample carries in `batch_no` - and a moulded group by the product,
 * because a press verdict names what it moulded rather than a grade of rubber.
 *
 * The `isGrade` half of the batch case catches the rows written before `product`
 * was a kind of its own: a `batch` test whose quality is not one of the plant's
 * grades is a press verdict filed under the old kind, and reading it as a batch
 * verdict would look for a label that was never created.
 */
function testKey(test) {
  if (test?.kind === 'product' && test.quality) return `product:${test.quality}`;
  /*
   * A sleeve or loop lot, addressed by the product and the shift together -
   * which is what the group's label is built from.
   *
   * Both halves are required and the key is null without either. A lot test
   * carries the product in `quality` and the shift in `batch_no`, and a verdict
   * keyed on the number alone would release every product made that shift: the
   * number is `03/Aug/26-day` and the sleeve bench and the loop bench both
   * worked it. That is the merge this whole key exists to prevent.
   */
  if (test?.kind === 'lot' && test.batch_no && test.quality) {
    return `lot:${lotLabel(test.quality, test.batch_no)}`;
  }
  if (isBatchTest(test)) {
    return isGrade(test.quality) ? batchLabel(test.batch_no, test.quality) : `product:${test.quality}`;
  }
  if (test?.kind === 'pool' && test.batch_no) return String(test.batch_no);
  return null;
}

/** The same key from the other side - what a group looks its verdict up by. */
const groupKey = (group) => {
  if (group.kind === 'product') return `product:${group.product_id ?? group.quality}`;
  if (group.kind === 'lot') return `lot:${group.label}`;
  return group.label;
};

/**
 * A test row as the yard shows it: the verdict, what was measured, who signed
 * it and the report behind it.
 *
 * The point of putting this on a stock card at all is that `qc_status` is a
 * conclusion with nothing under it. "QC passed" on a pallet is the end of a
 * sentence - somebody at a bench measured four things, wrote them down and
 * photographed the sheet - and until now the only way to read that sentence was
 * to leave the yard and open the Quality tab against the right batch and grade.
 * The verdict travels with the goods; the reading it was made on should too.
 */
const toLabTest = (row) =>
  row && {
    id: row.id,
    kind: row.kind ?? 'batch',
    verdict: row.verdict ?? null,
    /** What the test was filed against - the batch, and the grade or product. */
    batch_no: row.batch_no ?? null,
    quality: row.quality ?? null,
    params: row.params ?? [],
    tested_at: row.ts ?? row.created_at ?? null,
    tested_by: row.tester ?? null,
    remarks: row.notes ?? null,
    attachment_url: row.attachment_url ?? null,
    attachment_name: row.attachment_name ?? null,
  };

/**
 * The test standing behind each of the given groups, keyed by group id.
 *
 * One read for the whole page rather than one per card - the yard is two hundred
 * groups at most and the bench files a handful of tests a day, so the join is
 * cheaper done here than as two hundred round trips. Newest first, and the first
 * key wins: tests are append-only, so a re-test is a newer row and the walk
 * leaves it standing.
 *
 * A group nobody has tested is simply absent from the map. That is a real state
 * and a common one - an untested batch sits `pending`, and a pool that has never
 * been sampled sells on the `pass` it opened with - and it must not be reported
 * as a test with empty fields.
 */
async function labTestsFor(groups = []) {
  const byId = new Map();
  if (!groups.length) return byId;

  const wanted = new Map(groups.map((group) => [groupKey(group), group.id]));
  const tests = await testsTable.all({}, { sort: 'ts', ascending: false });

  const standing = new Map();
  for (const test of tests) {
    const key = testKey(test);
    if (!key || !wanted.has(key) || standing.has(key)) continue;
    standing.set(key, test);
  }

  for (const [key, id] of wanted) {
    const test = standing.get(key);
    if (test) byId.set(id, toLabTest(test));
  }
  return byId;
}

/**
 * Where one grade of one batch stands with the lab, as a stock status, or null
 * while it is untested. Tests are append-only - a re-test is a new row, not an
 * edit - so the newest row is the answer, which is the same rule the Quality
 * tab reads them by.
 *
 * Answers the verdict and nothing else. It used to answer the tester too, and
 * that was the bug: `qc_by` is a foreign key to `users` and a test row carries
 * no account, only the free-text name of whoever was at the bench - so the name
 * went into the column, Postgres refused it, and the refusal took the packing's
 * whole stock row with it.
 *
 * Null rather than a name, and it is the honest answer as well as the safe one.
 * Nobody released this group: it was created by packing and inherited a verdict
 * that was already standing. `qc_source` says `lab`, the test behind it is on
 * the card, and the account column is left empty because no account acted.
 */
async function verdictFor(batchNo, quality) {
  const test = await testsTable.findOne(
    { batch_no: String(batchNo), quality: String(quality) },
    { sort: 'ts', ascending: false },
  );
  if (!isBatchTest(test)) return { status: null, by: null };
  return { status: toQcStatus(test.verdict), by: null };
}

/**
 * Where one sleeve or loop lot stands with the lab, or null while it is
 * untested.
 *
 * The same rule as verdictFor() above and the same reasoning about the
 * signature - `qc_by` is a foreign key to `users` and a test row carries only
 * the free-text name of whoever was at the bench, so writing it there is what
 * Postgres refuses, and the refusal would take the release with it.
 *
 * What differs is what is asked. A lot is addressed by the product and the shift
 * together: the number is the date and the shift alone, so asking for it by
 * itself would hand back the loop bench's verdict to the sleeve bench whenever
 * both worked the same shift. `kind` keeps it clear of a press's verdict, which
 * names the same product and moves every pack of it.
 */
async function lotVerdictFor(productId, batchNo) {
  const product = String(productId ?? '').trim();
  const batch = String(batchNo ?? '').trim();
  if (!product || !batch) return { status: null, by: null };

  const test = await testsTable.findOne(
    { kind: 'lot', batch_no: batch, quality: product },
    { sort: 'ts', ascending: false },
  );
  if (!test) return { status: null, by: null };
  return { status: toQcStatus(test.verdict), by: null };
}

/**
 * The group a quantity of packed output belongs to, worked out the same way
 * whichever direction the stock is moving.
 *
 * Packing and un-packing have to agree about this exactly, or a deleted run
 * would take its sacks out of a group it never put any into. So the branching
 * lives here once rather than at each door: a press names its product and the
 * pack it was boxed in, a sleeve or loop shift names its product and the shift
 * it was made on, a coarse run has neither and pools by the period it was packed
 * in, and anything else is keyed on the batch and the grade.
 *
 * Null means there is nothing to key a group on - a graded run with no batch
 * number, a press with no product against it, or a lot missing either half of
 * its key. That is a real state and not an error; see recordPacking() below.
 */
export function targetOf({
  quality,
  batchNo,
  kind = null,
  productId = null,
  packSize = null,
  packedOn = todayISO(),
} = {}) {
  const isProduct = kind === 'product';
  /**
   * A sleeve or loop lot. Counted in pieces like a press's output and certified
   * per shift like a batch of reclaim, which is why it is a kind of its own:
   * pooling it by product and pack the way a press does would put every shift's
   * sleeves in one row and let one verdict move all of them, and keying it on a
   * grade the way reclaim does is impossible - it has none.
   */
  const isLot = kind === 'lot';
  const moulded = isProduct || isLot;
  const grade = String(quality ?? '').trim() || (moulded ? '' : COARSE_GRADE);
  const isPool = !moulded && grade === COARSE_GRADE;
  const batch = String(batchNo ?? '').trim();
  const product = String(productId ?? '').trim();

  if (isProduct && !product) return null;
  /*
   * A lot is the product and its batch number, and it needs both.
   *
   * Neither half is optional and neither is a default. The number is the date
   * and the shift, so a lot keyed on it alone would collect every product made
   * that shift into one group - sleeve boxed into loop's row, one verdict
   * releasing both. Missing either is a run whose product or whose shift never
   * got recorded, which is a gap to fill in rather than a group to invent.
   */
  if (isLot && !(batch && product)) return null;
  if (!moulded && !isPool && !batch) return null;

  const pool = isPool ? poolFor(packedOn) : null;
  return {
    kind: isProduct ? 'product' : isLot ? 'lot' : isPool ? 'pool' : 'batch',
    label: isProduct
      ? productLabel(product, packSize)
      : isLot
        ? lotLabel(product, batch)
        : isPool
          ? pool.label
          : batchLabel(batch, grade),
    // A moulded group's "quality" is the product it is - which is what the lab
    // files its verdict against and what the dispatch is priced by, so the
    // column carries it rather than standing empty for want of a grade.
    quality: moulded ? product : grade,
    isProduct,
    isLot,
    isMoulded: moulded,
    isPool,
    grade,
    batch,
    product,
    pool,
  };
}

/** How many packs a count comes to, or null when the product has no pack set. */
const packsOf = (count, packSize) => {
  const size = Number(packSize ?? 0);
  return size > 0 ? round2(int(count) / size) : null;
};

/**
 * The stock figures every row carries, in whichever unit the group is counted
 * in, with the weight those figures come to.
 *
 * Both names for the count. `packed_sacks` is what the column is called and what
 * every existing reader asks for; `packed_qty` is what it means once a group can
 * be pieces. They are the same number - not two figures to keep in step - and
 * the older name is kept so nothing that reads the yard breaks on the day the
 * presses arrive on it.
 *
 * Weight is derived from `kg_per_unit` rather than stored, so it cannot drift
 * from the count it belongs to. A product with no piece weight recorded has
 * `kg_per_unit` of zero and reports null: a moulded pallet of unknown weight is
 * a fact, and a zero on the screen reads as weightless.
 */
function quantities(row) {
  const unit = row.unit ?? 'sacks';
  const packed = int(row.packed_sacks);
  const dispatched = int(row.dispatched_sacks);
  const available = int(row.available_sacks ?? packed - dispatched);
  const perUnit = Number(row.kg_per_unit ?? (unit === 'sacks' ? SACK_KG : 0));
  const packSize = row.pack_size ?? null;

  return {
    unit,
    packed_sacks: packed,
    dispatched_sacks: dispatched,
    available_sacks: available,
    packed_qty: packed,
    dispatched_qty: dispatched,
    available_qty: available,
    pack_size: packSize,
    packed_packs: packsOf(packed, packSize),
    available_packs: packsOf(available, packSize),
    kg_per_unit: perUnit > 0 ? perUnit : null,
    packed_kg: perUnit > 0 ? round2(packed * perUnit) : null,
    available_kg: perUnit > 0 ? round2(available * perUnit) : null,
  };
}

/**
 * When the group was packed, as a span rather than a moment.
 *
 * A batch group is bagged over a shift or two and a pool over ten days, so one
 * date would be a choice about which day to lie by. Both ends are carried and
 * the screen prints one date when they are the same.
 */
const packedOn = (row) => ({
  first_packed_on: row.first_packed_on ?? (row.created_at ? String(row.created_at).slice(0, 10) : null),
  last_packed_on: row.last_packed_on ?? (row.created_at ? String(row.created_at).slice(0, 10) : null),
});

/**
 * Who put the group on its current verdict and when.
 *
 * `qc_source` is the part worth keeping apart: `lab` is a verdict pushed across
 * from a test that was actually filed at the bench, `manual` is the back office
 * setting the column directly through PATCH /stock/:id/qc. Both are legitimate
 * and they are not the same event - one has a test row behind it and the other
 * has a person deciding - so a screen that showed them identically would be
 * hiding the only thing anybody would later want to ask about.
 */
const qcTrail = (row) => ({
  qc_status: row.qc_status ?? 'pending',
  qc_by: row.qc_by ?? null,
  qc_at: row.qc_at ?? null,
  qc_source: row.qc_source ?? null,
});

/**
 * The manager's row. Everything on the group, including what has already left
 * it, because the back office is the side that reconciles the two.
 */
export const toManagerRow = (row) => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  display_label: displayLabel(row.label),
  quality: row.quality ?? null,
  product_id: row.product_id ?? null,
  /**
   * The batch number the goods carry, where they carry one.
   *
   * Half the key on a lot and provenance on a batch group; null on a pool and on
   * a press's product group, neither of which is batch-identified. It is a field
   * of its own rather than something a screen reads out of the label, because
   * that is the whole point of taking the product back out of the number - a
   * card shows this in its reference slot and the product beside it, and nothing
   * anywhere has to split a string to find out what was made.
   */
  batch_no: row.batch_no ?? null,
  ...quantities(row),
  ...qcTrail(row),
  ...packedOn(row),
  period_start: row.period_start ?? null,
  period_end: row.period_end ?? null,
  created_at: row.created_at ?? null,
});

/**
 * The supervisor's row - built here rather than by taking fields off the one
 * above, deliberately.
 *
 * A supervisor needs to know what is in the yard and whether the lab has passed
 * it. They have no business knowing who bought what, at what price, or how much
 * of a batch has already been sold, and "the client does not render it" is not
 * a way of keeping any of that from them: it is in the response either way, one
 * devtools tab away. So this is a different serializer with a different field
 * list, and the only way a price or a customer reaches a supervisor is if
 * someone writes it into this object.
 *
 * What was added when the page grew - the unit, the weight, the packing dates -
 * is all of it physical fact about goods the supervisor is standing next to, so
 * it is on this side of the wall. What was not added is the packed/dispatched
 * split and the verdict's signature: the first is the commercial ledger and the
 * second names a colleague, and neither is needed to load a lorry.
 */
export const toSupervisorRow = (row) => {
  const qty = quantities(row);
  return {
    // The group's key, and nothing about it. A supervisor posts dispatches, and
    // a dispatch line names the group its sacks came off - without this there is
    // no way to say which stock left, short of handing the fuller row over. An
    // opaque id says nothing about who bought what or for how much, which is
    // what the rest of this serializer exists to withhold.
    id: row.id,
    kind: row.kind,
    label: displayLabel(row.label),
    // The number and the product, which together are what the card puts in its
    // reference slot and its chip. Physical fact about the goods the supervisor
    // is standing next to, so it is on this side of the wall - see above.
    batch_no: row.batch_no ?? null,
    quality: row.quality ?? null,
    unit: qty.unit,
    available_sacks: qty.available_sacks,
    available_qty: qty.available_qty,
    available_packs: qty.available_packs,
    pack_size: qty.pack_size,
    available_kg: qty.available_kg,
    qc_status: row.qc_status ?? 'pending',
    ...packedOn(row),
  };
};

/**
 * The samples filed against each of the given coarse pools, keyed by label.
 *
 * Read off `testsTable` rather than through quality.service for the reason
 * given at the top of this file: that service already imports this one to
 * release a batch, and going back the other way would make the two import each
 * other. The two columns this needs are on the row.
 *
 * A pool is sampled at three points across its period and the slot a sample
 * belongs to is worked out from the day it was taken, never sent - see
 * slotOf(). So the answer is always three slots per pool, each holding the
 * sample that stands for it or null while nobody has taken one. The empty slot
 * is the point of the whole arrangement: a sample that was never taken is a
 * visible gap rather than an absence nobody can see.
 *
 * Newest wins within a slot. Tests are append-only here as everywhere - a
 * re-sample is a new row, not an edit - so walking oldest-first leaves the
 * newest standing.
 */
async function poolSamples(labels = []) {
  const wanted = [...new Set(labels.filter(Boolean).map(String))];
  const byLabel = new Map(
    wanted.map((label) => [label, slotsOf(label).map((slot) => ({ ...slot, test: null }))]),
  );
  if (!wanted.length) return byLabel;

  const rows = await testsTable.all(
    { kind: 'pool', batch_no: wanted },
    { sort: 'ts', ascending: true },
  );

  for (const row of rows) {
    const slots = byLabel.get(String(row.batch_no));
    if (!slots) continue;
    /*
     * The sample's own day decides where it lands. A row dated outside the
     * period it names belongs to no slot and is left out rather than forced
     * into the nearest one - that is a filing mistake, and quietly absorbing it
     * would make a slot read as sampled when nobody sampled it.
     */
    const day = row.shift_date ?? String(row.ts ?? '').slice(0, 10);
    const at = slotOf(String(row.batch_no), day);
    if (!at) continue;
    slots[at - 1].test = {
      id: row.id,
      verdict: row.verdict,
      grade: row.quality ?? COARSE_GRADE,
      params: row.params ?? [],
      tested_at: row.ts ?? row.created_at ?? null,
      tested_by: row.tester ?? null,
      sampled_on: day || null,
      remarks: row.notes ?? null,
      attachment_url: row.attachment_url ?? null,
      attachment_name: row.attachment_name ?? null,
    };
  }
  return byLabel;
}

/**
 * record_packed_stock(), against whichever version of it the project has.
 *
 * One function does this for both directions - filing and reversing - because
 * they call the same procedure with the same body shape, and a fallback written
 * twice is a fallback that is right once.
 *
 * The migrations have grown the signature twice and a project can be sitting on
 * any of the three, so a body PostgREST cannot match is not necessarily a
 * failure to report at somebody standing at the bagging line. It steps back one
 * version at a time:
 *
 *   0007  the full body, with the batch number beside the product.
 *   0006  the same without `p_batch_no`. Every column that matters is still
 *         there; what the yard loses is the ability to answer "what came off
 *         B1041" without reading the label apart, and a lot's key falls back to
 *         its label - which is built from the same two fields, so nothing is
 *         mis-filed by it.
 *   0004  the seven-argument original: no unit, no weight, no dates. Reclaim and
 *         coarse read as they did before 0005, which is worse than the truth and
 *         far better than the sacks not being filed at all.
 *
 * `retrySeven` is false for moulded goods, and deliberately. A `product` or
 * `lot` group would fail the old kind CHECK on that project, so the last step
 * would turn a reportable failure into a refusal from Postgres with a message
 * nobody upstream can act on.
 *
 * Answers the saved row. A scalar-returning function answers with the row
 * itself; PostgREST wraps a set-returning one in an array.
 */
async function filePackedStock(body, { retrySeven = true } = {}) {
  const call = async (args) => {
    const row = await rpc('record_packed_stock', args);
    return Array.isArray(row) ? row[0] : row;
  };

  try {
    return await call(body);
  } catch (err) {
    if (!noSuchFunction(err)) throw err;
  }

  const { p_batch_no: _batchNo, ...beforeBatchNo } = body;
  try {
    const row = await call(beforeBatchNo);
    logger.warn(
      'Packing filed without its batch number - the project has no fourteen-argument ' +
        'record_packed_stock(). Run supabase/migrations/0007.',
    );
    return row;
  } catch (err) {
    if (!retrySeven || !noSuchFunction(err)) throw err;
  }

  const row = await call({
    p_kind: body.p_kind,
    p_label: body.p_label,
    p_quality: body.p_quality,
    p_delta: body.p_delta,
    p_period_start: body.p_period_start,
    p_period_end: body.p_period_end,
    p_qc_status: body.p_qc_status,
  });
  logger.warn(
    'Packing filed without its unit, weight or dates - the project has no ' +
      'thirteen-argument record_packed_stock(). Run supabase/migrations/0005.',
  );
  return row;
}

/** `?quality=`, `?qc_status=`, `?kind=` and `?unit=` off the query string. */
const filtersFrom = (query = {}) => ({
  ...(query.quality ? { quality: query.quality } : {}),
  ...(query.qc_status ? { qc_status: query.qc_status } : {}),
  ...(query.kind ? { kind: query.kind } : {}),
  ...(query.unit ? { unit: query.unit } : {}),
});

/*
 * There is deliberately no per-verdict total computed here.
 *
 * The Stock page wants one - how much is stuck in pending, how much is failed -
 * and it counts it off the rows it already holds. Adding it to the envelope
 * would look more authoritative and be no truer: this reads at most two hundred
 * groups, so a total struck here would cover the same rows the page can see, and
 * a figure in `meta` reads as "the whole yard" whether or not it is. If the yard
 * ever outgrows one page the total has to come from a count in Postgres, not
 * from summing the page and calling it a total.
 *
 * It would also have to go through the supervisor's envelope, which is asserted
 * key by key in stock-access.test.js for good reason.
 */

export const stockService = {
  ...base,

  /**
   * The whole yard, newest group first. Manager only - see stock.routes.js.
   *
   * Every packed thing in the plant, in every verdict: bagged reclaim by batch
   * and grade, coarse by its ten-day pool, and what the presses moulded by
   * product and pack. Nothing is filtered out for being unsellable - a group
   * the lab has failed is still stock standing in the yard, and a page that
   * hid it would be answering "what can I sell" while claiming to answer "what
   * is here".
   *
   * Each row carries the lab test standing behind its verdict, where there is
   * one - see labTestsFor(). It is allowed to fail on its own: the yard is worth
   * showing without the readings on it, and a bench that is unreachable must not
   * take the stock list down with it.
   */
  async list(query = {}) {
    const result = await base.list({ order: 'desc', limit: 200, ...query }, filtersFrom(query));
    const rows = result.rows.map(toManagerRow);
    const tests = await labTestsFor(rows).catch((err) => {
      logger.warn(`Stock list: the lab tests were not read - ${err.message}`);
      return new Map();
    });
    return { ...result, rows: rows.map((row) => ({ ...row, lab_test: tests.get(row.id) ?? null })) };
  },

  /**
   * What a supervisor may see: the label, the grade, what is left, what it
   * weighs and whether the lab passed it.
   *
   * Every group, including the ones that have gone out entirely. That is a
   * change: they used to be dropped on the argument that an empty group is not
   * stock and the floor's question is only ever "what is there". The argument
   * was wrong in one direction that matters - a pallet somebody is standing in
   * front of, looking for, and cannot find on the screen is not answered by the
   * row being absent. "AUG-H1, nothing left" is an answer; a missing row is a
   * doubt about whether the tablet is up to date.
   *
   * The card draws a spent group differently and says why, so it costs a line
   * on the screen rather than a second guess at the gate. The two sides now
   * list the same set - the difference between the manager's read and this one
   * is the fields on it, which is what the wall was ever about.
   */
  async summary(query = {}) {
    const result = await base.list({ order: 'desc', limit: 200, ...query }, filtersFrom(query));
    return { ...result, rows: result.rows.map(toSupervisorRow) };
  },

  /**
   * The coarse pools with their three sample points - what the lab's tab lists
   * and what the yard card's "n of 3 sampled" is counted off.
   *
   * Carries no price, no customer and no packed/dispatched split: a pool is
   * stock and a sample is a reading, and neither is commercial information. So
   * this is readable by the lab, who own the samples but have no business in
   * the yard's ledger - see stock.routes.js.
   *
   * Newest period first. The lab's work is nearly always this pool or the one
   * before it, and a year of them below that is a scroll nobody makes.
   */
  async pools(query = {}) {
    const result = await base.list(
      { order: 'desc', limit: 60, ...query },
      { ...filtersFrom(query), kind: 'pool' },
    );
    const rows = result.rows.map(toManagerRow);
    const samples = await poolSamples(rows.map((row) => row.label));

    return {
      ...result,
      rows: rows.map((row) => {
        const slots = samples.get(row.label) ?? [];
        const taken = slots.filter((slot) => slot.test).length;
        return {
          id: row.id,
          label: row.label,
          display_label: row.display_label,
          quality: row.quality,
          unit: row.unit,
          available_sacks: row.available_sacks,
          packed_sacks: row.packed_sacks,
          available_kg: row.available_kg,
          qc_status: row.qc_status,
          period_start: row.period_start,
          period_end: row.period_end,
          slots,
          samples_taken: taken,
          samples_total: slots.length,
          /** Any sample that came back a hold - the thing worth acting on. */
          any_hold: slots.some((slot) => slot.test?.verdict === 'hold'),
        };
      }),
    };
  },

  /**
   * What the presses have made, for the bench that has to certify it.
   *
   * The lab's third list, beside the batches it tests and the coarse pools it
   * samples. It exists because a moulded group is the one kind of stock the lab
   * cannot find its way to any other way: a batch is reached through the batch
   * card and a pool through /stock/pools, but what a press moulded is keyed on
   * the product and the pack it was boxed in, and appears on neither.
   *
   * Without it the flow simply stops. Boxed pieces open `pending`,
   * post_dispatch() refuses anything that is not `pass`, and the only door left
   * would be the back office setting the column by hand - which is exactly the
   * state coarse was in before the pools were released, and it took every sack
   * the plant had packed with it.
   *
   * Carries stock and verdicts and nothing commercial - no price, no customer,
   * no packed-against-dispatched split - which is what makes it safe to put in
   * front of the lab. Same reasoning as pools(); see stock.routes.js.
   */
  async moulded(query = {}) {
    const result = await base.list(
      { order: 'desc', limit: 100, ...query },
      // Both moulded kinds. A press pools by product and pack and a sleeve or
      // loop shift makes a lot of its own, and the bench reaches neither any
      // other way - so they are one list, and `kind` on each row is what says
      // which of the two a verdict has to be filed as.
      { ...filtersFrom(query), kind: query.kind || ['product', 'lot'] },
    );
    return {
      ...result,
      rows: result.rows.map((row) => {
        const qty = quantities(row);
        return {
          id: row.id,
          kind: row.kind,
          label: row.label,
          display_label: displayLabel(row.label),
          /** The product, which is what a verdict on moulded goods names. */
          product_id: row.product_id ?? row.quality ?? null,
          /**
           * The shift a lot was made on - the other half of what a lot verdict
           * has to name. Null on a press's group, which pools every shift and is
           * addressed by the product alone.
           */
          batch_no: row.batch_no ?? null,
          quality: row.quality ?? null,
          unit: qty.unit,
          available_qty: qty.available_qty,
          available_packs: qty.available_packs,
          pack_size: qty.pack_size,
          available_kg: qty.available_kg,
          ...qcTrail(row),
          ...packedOn(row),
        };
      }),
    };
  },

  async findById(id) {
    const row = toManagerRow(await base.findById(id));
    const tests = await labTestsFor([row]).catch(() => new Map());
    return { ...row, lab_test: tests.get(row.id) ?? null };
  },

  /**
   * Files packed output into its group - the one door stock comes in by.
   *
   * `delta` is the change in the run's packed count, not the count itself: the
   * Packing tab is where a figure gets corrected, and re-sending the total would
   * count the same output a second time.
   *
   * The label is worked out here and never taken from the request. A coarse run
   * carries no batch number, so its sacks go into the pool for the day they were
   * packed; a press names its product and the pack it was boxed in; anything
   * else is keyed on the batch it was made on and the grade it came out as.
   */
  async recordPacking({
    quality,
    batchNo,
    delta,
    packedOn: packedDate = todayISO(),
    qcStatus = null,
    qcBy = null,
    /** A press run: what it moulded, boxed how many to a pack, at what weight. */
    kind = null,
    productId = null,
    packSize = null,
    kgPerUnit = null,
  } = {}) {
    const change = Math.trunc(Number(delta) || 0);
    if (!change) return null;

    /*
     * Nothing to key the group on - a press with no product against it, or a
     * graded run with no batch number. Rather than invent a label, the packing
     * is recorded on the run and simply files no stock, which is what the yard
     * already sees and is fixed by filling the missing field in.
     */
    const target = targetOf({ quality, batchNo, kind, productId, packSize, packedOn: packedDate });
    if (!target) return null;
    const { isProduct, isLot, isMoulded, isPool, grade, batch, product, pool, label } = target;

    /*
     * Where the group stands with the lab, at the moment it is created.
     *
     * A batch is often sampled before it is bagged, so by the time the sacks
     * are filed the lab may already have answered. Left unasked, the group
     * would be created `pending` with a passed test sitting beside it and
     * nothing would ever reconcile the two - the group is only created once,
     * and the test that would have released it was recorded before it existed.
     *
     * A pool opens `pass`, because there is nothing that could ever release it
     * otherwise. The lab tests a batch and a grade; coarse has neither - the
     * line runs for a shift, the sacks are pooled by period, and QUALITIES does
     * not carry Coarse, so a pool can never appear on the Quality tab and
     * applyLabVerdict() below refuses it by name. Created `pending` it would sit
     * in the yard forever with post_dispatch() refusing to load it and no screen
     * anywhere able to say otherwise, which is exactly what was happening.
     *
     * This is a release, so it is worth being plain about what it means: coarse
     * is sold on the strength of the line running to specification rather than
     * on a certificate per pool. A pool that turns out wrong is put on hold
     * through PATCH /stock/:id/qc, and record_packed_stock() only ever lifts a
     * `pending` - so packing more sacks into a held pool leaves the hold alone.
     *
     * Moulded goods are asked the same question a batch is, on the batch of
     * compound the press was moulding and the product it made of it. A press
     * run names both, and the bench tests the product rather than a grade of
     * rubber - see isGrade(). Nothing filed means `pending`, which is right:
     * unlike coarse there is a lot here, and it is a lot the lab can test.
     */
    let qc = qcStatus ? { status: qcStatus, by: qcBy } : null;
    if (!qc) {
      if (isPool) qc = { status: 'pass', by: null };
      /*
       * A lot the bench may already have answered on. Sleeve and loop are
       * certified per shift, so the question is asked of the product and the
       * batch number together rather than of the product alone - which is the
       * whole difference between this and a press's group, and getting it wrong
       * here would let a verdict on last week's loops release this week's.
       *
       * Boxing usually happens in the same shift the pieces were made, so this
       * is nearly always `pending` and correctly so. It is asked anyway because
       * a shift boxed the next morning, after the bench has been round, would
       * otherwise be created `pending` with a passed test sitting beside it and
       * nothing that would ever reconcile the two - the group is created once.
       */
      else if (isLot) qc = await lotVerdictFor(product, batch);
      else if (isProduct) qc = batch ? await verdictFor(batch, product) : { status: null, by: null };
      else qc = await verdictFor(batch, grade);
    }

    const body = {
      p_kind: target.kind,
      p_label: label,
      p_quality: target.quality,
      p_delta: change,
      p_period_start: isPool ? pool.periodStart : null,
      p_period_end: isPool ? pool.periodEnd : null,
      p_qc_status: qc.status,
      // A lot is counted in pieces exactly as a press's output is - a sleeve is
      // a sleeve, not a fraction of a sack - so both moulded kinds answer here.
      p_unit: isMoulded ? 'pieces' : 'sacks',
      p_product_id: isMoulded ? product || null : null,
      p_pack_size: isMoulded ? (Number(packSize) > 0 ? Math.trunc(Number(packSize)) : null) : null,
      p_kg_per_unit: isMoulded ? (Number(kgPerUnit) > 0 ? Number(kgPerUnit) : 0) : SACK_KG,
      p_packed_on: packedDate,
      p_qc_by: qc.by ?? null,
      /*
       * The batch number as its own column, beside the product.
       *
       * On a lot it is half the key and the label is built from it, so the two
       * can never disagree - and the unique index on (product_id, batch_no) is
       * what holds the pair apart at the table. On a batch group it is carried
       * as provenance: `B1041-Fine` already says it, and having the number in a
       * column means the yard can be asked "what came off B1041" without any
       * screen having to take the label apart. A pool and a press group have no
       * batch number at all and store null, which is what "not batch-identified"
       * looks like.
       */
      p_batch_no: isProduct || isPool ? null : batch || null,
    };

    const saved = await filePackedStock(body, { retrySeven: !isMoulded });
    return saved ? toManagerRow(saved) : null;
  },

  /**
   * Takes packed output back out of the yard - the door a deleted run leaves by.
   *
   * The yard is a ledger of things that were made, and a run that is taken off
   * the record was never made. Until this existed the sacks stayed: the run
   * vanished from History and its stock sat in the group forever, sellable,
   * with nothing behind it and no screen that could take it out again. That is
   * the worst shape a stock error can have - it is invisible from both ends.
   *
   * Addressed through targetOf(), which is the same function packing files by,
   * so the sacks come out of the group they went into rather than out of a
   * label worked out a second way.
   *
   * Three answers, and they are all real:
   *
   *   null            nothing was ever filed under that label. A run packed
   *                   before the yard existed, or one whose batch number was
   *                   never filled in - there is nothing to take back.
   *   a refusal       more is being taken back than is still standing there,
   *                   which means the difference has already gone out on a
   *                   lorry. That is a dispatch to reverse, not a count to
   *                   quietly push negative - and Postgres would refuse it
   *                   anyway, further down where the message means nothing.
   *   the group       what it now holds.
   *
   * The verdict is left strictly alone: `p_qc_status` goes as null, so nothing
   * here can lift a hold or release a group as a side effect of a delete.
   */
  async reversePacking({ qty, label = null, ...where } = {}) {
    const count = Math.trunc(Number(qty) || 0);
    if (count <= 0) return null;

    // A run says what it packed and the label is worked out from it; the
    // cleanup script has already read the group and names it outright.
    const addressed = label ?? targetOf(where)?.label ?? null;
    if (!addressed) return null;

    const group = await base.findOne({ label: addressed });
    if (!group) return null;

    const available = int(group.available_sacks ?? int(group.packed_sacks) - int(group.dispatched_sacks));
    if (count > available) {
      const unit = group.unit ?? 'sacks';
      throw ApiError.conflict(
        `${displayLabel(group.label)} has ${available} ${unit} left in the yard and this would take back ${count} - the rest has already been dispatched, so reverse that dispatch first`,
      );
    }

    const body = {
      p_kind: group.kind,
      p_label: group.label,
      p_quality: group.quality,
      p_delta: -count,
      p_period_start: group.period_start ?? null,
      p_period_end: group.period_end ?? null,
      // Nothing about the lab's answer moves because stock came back out.
      p_qc_status: null,
      p_unit: group.unit ?? 'sacks',
      p_product_id: group.product_id ?? null,
      p_pack_size: group.pack_size ?? null,
      p_kg_per_unit: group.kg_per_unit ?? null,
      // The day the group already carries, so the span it was packed across is
      // not widened to the day somebody deleted a run.
      p_packed_on: group.last_packed_on ?? group.first_packed_on ?? todayISO(),
      p_qc_by: null,
      // The group's own, not one worked out a second way. Nothing about the key
      // moves because stock came back out of it.
      p_batch_no: group.batch_no ?? null,
    };

    // Reversed on any version of the function - see filePackedStock(). The
    // count has to come back out even where the yard cannot record why.
    const saved = await filePackedStock(body);
    if (!saved) return null;
    const left = toManagerRow(saved);

    /*
     * A group with nothing in it and nothing ever out of it is not stock, and
     * it is not history either - it is the residue of a delete, and the row
     * goes.
     *
     * This is what "deleted, but still showing in Stock" is actually about.
     * Both yard reads list spent groups on purpose: a pallet somebody is
     * standing in front of and cannot find on the screen is not answered by the
     * row being absent, so `AUG-H1, nothing left` beats silence. But that
     * argument is about a group that was *sold* - it has a dispatch behind it
     * and a ledger worth keeping. A group whose only run has just been deleted
     * has neither, and leaving it reads as stock that exists and happens to be
     * empty rather than stock that was never made.
     *
     * Only when both counts are zero. A group that has dispatched anything is
     * kept whatever is left in it: `dispatch_lines.stock_group_id` points at it
     * with no cascade, so deleting one would either be refused by Postgres or
     * cut a dispatched load loose from the stock it drew down.
     */
    if (int(saved.packed_sacks) <= 0 && int(saved.dispatched_sacks) <= 0) {
      await base.remove(saved.id);
      return { ...left, removed: true };
    }
    return { ...left, removed: false };
  },

  /**
   * Puts the groups a deleted test was speaking for back where the tests that
   * are left leave them.
   *
   * A verdict is not a fact about a test row; it is a fact about goods, kept on
   * the group because post_dispatch() reads it and cannot read a test. So
   * deleting the test that released a pallet used to leave the pallet released,
   * signed by a bench sheet that no longer exists - stock cleared to sell on
   * the strength of a record nobody can produce.
   *
   * The rule is the one the rest of this file already runs on: the newest
   * verdict standing wins. Delete the newest of three tests and the one before
   * it takes over; delete the only one and the group goes back to what it would
   * have opened as - `pending` for a batch or a product, `pass` for a pool,
   * which is the same asymmetry recordPacking() creates them with.
   *
   * A group the back office released by hand is left exactly as it is. That is
   * a decision a person made and signed, not one this test was carrying, and a
   * delete at the bench must not silently undo it - `qc_source` is what tells
   * the two apart.
   */
  async refreshVerdictFor(test) {
    const key = testKey(test);
    if (!key) return [];

    // Matched through groupKey() rather than by rebuilding the where-clause a
    // second way, so this and the card's reading of the same tests cannot drift.
    const groups = (await base.all({})).filter((group) => groupKey(group) === key);
    if (!groups.length) return [];

    const tests = await testsTable.all({}, { sort: 'ts', ascending: false });
    const standing = tests.find(
      (row) => row.id !== test.id && testKey(row) === key && toQcStatus(row.verdict),
    );
    const status = standing ? toQcStatus(standing.verdict) : null;

    const changed = [];
    for (const group of groups) {
      if (status) {
        if (group.qc_status === status) continue;
        changed.push(
          await base.update(group.id, {
            qc_status: status,
            /*
             * No signature, deliberately. `qc_by` is a foreign key to `users`
             * and a test row carries only the free-text name of whoever was at
             * the bench - putting that in the column is what Postgres refuses,
             * and the refusal would take the whole verdict with it. The name is
             * not lost: it is on the test the card reads. See verdictFor().
             */
            qc_by: null,
            qc_at: new Date().toISOString(),
            qc_source: 'lab',
          }),
        );
        continue;
      }

      // Nothing the lab has said stands behind this group any more. A lot goes
      // back to `pending` with a batch and a moulded group: there is a lot here
      // and the bench can test it, so an unanswered one is held rather than
      // sold. Only a pool opens `pass`, and only because it has no lot at all.
      if (group.qc_source !== 'lab') continue;
      const opening = group.kind === 'pool' ? 'pass' : 'pending';
      if (group.qc_status === opening) continue;
      changed.push(
        await base.update(group.id, {
          qc_status: opening,
          qc_by: null,
          qc_at: null,
          qc_source: null,
        }),
      );
    }
    return changed.map(toManagerRow);
  },

  /**
   * The lab's verdict on a group, which is what decides whether it may leave the
   * yard. post_dispatch() refuses anything that is not `pass`, so this is the
   * only door - there is no way to dispatch around it.
   *
   * Signed. Who set it and when go onto the row beside the status, marked
   * `manual` to tell them from a verdict the bench filed - see qcTrail(). This
   * is the path with no test row behind it, so without the signature there is
   * nothing at all to say who released the goods.
   */
  /**
   * Takes a stock group off the yard's list altogether.
   *
   * Narrow on purpose, and the narrowness is the design rather than a first cut
   * of it. A group is not a thing somebody made; it is the running total of the
   * packing filed against one label, and nothing records which runs fed it -
   * reversePacking() finds a group by rebuilding its label from a run, not by
   * following a stored tie. So a group with sacks in it cannot be deleted
   * without stranding every run that says it packed them: the runs would go on
   * claiming output that no longer exists anywhere in the yard, and no screen
   * would ever show the difference.
   *
   * What that leaves this for is the residue - a group standing at zero that
   * nothing ever left by. Those are real and they are why the option is asked
   * for: a mis-keyed batch number bags twelve sacks into `C-2891-Fine`, the
   * packing is undone from the Packing tab, and what is left behind is an empty
   * row in the yard that reads as stock which exists and happens to be finished.
   * reversePacking() already drops such a group when it is the one taking the
   * last sack out; this is the same delete reachable by hand for the ones that
   * got there some other way.
   *
   * The two refusals are the whole of it, and each names where the work
   * actually is:
   *
   *   still holding stock  is undone at the bench, not here. Take the packing
   *                        back off the run on the Packing tab and the group
   *                        empties - and empties itself if it was the only one.
   *   ever dispatched      is never undone at all. `dispatch_lines.stock_group_id`
   *                        points here with no cascade, so the row is what a
   *                        loaded lorry's paperwork hangs off; a dispatch is
   *                        corrected by a reversal document, which is the rule
   *                        the whole dispatch side already runs on.
   */
  async removeGroup(id) {
    const group = await base.findById(id);

    const dispatched = int(group.dispatched_sacks);
    if (dispatched > 0) {
      const unit = group.unit ?? 'sacks';
      throw ApiError.conflict(
        `${displayLabel(group.label)} has ${dispatched} ${unit} dispatched off it - a dispatch is corrected by a reversal, so this group has to stay`,
      );
    }

    const available = int(group.available_sacks ?? int(group.packed_sacks) - dispatched);
    if (available > 0) {
      const unit = group.unit ?? 'sacks';
      throw ApiError.conflict(
        `${displayLabel(group.label)} still holds ${available} ${unit} - take the packing back off the run on the Packing tab, which is what puts the stock back`,
      );
    }

    await base.remove(id);
    return {
      id,
      label: displayLabel(group.label),
      kind: group.kind ?? null,
      quality: group.quality ?? group.product_id ?? null,
    };
  },

  async setQcStatus(id, qcStatus, by = null) {
    if (!QC_STATUSES.includes(qcStatus)) {
      throw ApiError.badRequest(`QC status must be one of: ${QC_STATUSES.join(', ')}`);
    }
    return toManagerRow(
      await base.update(id, {
        qc_status: qcStatus,
        qc_by: by,
        qc_at: new Date().toISOString(),
        qc_source: 'manual',
      }),
    );
  },

  /**
   * The other door, and the one the lab actually walks through: a verdict just
   * filed against a batch and a grade, pushed onto the stock group made to it.
   *
   * Filing a test and releasing the stock are one act on the floor. Until this
   * existed they were two records that never spoke - the Quality tab read the
   * test rows and said a batch had passed, while the group kept the `pending`
   * it was created with, so the yard showed stock the lab had cleared as
   * awaiting the lab and post_dispatch() refused to load it. There was no
   * screen that set the column either; it could only be reached by hand
   * through PATCH /stock/:id/qc.
   *
   * Addressed by label, because `<batch>-<grade>` is precisely what a batch
   * group's label is built from, and a verdict names a batch and a grade rather
   * than a group id. Nothing matching means the sacks are not bagged yet, which
   * is not a failure: recordPacking() asks the lab on the way in, so the group
   * picks the verdict up when it is created.
   *
   * The newest verdict wins outright, including over a status the back office
   * set by hand. The lab is the authority on whether goods may be sold, and a
   * re-test exists to change the answer.
   */
  async applyLabVerdict({ kind = 'batch', batchNo, quality, verdict, testedBy = null } = {}) {
    const batch = String(batchNo ?? '').trim();
    const grade = String(quality ?? '').trim();

    /*
     * A coarse sample, which decides the pool the same way a batch verdict
     * decides a batch.
     *
     * Two rules, and they are not the same rule:
     *
     *   no sample at all  does not block. A pool opens `pass` and sells
     *                     throughout its period - coarse is bulk output sold on
     *                     the strength of the line running to specification,
     *                     not on a certificate per pool, so waiting for the
     *                     bench would strand every sack the way it used to.
     *   a hold            blocks. The lab has looked at this period and said
     *                     no, and that is exactly the case the samples exist
     *                     for. It would be a strange record that let somebody
     *                     hold all three samples and still put the sacks on a
     *                     lorry.
     *
     * So absence is not refusal, and refusal is refusal. That is the same shape
     * as a batch - an untested batch group sits `pending` and a held one goes
     * to `fail` - and the newest word wins here too, so a passing re-sample
     * releases a period the bench had stopped. A re-test exists to change the
     * answer, on a pool as much as on a batch.
     */
    if (kind === 'pool') {
      const status = toQcStatus(verdict);
      if (!status || !batch) return null;
      return stockService.markVerdict({ label: batch, kind: 'pool' }, status, testedBy);
    }

    /*
     * A sleeve or loop lot, addressed by the product and the shift together.
     *
     * This is the case the `product` kind below cannot serve, and the reason
     * sleeve and loop are not filed as press output. A moulded group pools every
     * pack of a product, so one hold stops every loop the plant has ever made -
     * safe, but far too blunt for goods that are made and answered for a shift
     * at a time. A lot is one shift of one product, and a verdict on it moves
     * that and nothing else.
     *
     * Both halves of the key, and a verdict missing either moves nothing. The
     * batch number is the date and the shift, so a lot verdict addressed by it
     * alone would release the loop bench's output along with the sleeve bench's
     * whenever the two worked the same shift - two products, one certificate,
     * which is precisely what a per-shift verdict is supposed to prevent. The
     * product is on the test as `quality`; the validator requires both.
     *
     * The bench does not have to have anything to say. An untested lot sits
     * `pending` and post_dispatch() refuses it, which is the same asymmetry a
     * batch of reclaim has and the opposite of a coarse pool's - there is a lot
     * here, and it is a lot the lab can test.
     */
    if (kind === 'lot') {
      const status = toQcStatus(verdict);
      const label = lotLabel(grade, batch);
      if (!status || !label) return null;
      return stockService.markVerdict({ label, kind: 'lot' }, status, testedBy);
    }

    /*
     * A verdict on what a press moulded rather than on a grade of rubber.
     *
     * The bench tests loops, and a moulded group is keyed on the product and the
     * pack it is boxed in - so the batch of compound the press was running does
     * not appear in the label at all and there is nothing to address by
     * `<batch>-<grade>`. It is addressed by the product instead.
     *
     * The consequence is worth stating plainly, because it is the cost of
     * grouping moulded stock by product and pack rather than per batch: every
     * pack of that product moves together, so a hold on one batch of loops stops
     * all the loops. That is the safe direction to be wrong in - stock is held
     * that might have been sellable, rather than sold that should have been held
     * - and a pack the back office has satisfied itself about is released again
     * through PATCH /stock/:id/qc.
     *
     * A test filed as a `batch` whose grade is not one of the plant's grades is
     * treated as a product verdict too. The validator no longer lets one in, but
     * rows written before it did are still on the table and reconcileQc() walks
     * them - and reading such a row as a batch verdict would look for a label
     * that was never created.
     */
    const moulded = kind === 'product' || (kind === 'batch' && grade && !isGrade(grade));
    if (moulded) {
      const status = toQcStatus(verdict);
      if (!status || !grade) return null;
      return stockService.markVerdict({ kind: 'product', product_id: grade }, status, testedBy);
    }

    // A shift or machine sample is not about a lot of stock, and coarse sacks
    // pool by period and carry no batch number - neither addresses a group.
    if (kind !== 'batch' || !batch || !grade || grade === COARSE_GRADE) return null;

    const status = toQcStatus(verdict);
    if (!status) return null;

    return stockService.markVerdict({ label: batchLabel(batch, grade) }, status, testedBy);
  },

  /**
   * Puts a verdict, its signature and the moment it was given onto every group
   * matching `where`, and answers the first of them.
   *
   * One place rather than four, because the signature is the part that is easy
   * to write in three of them and forget in the fourth - and a release with no
   * name against it is indistinguishable from one nobody made.
   */
  async markVerdict(where, status, by = null) {
    const { rows } = await base.updateWhere(where, {
      qc_status: status,
      qc_by: by,
      qc_at: new Date().toISOString(),
      qc_source: 'lab',
    });
    return rows.length ? toManagerRow(rows[0]) : null;
  },

  /**
   * Puts the whole yard back in step with the lab in one pass, for the groups
   * that were packed and tested before either door above existed and are
   * therefore sitting on a status nobody can now correct from a screen.
   *
   * Every kind, keyed the way each is addressed. A batch group is joined to its
   * tests on `<batch>-<grade>`; a pool is joined to its samples on its own
   * label, which is what a pool sample carries in `batch_no`; a moulded group is
   * joined on the product, because that is what the bench files a press verdict
   * against. Either way the newest verdict standing is the answer.
   *
   * A group the lab has not answered on is left exactly as it is - untested is
   * not the same as failed, and this must not turn a manual verdict on an
   * untested group back into `pending`. That is also what keeps an unsampled
   * pool sellable: no sample, no change, and it stays on the `pass` it opened
   * with.
   *
   * `apply: false` reports what it would change without writing, which is the
   * form to run first on a yard with stock in it.
   */
  async reconcileQc({ apply = true } = {}) {
    const groups = (await base.all({})).map(toManagerRow);
    if (!groups.length) return [];

    // Every test in one read rather than one read per group, then walked
    // oldest-first so the newest verdict on each key is what is left standing
    // in the map.
    const tests = await testsTable.all({}, { sort: 'ts', ascending: true });
    const standing = new Map();
    for (const test of tests) {
      const status = toQcStatus(test.verdict);
      const key = status && testKey(test);
      if (!key) continue;
      // No account, for the reason given on verdictFor(): `qc_by` references
      // `users` and a test row carries a name rather than an id. A sync that
      // wrote the name would be refused by Postgres row by row, which is what
      // made this script appear to do nothing on the yard it was written for.
      standing.set(key, { status, by: null });
    }

    // Both sides of the join go through the same two functions - testKey() for
    // a verdict and groupKey() for a group - so a fourth kind of stock cannot be
    // taught to one of them and not the other, which is the way this and the
    // card's reading of the same tests would otherwise drift apart.
    const stale = groups
      .map((group) => ({ group, verdict: standing.get(groupKey(group)) }))
      .filter(({ group, verdict }) => verdict && verdict.status !== group.qc_status);

    if (apply) {
      for (const { group, verdict } of stale) {
        await base.update(group.id, {
          qc_status: verdict.status,
          qc_by: verdict.by,
          qc_at: new Date().toISOString(),
          qc_source: 'lab',
        });
      }
    }

    return stale.map(({ group, verdict }) => ({
      id: group.id,
      label: group.label,
      from: group.qc_status,
      to: verdict.status,
    }));
  },
};

export default stockService;
