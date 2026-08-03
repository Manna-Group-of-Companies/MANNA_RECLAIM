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
 * Where one grade of one batch stands with the lab, as a stock status, or null
 * while it is untested. Tests are append-only - a re-test is a new row, not an
 * edit - so the newest row is the answer, which is the same rule the Quality
 * tab reads them by.
 *
 * Answers the tester as well as the verdict. The group carries who released it
 * and when, and packing is one of the two doors that sets it - a batch bagged
 * after the bench has already answered picks the signature up here rather than
 * showing a pass that nobody appears to have given.
 */
async function verdictFor(batchNo, quality) {
  const test = await testsTable.findOne(
    { batch_no: String(batchNo), quality: String(quality) },
    { sort: 'ts', ascending: false },
  );
  if (!isBatchTest(test)) return { status: null, by: null };
  return { status: toQcStatus(test.verdict), by: test.tester ?? null };
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
   */
  async list(query = {}) {
    const result = await base.list({ order: 'desc', limit: 200, ...query }, filtersFrom(query));
    return { ...result, rows: result.rows.map(toManagerRow) };
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
      { ...filtersFrom(query), kind: 'product' },
    );
    return {
      ...result,
      rows: result.rows.map((row) => {
        const qty = quantities(row);
        return {
          id: row.id,
          label: row.label,
          display_label: displayLabel(row.label),
          /** The product, which is what a verdict on moulded goods names. */
          product_id: row.product_id ?? row.quality ?? null,
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
    return toManagerRow(await base.findById(id));
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

    const isProduct = kind === 'product';
    const grade = String(quality ?? '').trim() || (isProduct ? '' : COARSE_GRADE);
    const isPool = !isProduct && grade === COARSE_GRADE;
    const batch = String(batchNo ?? '').trim();
    const product = String(productId ?? '').trim();

    if (isProduct && !product) {
      // Nothing to key the group on. The pieces stay recorded on the run and
      // file no stock, which is fixed by telling the press what it is moulding.
      return null;
    }
    if (!isProduct && !isPool && !batch) {
      // Nothing to key the group on. Rather than invent a label, the packing is
      // recorded on the run and simply files no stock - which is what the yard
      // already sees, and is fixed by giving the run its batch number.
      return null;
    }

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
    const pool = isPool ? poolFor(packedDate) : null;
    let qc = qcStatus ? { status: qcStatus, by: qcBy } : null;
    if (!qc) {
      if (isPool) qc = { status: 'pass', by: null };
      else if (isProduct) qc = batch ? await verdictFor(batch, product) : { status: null, by: null };
      else qc = await verdictFor(batch, grade);
    }

    const label = isProduct
      ? productLabel(product, packSize)
      : isPool
        ? pool.label
        : batchLabel(batch, grade);

    const body = {
      p_kind: isProduct ? 'product' : isPool ? 'pool' : 'batch',
      p_label: label,
      // A moulded group's "quality" is the product it is - which is what the
      // lab files its verdict against and what the dispatch is priced by, so
      // the column carries it rather than standing empty for want of a grade.
      p_quality: isProduct ? product : grade,
      p_delta: change,
      p_period_start: isPool ? pool.periodStart : null,
      p_period_end: isPool ? pool.periodEnd : null,
      p_qc_status: qc.status,
      p_unit: isProduct ? 'pieces' : 'sacks',
      p_product_id: isProduct ? product : null,
      p_pack_size: isProduct ? (Number(packSize) > 0 ? Math.trunc(Number(packSize)) : null) : null,
      p_kg_per_unit: isProduct ? (Number(kgPerUnit) > 0 ? Number(kgPerUnit) : 0) : SACK_KG,
      p_packed_on: packedDate,
      p_qc_by: qc.by ?? null,
    };

    let row;
    try {
      row = await rpc('record_packed_stock', body);
    } catch (err) {
      /*
       * A project still on 0004 has the seven-argument record_packed_stock(),
       * and PostgREST cannot match a body carrying the new keys to it.
       *
       * The output was still packed. Reclaim and coarse are filed through the
       * old signature rather than not filed at all - they lose the unit, the
       * weight and the dates, which are exactly the columns that project does
       * not have - and the yard reads as it did before 0005. Moulded goods are
       * not retried: a `product` group would fail the old kind CHECK, and a
       * press whose pieces cannot be filed is better reported than silently
       * turned into something the table would refuse anyway.
       */
      if (!isProduct && noSuchFunction(err)) {
        logger.warn(
          'Packing filed without its unit, weight or dates - the project has no ' +
            'thirteen-argument record_packed_stock(). Run supabase/migrations/0005.',
        );
        row = await rpc('record_packed_stock', {
          p_kind: body.p_kind,
          p_label: body.p_label,
          p_quality: body.p_quality,
          p_delta: body.p_delta,
          p_period_start: body.p_period_start,
          p_period_end: body.p_period_end,
          p_qc_status: body.p_qc_status,
        });
      } else {
        throw err;
      }
    }

    // A scalar-returning function answers with the row itself; PostgREST wraps a
    // set-returning one in an array.
    const saved = Array.isArray(row) ? row[0] : row;
    return saved ? toManagerRow(saved) : null;
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
      if (!status) continue;
      const signed = { status, by: test.tester ?? null };
      // A press verdict names the product it moulded rather than a grade, and a
      // moulded group is keyed on the product - so it is filed under the product
      // alone, with no batch in the key. The `isGrade` half catches the rows
      // written before `product` was a kind of its own.
      if (test.kind === 'product' && test.quality) {
        standing.set(`product:${test.quality}`, signed);
      } else if (isBatchTest(test)) {
        standing.set(
          isGrade(test.quality) ? batchLabel(test.batch_no, test.quality) : `product:${test.quality}`,
          signed,
        );
      } else if (test.kind === 'pool' && test.batch_no) {
        // A pool sample names its pool in the same column a batch test names
        // its batch, so the group's own label is the key on both sides.
        standing.set(String(test.batch_no), signed);
      }
    }

    // The map is keyed on `<batch>-<grade>`, which is the label a batch group
    // was created under - so the group's own label is the lookup, with no
    // splitting of a batch number that may hold a hyphen of its own. A moulded
    // group looks itself up by the product it is.
    const stale = groups
      .map((group) => ({
        group,
        verdict:
          group.kind === 'product'
            ? standing.get(`product:${group.product_id ?? group.quality}`)
            : standing.get(group.label),
      }))
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
