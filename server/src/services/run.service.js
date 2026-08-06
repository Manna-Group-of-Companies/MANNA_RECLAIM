import { crud, op } from './base.service.js';
import { machineService } from './machine.service.js';
import { productService } from './product.service.js';
import { dispatchService } from './dispatch.service.js';
import { stockService } from './stock.service.js';
import { qualityService } from './quality.service.js';
import { pickingHoursOf } from './crumb.service.js';
import { rateService, labourRateAt } from './rate.service.js';
import { absentSchema } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import {
  TABLES,
  SACK_KG,
  COARSE_GRADE,
  MOULDING_KINDS,
  isCracker,
  isMoulding,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import {
  mouldingBatchNo,
  expectedPieces,
  variancePct,
  overVariance,
} from '../utils/mouldingBatch.js';
import { currentShift, todayISO } from '../utils/shift.js';

const base = crud(TABLES.runs, { defaultSort: 'started_at' });

/**
 * The lab's table, for the one thing this file has to do with it: a run that is
 * deleted takes the tests filed against it with it. They are listed from here
 * and deleted through qualityService, which is what carries their verdicts off
 * the stock groups as well - see clearTraces().
 */
const tests = crud(TABLES.qualityTests, { defaultSort: 'ts' });

/**
 * The tablets never wrote a `status` column - a run is open while `ended_at`
 * is null - and they call the output `weight_kg`, not `out_weight`. Rather
 * than make every screen learn two names for the same thing, each row leaves
 * here carrying both: the real columns untouched, plus the derived aliases the
 * client models are written against.
 */
/**
 * The batches a special-line pass drew from, the one being refined first and
 * any tailings mixed into it after. The tablets kept them in four columns
 * rather than a list, so they are read back out as one.
 */
const sourcesOf = (row) =>
  [row.src1, row.src2, row.src3, row.src4]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter(Boolean);

/** The same list on the way in: de-duplicated, and capped at the four columns. */
const sourceColumns = (sources) => {
  const list = (Array.isArray(sources) ? sources : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value, i, all) => all.indexOf(value) === i)
    .slice(0, 4);
  return {
    src1: list[0] ?? null,
    src2: list[1] ?? null,
    src3: list[2] ?? null,
    src4: list[3] ?? null,
  };
};

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * What a press run cost in material, and what that works out to per piece.
 *
 * Compound was spent on the flash as surely as on the piece, so the charge is
 * the weight that came off the press plus the flash trimmed away, at the rate
 * copied off the product when the run started. Nothing else about a press run is
 * costed: it records no hours, no energy and no meters, so power, labour and
 * overhead have nothing to be spread over - see the note in the spec.
 *
 * Null rather than zero wherever the figures are not all in. A press whose
 * product has no compound rate against it yet is not a press that moulded for
 * free, and a run with no pieces counted has no cost per piece to report.
 */
function pressCost(row) {
  const rate = row.compound_rate == null ? null : Number(row.compound_rate);
  const weight = Number(row.weight_kg ?? 0) + Number(row.flash_kg ?? 0);
  if (rate == null || !weight) return { material_cost: null, cost_per_piece: null };
  const material = round2(rate * weight);
  const pieces = Number(row.pieces ?? 0);
  return {
    material_cost: material,
    cost_per_piece: pieces > 0 ? round2(material / pieces) : null,
  };
}

/**
 * What a sleeve or loop run cost, and how its count compares with what the
 * mould said it should have been.
 *
 * Two things a press run does not carry, and both are asked for by name.
 *
 * Labour first. A press is not costed on labour at all - it books no hours, so
 * there is nothing to spread a crew over - but these activities are, and the
 * plant wants that labour in the same chain everything else is in. So it is the
 * crew on the activity, times how long the activity ran, at the rate that was in
 * force on the day it was worked. The rate is the run's own snapshot, not a
 * current lookup, which is what keeps a raise next month from re-pricing a month
 * that is closed - the same rule the loading entries and the compound rate run
 * on.
 *
 * Then the variance. `pieces_expected` was worked out and written when the run
 * was logged; this only reports the gap, so the flag is evidence of what was
 * counted rather than of what the product master says today. Null all the way
 * through where the product has no cycle or no cavities against it: a variance
 * against an unmeasured product is a number with nothing behind it.
 */
function mouldingFigures(row) {
  const rate = row.labour_rate == null ? null : Number(row.labour_rate);
  const workers = Number(row.workers ?? 0);
  // Booked minutes rather than the clock: a run stopped and started again inside
  // the shift is one record, and `runtime_min` is what the starts of it add up
  // to. Falling back to the hours where a correction only touched those.
  const minutes = Number(row.runtime_min ?? 0) || Number(row.hours_run ?? 0) * 60;
  const hours = minutes > 0 ? round2(minutes / 60) : 0;
  const crewHours = workers > 0 && hours > 0 ? round2(workers * hours) : 0;

  const pct = variancePct(row.pieces, row.pieces_expected);
  return {
    ...pressCost(row),
    labour_hours: crewHours || null,
    labour_cost: rate != null && crewHours > 0 ? round2(rate * crewHours) : null,
    pieces_variance_pct: pct,
    /** Wide enough that somebody should look at it - see PIECES_VARIANCE_PCT. */
    pieces_flagged: overVariance(pct),
  };
}

export const decorate = (row) => {
  if (!row) return row;
  const open = !row.ended_at;
  return {
    ...row,
    sources: sourcesOf(row),
    // Only the presses and the two moulding activities are costed on the run
    // itself; every other line is costed by the batch or the shift, out of the
    // views the back office reads.
    ...(row.kind === 'press' ? pressCost(row) : {}),
    ...(isMoulding(row.kind) ? mouldingFigures(row) : {}),
    status: open ? 'running' : 'done',
    stopped_at: row.ended_at ?? null,
    out_weight: row.weight_kg ?? null,
    batch_id: row.batch_no ?? null,
    // Whether a run still owes a weight depends on its machine, which a single
    // row cannot answer - listPendingWeigh() sets this once it has that list.
    needs_weight: false,
    // Null on every run weighed before the column existed, and on a project
    // that has not run supabase/schema.sql - the total is all there is of those.
    weigh_entries: Array.isArray(row.weigh_entries) ? row.weigh_entries : null,
    packed_sacks: row.packed_sacks ?? null,
    /*
     * How many of a press run's pieces have been boxed and filed as stock.
     *
     * Null rather than zero while nobody has been to the boxing bench, exactly
     * as `packed_sacks` is: "none boxed yet" and "boxed, and it came to none"
     * are different states, and the Packing tab lists the first and not the
     * second.
     */
    packed_pieces: row.packed_pieces ?? null,
    // What the cycle and the mould said this run should have made. Null on
    // everything that is not moulded a lot at a time, and on a product the back
    // office has not measured a cycle or a set of cavities into yet.
    pieces_expected: row.pieces_expected ?? null,
    leftout_in: row.leftout_in ?? null,
    leftout_out: row.leftout_out ?? null,
    /*
     * The picking gang, under the names the screens use.
     *
     * The columns are the tablets' - `pickcut_workers` and `pickcut_hours`,
     * from "pick and cut" - and they were written and then never read by
     * anything. They are read now: picking is what feeds the cracker, and its
     * labour is part of what a kg of crumb costs. See crumb.service.js.
     *
     * `picking_labour_hours` is the product the costing actually spends, worked
     * out here so no screen has to multiply two columns and get it slightly
     * differently. Null rather than zero where the gang was never recorded - a
     * shift nobody entered picking for is not a shift nobody picked on.
     */
    picking_labourers: row.pickcut_workers ?? null,
    picking_hours: row.pickcut_hours ?? null,
    picking_labour_hours: round2(pickingHoursOf(row)) || null,
  };
};

const decorateList = (result) => ({ ...result, rows: result.rows.map(decorate) });

/** What a meter pair says was used. Null unless both ends are on record. */
const meterDiff = (start, end) =>
  start == null || end == null ? null : round2(Math.max(0, Number(end) - Number(start)));

/**
 * The energy a meter pair accounts for, in kWh.
 *
 * Soorya has no energy meter of its own, so its figure is read off a TOD meter
 * that shows one phase only: the true 3-phase energy is the difference times
 * three, and the raw readings stay as they were read.
 */
function derivedKwh(machineId, elecStart, elecEnd) {
  const used = meterDiff(elecStart, elecEnd);
  if (used == null) return null;
  return round2(machineId === 'GRD_O' ? used * 3 : used);
}

/**
 * The energy to record when stopping. A difference entered by hand wins over
 * the meter pair - it is what the crew reaches for when the readings themselves
 * are not to be had.
 */
function kwhOf(run, payload) {
  if (payload.kwh != null) {
    return round2(run.machine_id === 'GRD_O' ? Number(payload.kwh) * 3 : Number(payload.kwh));
  }
  return derivedKwh(run.machine_id, run.elec_start, payload.elecEnd);
}

/** Hours run, from the figure the crew entered or from the hour meter. */
function hoursOf(run, payload) {
  if (payload.hoursRun != null) return round2(Number(payload.hoursRun));
  return meterDiff(run.hour_start, payload.hourEnd);
}

/**
 * The production line a machine's runs belong to. The back office's efficiency
 * figures are grouped by it - refiner passes as `special`, the grinders as
 * `grind` - so a run that leaves it unset would go unreported.
 */
function lineFor(kind) {
  if (kind === 'grind') return 'grind';
  if (kind === 'coarse') return 'coarse';
  if (kind === 'refiner' || kind === 'prerefiner') return 'special';
  // The presses are their own line: they mould finished goods out of reclaim
  // rather than making it, so they belong to none of the three above. Sleeve and
  // loop are each their own for the same reason, and separately from one another
  // - they are two activities the back office wants to read apart, which is the
  // whole point of giving them their own cards.
  if (kind === 'press') return 'press';
  if (isMoulding(kind)) return kind;
  return null;
}

/**
 * The curing settings a press run is moulded at.
 *
 * Copied off the product as the run starts rather than read back through it, so
 * a rate or a temperature changed next month does not rewrite what this run was
 * moulded at, or what it cost. The two the floor may set for one run - the cycle
 * time and the cavities, when a different mould is on - come off the sheet where
 * it said so and off the product otherwise. Temperature and the compound rate
 * are the product's alone; a tablet does not get to name either.
 *
 * `product` is the product's id and not its name, because it is a key rather
 * than a caption: the yard files moulded stock under it, `stock_groups.
 * product_id` is a foreign key to `products.id`, and the lab's verdict on what
 * a press moulded is addressed by it. It used to hold the name, which read
 * better on a card and matched nothing at all - productOf() found no product,
 * so the pack and the piece weight were lost, and the stock group's product_id
 * was a value the products table had never heard of.
 */
async function pressFields(payload) {
  const id = String(payload.product ?? '').trim();
  if (!id) throw ApiError.badRequest('A press run has to say which product it is moulding');
  const product = await productService.findById(id).catch(() => {
    throw ApiError.badRequest(`No product on the list is called ${id}`);
  });
  return {
    product: product.id,
    cure_temp_c: product.cure_temp_c ?? null,
    compound_rate: product.compound_rate ?? null,
    cyclic_min: payload.cyclicMin ?? product.cyclic_min ?? null,
    cavities: payload.cavities ?? product.cavities ?? null,
  };
}

/**
 * The rupees per labourer-hour in force on the day a run was worked.
 *
 * Snapshotted onto the run rather than looked up when the cost is read, for the
 * reason every other rate in this project is: a raise entered next month prices
 * next month, and a closed month stays closed. The dated history has the first
 * word and the undated figure on the Rates tab is the fallback, which is exactly
 * the order the crumb costing reads them in - see rate.service's labourRateAt().
 *
 * Zero rather than a throw when the plant has never entered either. A shift is
 * not stopped because a settings field is empty; the run logs with no labour
 * cost against it and the figure appears the moment a rate is set and the run is
 * corrected. Same reasoning as a product with no compound rate.
 */
async function labourRateFor(shiftDate) {
  try {
    const [history, costs] = await Promise.all([
      rateService.labourRates().catch(() => []),
      rateService.costRates().catch(() => ({ data: {} })),
    ]);
    const { rate } = labourRateAt(shiftDate, history, costs?.data?.pickingLabourPerHour ?? 0);
    return Number(rate) > 0 ? Number(rate) : null;
  } catch (err) {
    logger.warn(`Starting a run on ${shiftDate}: the labour rate was not read - ${err.message}`);
    return null;
  }
}

/**
 * What a sleeve or loop run is set up with, and the number it will be recorded
 * under.
 *
 * The product carries the same snapshot a press run takes off it - the cure, the
 * mould, the compound rate - because the reasoning is identical: those are what
 * the run was made at, and a master edited next month must not rewrite them.
 * Cavities and a cycle time are only asked for where the item is moulded at all;
 * a sleeve that is cut has neither, and a mould's worth of settings against it
 * would be figures nobody set.
 *
 * The batch number is generated here and nowhere else. It is never taken from
 * the request even though the tablet has already worked out and displayed the
 * same string - a client that could name its own lot could file this shift's
 * pieces into last week's, which is the same rule the coarse pool's label runs
 * on. The two implementations agreeing is what the shared util is for; this one
 * is the one of record.
 *
 * The number is the shift and only the shift, so it does not identify the lot on
 * its own - `product` beside it is the other half, and the two are what the yard
 * and the lab key on. That is why the product is refused below rather than
 * defaulted: a run with no product against it has no lot for its pieces to go
 * into, whatever number it carries.
 */
async function mouldingFields(payload, shiftDate, shift) {
  const id = String(payload.product ?? '').trim();
  if (!id) throw ApiError.badRequest('A sleeve or loop run has to say what it is making');
  const product = await productService.findById(id).catch(() => {
    throw ApiError.badRequest(`No product on the list is called ${id}`);
  });

  const moulded = product.moulded !== false;
  const batchNo = mouldingBatchNo({ shiftDate, shift });
  if (!batchNo) {
    throw ApiError.badRequest(
      'A batch number could not be generated - the run needs a date and a shift',
    );
  }

  return {
    batch_no: batchNo,
    product: product.id,
    cure_temp_c: product.cure_temp_c ?? null,
    compound_rate: product.compound_rate ?? null,
    cyclic_min: moulded ? payload.cyclicMin ?? product.cyclic_min ?? null : null,
    cavities: moulded ? payload.cavities ?? product.cavities ?? null : null,
    labour_rate: await labourRateFor(shiftDate),
  };
}

/**
 * The lines that keep one record per machine per shift rather than one per
 * start: the coarse line and the grinding line are run *for a shift*, so a
 * machine stopped for a blockage and started again half an hour later is still
 * the same shift's work and belongs on the same row.
 *
 * A coarse autoclave charge is the exception. It carries a batch number of its
 * own, and two charges cooked in one shift are two loads however they are
 * counted - so anything with a batch against it stays its own row.
 */
const SHIFTWISE_LINES = ['coarse', 'grind'];

const mergesByShift = (run) =>
  SHIFTWISE_LINES.includes(run.line) &&
  run.kind !== 'autoclave' &&
  !run.autoclave_id &&
  !run.batch_no &&
  Boolean(run.shift_date && run.shift);

/**
 * The same rule for sleeve and loop, keyed on the lot rather than on the
 * machine.
 *
 * A lot is the product, the shift date and the shift - the last two are its
 * batch number and the first is the column beside it - so a second run of the
 * same product in the same shift is more of the same lot however it was started.
 * Stopping and starting for a mould change did not make two batches, and
 * recording it as two would put two rows in the yard claiming the same key.
 *
 * Deliberately not keyed on the machine, which is where this differs from the
 * coarse and grinding lines. Those merge per machine because the record is "what
 * this machine did this shift"; here the record is the lot, and the lot does not
 * become two because the crew moved benches. `passes` is what says how many
 * start/stops it took.
 */
const mergesByLot = (run) =>
  isMoulding(run.kind) && Boolean(run.product && run.shift_date && run.shift);

/**
 * The picking figures a stop is filing, or nothing at all.
 *
 * Picking belongs to the cracker - it is the gang that pulls scrap tyres out of
 * the yard and feeds them to it - so nothing else may record any, and a payload
 * that tries is ignored rather than refused: the run itself is fine, and a crew
 * standing at a machine should not be arguing with a form about a field their
 * sheet should never have shown them.
 *
 * A field left out keeps what the run already had, which is what makes a second
 * stop in the same shift able to leave picking alone.
 */
function pickingPatch(run, payload = {}) {
  if (!isCracker(run.machine_id)) return {};
  const labourers = payload.pickingLabourers ?? run.pickcut_workers;
  const hours = payload.pickingHours ?? run.pickcut_hours;
  return {
    pickcut_workers: labourers == null ? null : Number(labourers),
    pickcut_hours: hours == null ? null : round2(Number(hours)),
  };
}

/** Adds two figures that may each be missing; null only when both are. */
const addNum = (a, b) =>
  a == null && b == null ? null : round2(Number(a ?? 0) + Number(b ?? 0));

/** A crew is a headcount, not a running total - the shift ran with the most. */
const maxNum = (a, b) => {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(Number(a), Number(b));
};

const entriesOf = (row) => (Array.isArray(row?.weigh_entries) ? row.weigh_entries : []);

/**
 * The shift's record with one more start/stop folded into it.
 *
 * `record` is what the shift already had, `run` the row this stop was logged on
 * and `leg` that stop's own figures. Everything spent - energy, firewood, time,
 * output - is the shift's total across every start of it; the crew is a
 * headcount rather than a running total, so the shift ran with the most of them
 * it ever had at once; and the meters bracket the whole shift, keeping the
 * reading it opened on and taking the latest one as its close.
 */
export function mergePatch(record, run, leg) {
  const entries = [...entriesOf(record), ...entriesOf(run)];
  return {
    ended_at: leg.ended_at,
    // What History reports as "3 start/stops combined".
    passes: (Number(record.passes) || 1) + 1,
    kwh: addNum(record.kwh, leg.kwh),
    firewood_kg: addNum(record.firewood_kg, leg.firewood_kg),
    runtime_min: addNum(record.runtime_min, leg.runtime_min),
    hours_run: addNum(record.hours_run, leg.hours_run),
    weight_kg: addNum(record.weight_kg, leg.weight_kg),
    workers: maxNum(record.workers, leg.workers),
    /*
     * The picking gang, folded the same way the machine's own crew is: the
     * shift picked with the most hands it ever had on it at once, for as long
     * as the starts of it add up to. A cracker stopped for a blockage and
     * started again did not send the gang home and hire a second one.
     */
    pickcut_workers: maxNum(record.pickcut_workers, leg.pickcut_workers),
    pickcut_hours: addNum(record.pickcut_hours, leg.pickcut_hours),
    elec_start: record.elec_start ?? run.elec_start,
    hour_start: record.hour_start ?? run.hour_start,
    elec_end: leg.elec_end ?? record.elec_end,
    hour_end: leg.hour_end ?? record.hour_end,
    // Loads banked on either row are the same shift's output.
    weigh_entries: entries.length ? entries : null,
    needs_weigh: Boolean(record.needs_weigh || run.needs_weigh),
    /*
     * What a sleeve or loop lot made across all of its start/stops.
     *
     * Pieces and flash add for the same reason the weight does - both are output
     * of the lot, however many times the bench was stopped. So does the expected
     * count: each leg is measured against its own run time and its own mould, so
     * adding them is what "what should this lot have made" means. A leg that
     * could not be measured contributes nothing rather than dragging the total
     * to null, which is what addNum() does.
     *
     * Null on every other line, where both are already null and stay so.
     */
    pieces: addNum(record.pieces, leg.pieces),
    pieces_expected: addNum(record.pieces_expected, leg.pieces_expected),
    flash_kg: addNum(record.flash_kg, leg.flash_kg),
    // Filled in from this leg only where the shift had nothing on record.
    formulation: record.formulation ?? run.formulation,
    // A lot's own snapshots. The number and the rate belong to the lot as it was
    // opened, so a leg logged later joins it rather than renaming or re-pricing
    // it - a rate that changed mid-shift is not a thing, and a batch number that
    // moved would leave stock filed under the old one.
    batch_no: record.batch_no ?? run.batch_no,
    product: record.product ?? run.product,
    labour_rate: record.labour_rate ?? run.labour_rate,
    cyclic_min: record.cyclic_min ?? run.cyclic_min,
    cavities: record.cavities ?? run.cavities,
    cure_temp_c: record.cure_temp_c ?? run.cure_temp_c,
    compound_rate: record.compound_rate ?? run.compound_rate,
    tyre_type: record.tyre_type ?? run.tyre_type,
    mesh: record.mesh ?? run.mesh,
    supervisor: record.supervisor ?? run.supervisor,
    remarks: leg.remarks ?? record.remarks,
  };
}

/**
 * The filter that keeps non-production runs off a list.
 *
 * Written as an `or` rather than `non_production.eq.false` because the column
 * is one of the ones supabase/schema.sql adds: every run the tablets recorded
 * before it existed reads null there, and all of those were production. On a
 * project that has not been migrated yet the column cannot be filtered on at
 * all, so the list falls back to showing everything rather than erroring.
 */
function productionOnly() {
  const missing = absentSchema()[TABLES.runs] ?? [];
  if (missing.includes('non_production')) return {};
  return { or: ['non_production.is.null', 'non_production.eq.false'] };
}

/** Editable field -> the column it is stored in, for the History tab's edits. */
const EDITABLE_COLUMNS = {
  batchNo: 'batch_no',
  formulation: 'formulation',
  quality: 'quality',
  shiftDate: 'shift_date',
  shift: 'shift',
  supervisor: 'supervisor',
  workers: 'workers',
  elecStart: 'elec_start',
  elecEnd: 'elec_end',
  hourStart: 'hour_start',
  hourEnd: 'hour_end',
  outWeight: 'weight_kg',
  firewoodKg: 'firewood_kg',
  capacity: 'capacity',
  packedSacks: 'packed_sacks',
  remarks: 'remarks',
  // A press run. Its material cost follows the weight, the flash and the pieces,
  // so correcting any of them re-costs the run on the next read - there is no
  // stored total to drift out of step. The compound rate is deliberately not
  // editable here: it is the rate that applied when the run was moulded.
  product: 'product',
  cavities: 'cavities',
  cyclicMin: 'cyclic_min',
  pieces: 'pieces',
  flashKg: 'flash_kg',
  // The picking gang on a cracker shift. What was entered at the machine is a
  // supervisor's estimate - "four of them, about three hours" - so it is
  // correctable here like any other figure, and correcting it re-prices the
  // crumb the window made on the next read. There is no stored total behind it
  // to go stale; see crumb.service.js.
  pickingLabourers: 'pickcut_workers',
  pickingHours: 'pickcut_hours',
};

/**
 * Machine ids whose runs are weighed after the fact, read once per call.
 * Goes through machineService rather than the table so the Weigh tab still
 * works off the in-memory machine list until supabase/schema.sql has been run.
 */
async function weighedMachineIds() {
  const { rows } = await machineService.list({ limit: 200, order: 'asc' });
  return rows.filter((m) => m.out_weight || m.weigh).map((m) => m.id);
}

/**
 * The most recent shift that actually has runs. The shop-floor History tab
 * asks for "today", but a plant that has not started yet today would then show
 * an empty table for the whole first half of the shift.
 */
async function latestShiftWithRuns() {
  const row = await base.findOne({ shift_date: op.notNull() }, { sort: 'shift_date' });
  return row ? { date: row.shift_date, shift: row.shift } : null;
}

/**
 * The record this machine's earlier start/stops in the same shift are already
 * on, if there is one. The oldest is taken deliberately: it holds the reading
 * the shift opened on, which is the one that has to survive the merge.
 */
async function shiftRecordFor(run) {
  if (mergesByLot(run)) {
    // The lot this product already has for the shift, on whichever machine
    // opened it. Postgres holds the same rule from below - see the partial
    // unique index runs_moulding_lot_key in migrations/0006 - so a race between
    // two tablets is refused rather than filed as a duplicate lot.
    return base.findOne(
      {
        kind: MOULDING_KINDS,
        product: run.product,
        shift_date: run.shift_date,
        shift: run.shift,
        ended_at: op.notNull(),
        id: op.neq(run.id),
      },
      { sort: 'started_at', ascending: true },
    );
  }
  if (!mergesByShift(run)) return null;
  return base.findOne(
    {
      machine_id: run.machine_id,
      line: run.line,
      shift_date: run.shift_date,
      shift: run.shift,
      ended_at: op.notNull(),
      id: op.neq(run.id),
    },
    { sort: 'started_at', ascending: true },
  );
}

/**
 * The packed output of a run, taken back out of the yard.
 *
 * The keying is the one the packing bench used, because it has to be: a press
 * files pieces against its product and pack, a coarse run pools by period, and
 * anything else goes to its batch and grade - see stockService.targetOf().
 *
 * One thing is a best guess and worth naming. A pool is keyed on the day the
 * sacks were *filed*, and the run does not record which day the Packing tab was
 * used - only the shift it was made on. Bagging is same-day or next-morning
 * work, so the shift date lands in the right ten-day pool nearly always, and
 * when it does not the reversal finds nothing rather than taking sacks out of
 * the wrong period. Nothing is what the caller is then told; see clearTraces().
 */
async function unfileStock(run) {
  // Both benches that count in pieces. Which group they came out of differs -
  // a press pools by product and pack, a sleeve or loop shift is its own lot -
  // and targetOf() is what knows, from the same `kind` that filed them.
  const boxed = run.kind === 'press' || isMoulding(run.kind);
  const qty = boxed ? Number(run.packed_pieces || 0) : Number(run.packed_sacks || 0);
  if (qty <= 0) return null;

  if (boxed) {
    const product = await runService.productOf(run).catch(() => null);
    const productId = product?.id ?? run.product ?? null;
    return stockService.reversePacking({
      kind: isMoulding(run.kind) ? 'lot' : 'product',
      productId,
      packSize: product?.pack_size ?? null,
      quality: productId,
      batchNo: run.batch_no,
      qty,
      packedOn: run.shift_date ?? todayISO(),
    });
  }

  return stockService.reversePacking({
    quality: run.quality ?? (run.line === 'coarse' ? COARSE_GRADE : null),
    batchNo: run.batch_no,
    qty,
    packedOn: run.shift_date ?? todayISO(),
  });
}

/** The lab's tests filed against this run, on a project that records the tie. */
async function testsOf(runId) {
  if ((absentSchema()[TABLES.qualityTests] ?? []).includes('run_id')) return [];
  return tests.all({ run_id: runId }).catch(() => []);
}

/**
 * Everything a run put outside its own row, taken back before the row goes.
 *
 * A run is not only a row in `runs`. Packing it filed sacks into a stock group,
 * the bench may have tested the machine against it, and a lorry may already
 * have carried the result out of the gate. Deleting the row alone left all
 * three behind - stock in the yard belonging to a run that no longer exists,
 * lab tests pointing at nothing, and no way to notice either from any screen.
 *
 * The order is the point:
 *
 *   1. refuse if the output has been dispatched. The ledger says those sacks
 *      left, and nothing here may make that untrue. A dispatch is corrected by
 *      a reversal document, which is the same rule dispatch.routes runs on.
 *   2. take the packing back out of the yard - this can also refuse, and it
 *      does so before anything at all has been deleted.
 *   3. delete the lab's tests, through qualityService so the verdicts they were
 *      carrying come off the stock groups with them.
 *
 * So either the whole thing goes or none of it does, short of a failure between
 * the steps. There is no transaction across PostgREST calls to have; what there
 * is instead is an order in which a partial failure leaves the record readable,
 * and this is it - stock is corrected before its run disappears, never after.
 */
async function clearTraces(run) {
  const id = run.id;

  let sold = 0;
  try {
    sold = Number((await dispatchService.sacksByRun([id]))[id] ?? 0);
  } catch (err) {
    // A project with no `run_id` on dispatches cannot answer this. The delete
    // is not blocked on a question the schema cannot be asked - the reversal
    // below still refuses to push a group below what has gone out of it.
    logger.warn(`Deleting run ${id}: the dispatches were not checked - ${err.message}`);
  }
  if (sold > 0) {
    throw ApiError.conflict(
      `${sold} of this run's packed output has already been dispatched - reverse that dispatch before deleting the run`,
    );
  }

  const boxed = run.kind === 'press' || isMoulding(run.kind);
  const packed = boxed ? Number(run.packed_pieces || 0) : Number(run.packed_sacks || 0);
  const stock = await unfileStock(run);

  const filed = await testsOf(id);
  for (const test of filed) await qualityService.remove(test.id);

  return {
    /**
     * What came back out of the yard, and out of which group. `removed` is the
     * group emptying completely and going with it - the run was the only thing
     * that ever put anything in it, so there is no yard row left to explain.
     */
    stock_cleared: stock
      ? {
          id: stock.id,
          label: stock.display_label ?? stock.label,
          taken: packed,
          left: stock.removed ? 0 : stock.available_sacks,
          removed: Boolean(stock.removed),
        }
      : null,
    /*
     * Packed output that no group could be found for. Not an error and not
     * silence either: the sacks are unaccounted for in the yard and somebody
     * has to be told which, because no screen would ever show it.
     */
    stock_note:
      packed > 0 && !stock
        ? `${packed} packed ${boxed ? 'pieces' : 'sacks'} could not be traced to a stock group - check the yard for ${run.batch_no ?? 'this period'}`
        : null,
    quality_tests_deleted: filed.length,
  };
}

export const runService = {
  ...base,

  /**
   * Runs matching the filters, one page at a time - or every last one of them
   * when the caller asks for `all`. The History tab shows the plant's whole
   * record rather than a page of it, and that is already well past the 200-row
   * pagination ceiling.
   */
  async list(query = {}, filters = {}) {
    if (query.all === true || query.all === '1' || query.all === 'true' || query.limit === 'all') {
      const rows = (
        await base.all(filters, {
          sort: query.sort || undefined,
          ascending: String(query.order || 'desc').toLowerCase() === 'asc',
        })
      ).map(decorate);
      return { rows, total: rows.length, page: 1, limit: rows.length };
    }
    return decorateList(await base.list(query, filters));
  },

  async findById(id) {
    return decorate(await base.findById(id));
  },

  /** Runs still in progress: started, not yet ended. */
  async listActive(query = {}) {
    return decorateList(await base.list(query, { ended_at: op.isNull() }));
  },

  /**
   * Finished runs on a weighed machine that nobody has put a weight against.
   * This is what the Weigh tab lists - the prototype's `pendingWeigh()`.
   *
   * A non-production run is left out: it produced nothing to put on the scale,
   * so listing it would leave a row nobody can ever clear.
   */
  async listPendingWeigh(query = {}) {
    const machineIds = await weighedMachineIds();
    if (!machineIds.length) return { rows: [], total: 0, page: 1, limit: 0 };
    const result = await base.list(
      { order: 'desc', sort: 'ended_at', ...query },
      { machine_id: machineIds, weight_kg: op.isNull(), ...productionOnly() },
    );
    return {
      ...result,
      rows: result.rows.map((row) => ({ ...decorate(row), needs_weight: true })),
    };
  },

  /**
   * The other half of the Weigh tab: runs on a weighed machine that already
   * have a weight against them, newest first, so a figure typed wrong can be
   * found and put right.
   *
   * The count comes back alongside the page - the tab says "latest 20 of 414"
   * rather than pretending the page is the whole record - and `all` fetches
   * every one of them for the tab's Show all.
   */
  async listWeighed(query = {}) {
    const machineIds = await weighedMachineIds();
    if (!machineIds.length) return { rows: [], total: 0, page: 1, limit: 0 };
    const filters = { machine_id: machineIds, weight_kg: op.gt(0), ...productionOnly() };

    if (query.all === true || query.all === '1' || query.all === 'true' || query.limit === 'all') {
      const rows = (await base.all(filters, { sort: 'ended_at' })).map(decorate);
      return { rows, total: rows.length, page: 1, limit: rows.length };
    }
    const result = await base.list({ order: 'desc', sort: 'ended_at', limit: 20, ...query }, filters);
    return { ...result, rows: result.rows.map(decorate) };
  },

  /**
   * Weighed runs that still have sacks to pack - what the Packing tab lists.
   *
   * Only graded output is bagged: refiner output that carries a quality, and
   * the coarse line's shift output. The grinders are weighed too, but that is
   * crumb going back into the process, so it never reaches the bagging line.
   *
   * A run is done packing when what is left after the full sacks is under one
   * sack, because that remainder is carried into the next batch of the same
   * grade rather than bagged. `packed_sacks` being null means nobody has been
   * to the bagging line yet.
   */
  async listPendingPack(query = {}) {
    const result = await base.list(
      { order: 'desc', sort: 'ended_at', limit: 200, ...query },
      {
        weight_kg: op.gt(0),
        or: ['quality.not.is.null', 'line.eq.coarse'],
      },
    );
    const rows = result.rows
      .map((row) => ({ ...decorate(row), needs_pack: true }))
      // A blank quality is not a grade, so it only belongs here on the coarse
      // line. Postgres cannot tell '' from a grade in the `or` above, so the
      // last word on it is here.
      .filter((row) => row.quality || row.line === 'coarse')
      .filter((row) => {
        const total = Number(row.weight_kg || 0) + Number(row.leftout_in || 0);
        const packed = Number(row.packed_sacks || 0) * SACK_KG;
        return row.packed_sacks == null || total - packed >= SACK_KG;
      });

    /*
     * And the presses.
     *
     * They are read separately because nothing about them fits the filter
     * above: a press has no quality and is not the coarse line, and what it owes
     * the yard is a count of pieces rather than a weight to divide into sacks.
     * One query covering both would be a pair of `or` branches nobody could read
     * afterwards.
     *
     * A press run belongs here while it has moulded more pieces than have been
     * boxed. Until this existed its pieces reached the yard nowhere at all - the
     * count sat on the run and the Stock page, which is meant to be every packed
     * thing in the plant, could not see a shift's moulding.
     */
    const pressed = await base.list(
      { order: 'desc', sort: 'ended_at', limit: 200, ...query },
      // And the sleeve and loop benches, which owe the yard a count of pieces on
      // exactly the same terms - the only difference is which group the pieces
      // are filed into, and that is settled at the door in packPieces().
      { kind: ['press', ...MOULDING_KINDS], pieces: op.gt(0) },
    );
    const presses = pressed.rows
      .map((row) => ({ ...decorate(row), needs_pack: true }))
      .filter((row) => Number(row.pieces || 0) > Number(row.packed_pieces || 0));

    const all = [...rows, ...presses];
    return { ...result, rows: all, total: all.length };
  },

  /**
   * The packed sacks still in the yard - what the Stock tab loads a vehicle
   * from, rather than having the grade, the batch and the count typed again.
   *
   * The same graded output the Packing tab bags, read from the other end: a run
   * enters this list the moment it has sacks against it, and leaves it once as
   * many have been dispatched as were ever packed. Packing is not waited on to
   * finish, because part of a batch can go out while the rest is still being
   * bagged.
   *
   * What has already left is counted off the dispatches tied to the run, so a
   * load saved against it draws its stock down and the same sacks cannot go out
   * twice. A load typed in by hand carries no run, and draws nothing down.
   */
  async listPacked(query = {}) {
    const result = await base.list(
      { order: 'desc', sort: 'ended_at', limit: 200, ...query },
      {
        weight_kg: op.gt(0),
        packed_sacks: op.gt(0),
        or: ['quality.not.is.null', 'line.eq.coarse'],
      },
    );
    // As in listPendingPack: Postgres cannot tell a blank quality from a grade,
    // so a run without one only belongs here on the coarse line.
    const rows = result.rows.map(decorate).filter((row) => row.quality || row.line === 'coarse');
    const gone = await dispatchService.sacksByRun(rows.map((row) => row.id));

    const stock = rows
      .map((row) => {
        const dispatched = gone[row.id] ?? 0;
        const avail = Number(row.packed_sacks || 0) - dispatched;
        return {
          ...row,
          dispatched_sacks: dispatched,
          avail_sacks: avail,
          avail_kg: round2(avail * SACK_KG),
        };
      })
      .filter((row) => row.avail_sacks > 0);

    return { ...result, rows: stock, total: stock.length };
  },

  /**
   * One shift's runs. With no date given it falls back to the latest shift on
   * record instead of an empty "today", so the tab always opens on real work.
   */
  async byShift(query = {}) {
    let date = query.date;
    let shift = query.shift;

    if (!date) {
      const today = todayISO();
      const hasToday = await base.exists({ shift_date: today });
      if (hasToday) {
        date = today;
        shift = shift || currentShift();
      } else {
        const latest = await latestShiftWithRuns();
        date = latest?.date ?? today;
        shift = shift || latest?.shift || currentShift();
      }
    }

    const result = await base.list(query, { shift_date: date, shift });
    return { ...decorateList(result), shift_date: date, shift };
  },

  async start(payload) {
    const inProgress = await base.exists({
      machine_id: payload.machineId,
      ended_at: op.isNull(),
    });
    if (inProgress) throw ApiError.conflict('That machine already has a run in progress');

    const machine = await machineService
      .findById(payload.machineId)
      .catch(() => { throw ApiError.notFound('Unknown machine ' + payload.machineId); });

    // The coarse-line machines can be turned onto the special line for a batch,
    // so the tablet says which line this run is on and the machine's own kind is
    // only the fallback.
    const nonProduction = payload.nonProduction === true;
    const isAutoclave = machine.kind === 'autoclave';
    const isPress = machine.kind === 'press';
    const moulding = isMoulding(machine.kind);
    const startedAt = payload.startedAt || new Date().toISOString();
    const shiftDate = payload.shiftDate || todayISO();
    const shift = payload.shift || currentShift();
    // A press is set up for a product, and the curing settings come off that
    // product rather than off the sheet. It carries no batch number of its own:
    // what it moulded is named by the product, and the compound it moulded it
    // out of is not tracked back to a batch on the press floor.
    const press = isPress ? await pressFields(payload) : null;
    /*
     * Sleeve and loop take the same snapshot and one thing more: the batch
     * number, generated from the shift date and the shift. Nobody types it and
     * nothing in the request can name it - see mouldingFields(). The product
     * beside it is what makes the pair a lot.
     */
    const mould = moulding ? await mouldingFields(payload, shiftDate, shift) : null;

    const row = await base.create({
      machine_id: payload.machineId,
      machine: machine.name ?? null,
      kind: machine.kind ?? null,
      line: payload.line ?? lineFor(machine.kind),
      batch_no: payload.batchNo ?? payload.batchId ?? null,
      formulation: payload.formulation ?? null,
      tyre_type: payload.tyreType ?? null,
      mesh: payload.mesh ?? null,
      quality: payload.quality || null,
      capacity: machine.capacity ?? null,
      shift_date: shiftDate,
      shift: shift,
      supervisor: payload.supervisor ?? null,
      workers: payload.workers ?? null,
      // An autoclave run belongs to the vessel it was charged in, and says
      // whether that charge was shared with the twin autoclave. It is timed by
      // its charge rather than by a meter, so the load time is kept under its
      // own name as well - the column the tablets have always written.
      autoclave_id: isAutoclave ? machine.id : null,
      paired: payload.paired ?? false,
      loaded_at: isAutoclave ? startedAt : null,
      passes: 1,
      started_at: startedAt,
      // Meter readings taken as the machine starts; the stop pair turns them
      // into the run's kWh and hours - see efficiency.service's runKwh().
      elec_start: payload.elecStart ?? null,
      hour_start: payload.hourStart ?? null,
      // The special line can refine one batch with the tailings of others mixed
      // into it; the batch being refined is the first of them.
      ...sourceColumns(payload.sources),
      // A press run: the product it is set up for and what it is moulded at.
      ...(press ?? {}),
      // A sleeve or loop run: the same, plus the batch number it will be
      // recorded under and the labour rate of the day. Spread after `batch_no`
      // above on purpose - the generated number is the only one a lot may carry,
      // and a request that sent one of its own is overwritten rather than
      // honoured.
      ...(mould ?? {}),
      ended_at: null,
      weight_kg: null,
      non_production: nonProduction,
      // A press weighs its own output at the machine and enters it at stop, and
      // so do sleeve and loop - neither ever reaches the Weigh tab however its
      // machine row is flagged.
      needs_weigh:
        !nonProduction && !isPress && !moulding && Boolean(machine.out_weight || machine.weigh),
    }).catch((err) => {
      // The database's own version of the rule - runs_one_open_per_machine, see
      // migrations/0009. It fires on exactly the race the check above cannot
      // see, and what comes back to the tablet should say which rule was
      // broken rather than "a record with that value already exists".
      if (err?.statusCode === 409) {
        throw ApiError.conflict('That machine already has a run in progress');
      }
      throw err;
    });

    /*
     * The guard at the top is a check and then an insert with a round trip in
     * between, so two Starts sent close enough together both pass it before
     * either row lands and the machine is left with two runs open. That is not
     * theoretical: a tablet double-tapped through a slow reply put seven open
     * runs on the Cracker, and because the Machines page keys one card per
     * machine, six of them were invisible - stopping the one on the card handed
     * it to the next, which on the floor is a machine that will not stop.
     *
     * So the question is asked again now that the row exists, and the losers
     * take themselves back out. The winner is the oldest open row - the run the
     * crew watched appear - with the id breaking a tie, which is a rule every
     * racer applies to the same set and so agrees on: whichever of them reads
     * last, exactly one row is left.
     *
     * migrations/0009 puts the same rule in the database, where the race cannot
     * be run at all. This stays either way: a project that has not had the
     * migration run against it is still covered.
     */
    const others = await base.all({
      machine_id: payload.machineId,
      ended_at: op.isNull(),
      id: op.neq(row.id),
    });
    const beaten = others.some((other) => {
      const theirs = String(other.started_at ?? '');
      const ours = String(row.started_at ?? '');
      return theirs < ours || (theirs === ours && String(other.id) < String(row.id));
    });
    if (beaten) {
      await base.remove(row.id).catch((err) => {
        logger.warn(`Duplicate run ${row.id} on ${payload.machineId} could not be removed - ${err.message}`);
      });
      throw ApiError.conflict('That machine already has a run in progress');
    }

    return decorate(row);
  },

  /**
   * Logs a run off the machine.
   *
   * On the batch lines that is the end of it - the row is closed where it
   * stands. On the coarse and grinding lines it is not: those are run for a
   * shift, so a machine started again inside the same shift is folded back into
   * the record that shift already has rather than opening a second one. The row
   * this stop was logged on then goes, and the merged record comes back
   * carrying `merged_from` so the tablet knows which id it replaced.
   */
  async stop(id, payload = {}) {
    const run = await base.findById(id);
    if (run.ended_at) throw ApiError.conflict('Run is not in progress');
    const ended = payload.stoppedAt || new Date().toISOString();
    const started = run.started_at ? new Date(run.started_at).getTime() : null;
    const clockMin = started ? Math.round((new Date(ended).getTime() - started) / 60000) : null;
    // What the crew recorded, then the hour meter, then the clock. The minutes
    // follow the hours whenever the hours came from a reading: the two describe
    // the same run, and screens that show minutes read that column first.
    const recordedHours = hoursOf(run, payload);
    // A press records no run hours at all - it has no hour meter and none of the
    // figures a plant machine's hours are read for: no energy per hour, no kilos
    // per hour, no utilisation. Its start and stop times are still on the row, so
    // how long it ran is there to be seen; it is simply not booked as run time
    // that the plant's own hours are added up from.
    const isPressRun = run.kind === 'press';
    /*
     * Sleeve and loop book no run hours either, for the same reasons a press
     * does not: no hour meter, and none of the figures a plant machine's hours
     * are read for. What they do keep, and a press does not, is the run time in
     * minutes - the cycle and the mould are measured against it, so how long the
     * bench actually ran is the input to the expected count rather than a number
     * only shown on a card.
     */
    const isMouldingRun = isMoulding(run.kind);
    const hoursRun = isPressRun || isMouldingRun
      ? run.hours_run ?? null
      : recordedHours ?? run.hours_run ?? (clockMin != null ? +(clockMin / 60).toFixed(2) : null);

    const runtimeMin = isPressRun
      ? run.runtime_min ?? null
      : recordedHours != null
        ? Math.round(recordedHours * 60)
        : run.runtime_min ?? clockMin;

    // This start/stop on its own, before anything is decided about where it
    // gets filed.
    const leg = {
      ended_at: ended,
      // See start(): an autoclave keeps its own discharge time alongside.
      unloaded_at: run.kind === 'autoclave' ? ended : run.unloaded_at,
      runtime_min: runtimeMin,
      hours_run: hoursRun,
      elec_end: payload.elecEnd ?? run.elec_end,
      hour_end: payload.hourEnd ?? run.hour_end,
      kwh: kwhOf(run, payload) ?? run.kwh,
      firewood_kg: payload.firewoodKg ?? run.firewood_kg,
      weight_kg: payload.outWeight ?? run.weight_kg,
      workers: payload.workers ?? run.workers,
      remarks: payload.remarks ?? run.remarks,
      // A press counts what came out of the mould, and the flash trimmed off it.
      // Both are charged as material - see pressCost().
      pieces: payload.pieces ?? run.pieces,
      flash_kg: payload.flashKg ?? run.flash_kg,
      /*
       * And on a sleeve or loop leg, what the cycle and the mould said this
       * length of run should have made.
       *
       * Written now rather than derived on read, because the three figures it
       * comes from are all correctable afterwards and a variance that quietly
       * re-computed itself would stop being a record of anything. What the crew
       * counted and what the mould predicted are two independent statements, and
       * the point of keeping both is that they can disagree.
       *
       * Null where the product has no cycle or no cavities against it, and on an
       * item that is not moulded at all - nothing was predicted, so nothing is
       * flagged. See expectedPieces().
       */
      pieces_expected: isMouldingRun
        ? expectedPieces({
            runtimeMin,
            cyclicMin: run.cyclic_min,
            cavities: run.cavities,
          })
        : run.pieces_expected,
      // The picking gang that fed the cracker this shift. Only the cracker is
      // asked, and only the cracker is believed: picking is what feeds it, and
      // a figure arriving against a grinder is a sheet sent by something that
      // has not been told which machine it is stopping.
      ...pickingPatch(run, payload),
    };

    const record = await shiftRecordFor(run);
    if (!record) return decorate(await base.update(id, leg));

    const merged = await base.update(record.id, mergePatch(record, run, leg));
    await base.remove(run.id);
    return { ...decorate(merged), merged_from: run.id };
  },

  /**
   * Banks one more load against a run that is still going - the running tally
   * the coarse refiner and the grinders keep, so each barrow is recorded as it
   * comes off instead of being remembered until the shift ends.
   *
   * The whole list is sent each time, which makes adding and removing the same
   * write. Nothing is weighed here: `weight_kg` stays empty, the run still
   * reaches the Weigh tab when it stops, and the tally is what that tab opens
   * with.
   */
  async tally(id, entries = []) {
    const run = await base.findById(id);
    if (run.ended_at) {
      throw ApiError.conflict('That run is already logged - weigh it from the Weigh tab');
    }
    const list = (Array.isArray(entries) ? entries : [])
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .map(round2);
    return decorate(await base.update(id, { weigh_entries: list.length ? list : null }));
  },

  /**
   * Corrects a run already on record - the back office's History tab.
   *
   * Energy and hours follow the readings: change a meter and the difference is
   * worked out again, so the figure the reports add up can never drift from the
   * readings it is supposed to come from. Sending `kwh` or `hoursRun` outright
   * overrides that, for the runs whose readings were never written down.
   */
  async edit(id, payload = {}) {
    const run = await base.findById(id);

    const patch = {};
    for (const [field, column] of Object.entries(EDITABLE_COLUMNS)) {
      if (payload[field] !== undefined) patch[column] = payload[field];
    }

    /*
     * A sleeve or loop lot's number is not a field.
     *
     * It is the shift date and the shift, so correcting either moves the lot and
     * the number has to follow - a run that said it made loops on the 3rd and
     * actually made them on the 4th belongs to the 4th's lot, and leaving
     * `03/Aug/26-day` on it would file the next boxing into a shift that never
     * happened. A number typed by hand is dropped for the same reason it cannot
     * be sent at start.
     *
     * The product moves the lot too, and does not appear in the number. That is
     * exactly why the check below is on all three fields rather than on the two
     * the number is built from: the lot is the product and the number together,
     * so re-pointing a run from sleeve to loop moves its output to a different
     * group while the string on the row stays word for word the same. A guard
     * that watched the number would see nothing happen.
     *
     * Not once the pieces are in the yard, though. Boxed stock is standing under
     * the old key, and moving the run out from under it is the one shape of
     * error this project keeps refusing: invisible from both ends, with a group
     * in the yard belonging to a lot that no longer exists. Delete the run - which
     * takes its stock back out through clearTraces() - and record it again.
     */
    if (isMoulding(run.kind)) {
      delete patch.batch_no;
      const moves =
        payload.product !== undefined ||
        payload.shiftDate !== undefined ||
        payload.shift !== undefined;
      if (moves) {
        if (Number(run.packed_pieces || 0) > 0) {
          throw ApiError.conflict(
            `${run.packed_pieces} of this lot's pieces are already boxed into ${run.product} ${run.batch_no} - delete the run and record it again, rather than moving it under the stock`,
          );
        }
        const after = { ...run, ...patch };
        if (!String(after.product ?? '').trim()) {
          throw ApiError.badRequest('That leaves the lot with no product - it is half of what names it');
        }
        const batchNo = mouldingBatchNo({ shiftDate: after.shift_date, shift: after.shift });
        if (!batchNo) {
          throw ApiError.badRequest('That leaves no batch number - a lot needs a date and a shift');
        }
        patch.batch_no = batchNo;
      }
    }

    // Worked out against the run as it will read once this patch lands, not as
    // it reads now - an edit that moves only the start reading still has to
    // re-derive against the end that is already on the row.
    const after = { ...run, ...patch };
    const touchedElec = payload.elecStart !== undefined || payload.elecEnd !== undefined;
    const touchedHour = payload.hourStart !== undefined || payload.hourEnd !== undefined;

    if (payload.kwh !== undefined) {
      patch.kwh = payload.kwh == null ? null : round2(Number(payload.kwh));
    } else if (touchedElec) {
      patch.kwh = derivedKwh(after.machine_id, after.elec_start, after.elec_end);
    }

    if (payload.hoursRun !== undefined || touchedHour) {
      const hours =
        payload.hoursRun !== undefined
          ? payload.hoursRun == null
            ? null
            : round2(Number(payload.hoursRun))
          : meterDiff(after.hour_start, after.hour_end);
      patch.hours_run = hours;
      // Keep the minutes in step, so the detail view cannot show an hours
      // figure and a run time that disagree.
      if (hours != null) patch.runtime_min = Math.round(hours * 60);
    }

    if (!Object.keys(patch).length) return decorate(run);
    return decorate(await base.update(id, patch));
  },

  /**
   * Throws away a run that was started by mistake: the row goes, and nothing is
   * logged against the machine. Only ever open runs - a finished one is part of
   * the plant's record, and taking it out would move production and cost
   * figures that have already been reported.
   */
  async cancel(id) {
    const run = await base.findById(id);
    if (run.ended_at) throw ApiError.conflict('That run is already logged - it cannot be cancelled');
    // An open run has packed nothing, but the bench may already have sampled the
    // machine against it - see clearTraces().
    const cleared = await clearTraces(run);
    await base.remove(id);
    return { id, machine_id: run.machine_id, machine: run.machine ?? null, ...cleared };
  },

  /**
   * Takes a run off the record for good - the History tab's delete.
   *
   * cancel() is for a run that never really happened and is still open; this is
   * for one that was logged and should not have been: the same pass entered
   * twice, or a row put against the wrong machine. Production, energy and cost
   * figures are all added up from these rows, so it is the back office's call
   * (see run.routes) and what the row was carrying comes back to the caller so
   * the screen can say what was removed.
   *
   * The row is not the whole of the run. What it packed is standing in the yard
   * and what the bench tested is on the lab's table, and both are cleared with
   * it - see clearTraces(), which is also what refuses the delete outright when
   * the output has already been sold.
   */
  async discard(id) {
    const run = await base.findById(id);
    const cleared = await clearTraces(run);
    await base.remove(id);
    return {
      id,
      machine_id: run.machine_id,
      machine: run.machine ?? null,
      shift_date: run.shift_date ?? null,
      shift: run.shift ?? null,
      batch_no: run.batch_no ?? null,
      weight_kg: run.weight_kg ?? null,
      ...cleared,
    };
  },

  /**
   * Undoes the packing on a run, and leaves the run standing.
   *
   * The Packing tab's delete, and it is deliberately not discard(). What the
   * crew wants undone there is the bagging, not the shift: the run happened,
   * the machine logged its hours and its power, and the reports and the costing
   * are added up off that row. Deleting it to take twelve sacks back out of the
   * yard would rewrite the plant's production record to fix a counting mistake.
   * So this puts the run back to weighed-but-not-packed and nothing else, which
   * is exactly the state it was in before somebody stood at the bench - it
   * reappears on the packing list, ready to be entered again.
   *
   * Why not simply pack it as zero, which the same absolute figure would allow:
   * packSacks() and packPieces() hand the *delta* to recordPacking(), and that
   * has no idea what has left the yard. Packing twelve back down to zero on a
   * group eight sacks of which are on a lorry drives it to minus eight without
   * a word. reversePacking() is the path that knows - it refuses to take back
   * more than is standing, and drops a group that empties completely and was
   * never dispatched from - so the reversal goes through unfileStock(), which
   * is the same helper a run delete uses and keys the group the same way the
   * bench keyed it.
   *
   * The order is clearTraces()'s, and for its reason: the ledger is corrected
   * before the row that claims it is, never after. If the reversal refuses, the
   * run still says what it packed and the two still agree.
   */
  async unpack(id) {
    const run = await base.findById(id);
    const boxed = run.kind === 'press' || isMoulding(run.kind);
    const packed = boxed ? Number(run.packed_pieces || 0) : Number(run.packed_sacks || 0);

    if (packed <= 0) {
      throw ApiError.badRequest('Nothing has been packed on this run yet');
    }

    /*
     * Refused outright once any of it has been sold, before the yard is touched.
     * reversePacking() would refuse a moment later on the same facts, but it can
     * only see the group's own arithmetic - it would say "the rest has already
     * been dispatched" about a group several runs fed. This names the run the
     * caller actually asked about, which is the one they can do something with.
     */
    let sold = 0;
    try {
      sold = Number((await dispatchService.sacksByRun([id]))[id] ?? 0);
    } catch (err) {
      // A project with no `run_id` on dispatches cannot answer this. Not a
      // blocker: the reversal below still refuses to push a group below what
      // has gone out of it - see clearTraces(), which is guarded the same way.
      logger.warn(`Unpacking run ${id}: the dispatches were not checked - ${err.message}`);
    }
    if (sold > 0) {
      throw ApiError.conflict(
        `${sold} of this run's packed output has already been dispatched - reverse that dispatch before undoing the packing`,
      );
    }

    const stock = await unfileStock(run);

    /*
     * Only now the run. `leftout_out` goes with the sacks on the bagging side:
     * it is the sub-sack remainder this packing decided on, and a run that has
     * not been packed has not decided one. `leftout_in` stays - that was carried
     * in from the batch before and is not this bench's to give back.
     */
    const saved = await base.update(
      id,
      boxed ? { packed_pieces: 0 } : { packed_sacks: 0, leftout_out: 0 },
    );

    return {
      run: decorate(saved),
      /** What came back out of the yard, in the shape a run delete reports it. */
      stock_cleared: stock
        ? {
            id: stock.id,
            label: stock.display_label ?? stock.label,
            taken: packed,
            left: stock.removed ? 0 : stock.available_sacks,
            removed: Boolean(stock.removed),
          }
        : null,
      /*
       * Packed output no group could be found for. Not an error and not silence
       * either - the run has been put back to unpacked either way, so if this is
       * not said the yard is holding sacks nothing on any screen accounts for.
       */
      stock_note:
        stock === null
          ? `${packed} packed ${boxed ? 'pieces' : 'sacks'} could not be traced to a stock group - check the yard for ${run.batch_no ?? 'this period'}`
          : null,
    };
  },

  /**
   * Records the out-weight of an already finished run (the Weigh tab), and
   * corrects one that is already weighed - the shop floor puts its own scale
   * right, so this is the same call rather than the back office's edit().
   *
   * `entries` are the individual weighings the total came off, kept so a later
   * correction can show what went on the scale. They are stored as sent even
   * where they do not add up to `outWeight`: the two answer different questions,
   * and quietly rewriting either would lose what the crew recorded.
   */
  async weigh(id, outWeight, entries) {
    // Read for its own sake: findById raises a 404 for a run that is not there,
    // which is what keeps a weight off a row that does not exist.
    await base.findById(id);
    if (outWeight == null || Number.isNaN(Number(outWeight))) {
      throw ApiError.badRequest('A weight in kg is required');
    }
    const patch = { weight_kg: Number(outWeight) };
    if (entries !== undefined) {
      patch.weigh_entries = Array.isArray(entries) && entries.length ? entries.map(Number) : null;
    }
    return decorate(await base.update(id, patch));
  },

  /**
   * Takes the weighing back off a run and puts it back on the scale.
   *
   * The Weigh tab's delete, and it stands to weigh() the way unpack() stands to
   * pack(): the run itself is left alone. The shift happened, the machine logged
   * its hours and its power, and the reports are added up off that row - so a
   * figure put against the wrong run is corrected by clearing the figure, not by
   * deleting the shift. That is what History's delete is for, and it is a
   * different act.
   *
   * A correction is not this. The floor puts its own scale right all day through
   * weigh(), which is an absolute figure and needs nobody's permission. This is
   * for the case a correction cannot reach - a weight recorded against a run
   * that was never on the scale at all - so the row goes back to owing one and
   * reappears on the queue, which is exactly where listPendingWeigh() finds it
   * again: it filters on `weight_kg is null`.
   *
   * Refused once anything has been packed off that weight, and it names the
   * Packing tab rather than merely saying no. The sacks in the yard were bagged
   * against this figure and reversing the packing is what puts them back;
   * clearing the weight underneath them would leave a run claiming output it no
   * longer says it made, with the yard still holding it.
   */
  async unweigh(id) {
    const run = await base.findById(id);
    const onRecord = run.weight_kg == null ? null : Number(run.weight_kg);
    const entries = entriesOf(run);

    if (onRecord == null && !entries.length) {
      throw ApiError.badRequest('Nothing has been weighed on this run yet');
    }

    const boxed = run.kind === 'press' || isMoulding(run.kind);
    const packed = boxed ? Number(run.packed_pieces || 0) : Number(run.packed_sacks || 0);
    if (packed > 0) {
      throw ApiError.conflict(
        `${packed} ${boxed ? 'pieces' : 'sacks'} were packed off this weight - undo the packing on the Packing tab before clearing it`,
      );
    }

    const saved = await base.update(id, { weight_kg: null, weigh_entries: null });
    return {
      run: decorate(saved),
      /** What was cleared, so the screen can name the figure it removed. */
      weight_kg: onRecord,
      entries_cleared: entries.length,
    };
  },

  /**
   * Records what came off a run and into the yard (the Packing tab).
   *
   * Two benches, one door. A weighed run is bagged into 50 kg sacks and a press
   * run is boxed by the piece, and the run says which - a press cannot be packed
   * in sacks and a refiner cannot be packed in pieces, so the field that happens
   * to have arrived is not what decides. Sending the wrong one is refused rather
   * than ignored: a count entered on the wrong bench is a count somebody
   * believes was recorded.
   */
  async pack(id, body = {}) {
    const run = await base.findById(id);
    if (run.kind === 'press' || isMoulding(run.kind)) {
      if (body.sacks != null) {
        throw ApiError.badRequest(
          `A ${run.kind === 'press' ? 'press' : run.kind} run is boxed by the piece, not bagged in sacks`,
        );
      }
      return runService.packPieces(run, body);
    }
    if (body.pieces != null) {
      throw ApiError.badRequest('Only a press, sleeve or loop run is boxed by the piece');
    }
    return runService.packSacks(run, body);
  },

  /**
   * The bagging line: full sacks off a weighed run.
   *
   * `leftout_out` is the sub-sack remainder that goes into the next batch of
   * the same grade. It is rejected rather than clamped when it comes out
   * negative: that means more sacks were claimed than there was material for,
   * and silently absorbing it would lose weight from the ledger.
   */
  async packSacks(run, { sacks, leftoutIn, leftoutOut } = {}) {
    const id = run.id;
    if (sacks == null || Number.isNaN(Number(sacks))) {
      throw ApiError.badRequest('The number of sacks packed is required');
    }
    const carriedIn = leftoutIn != null ? Number(leftoutIn) : Number(run.leftout_in || 0);
    const total = Number(run.weight_kg || 0) + carriedIn;
    const left =
      leftoutOut != null ? Number(leftoutOut) : Math.round((total - Number(sacks) * SACK_KG) * 100) / 100;
    if (left < 0) {
      throw ApiError.badRequest('That is more than the ' + total + ' kg available on this run');
    }

    const before = Number(run.packed_sacks || 0);
    const saved = await base.update(id, {
      packed_sacks: Number(sacks),
      leftout_in: carriedIn,
      leftout_out: left,
    });

    /*
     * Bagged sacks are stock from here on, so the yard's ledger is filed in the
     * same call that records the packing rather than being reconciled later.
     *
     * The *change* goes across, not the total: this endpoint is also where a
     * wrong figure gets corrected, and sending the count again would file the
     * same sacks twice. Coarse output carries no batch number - the line runs
     * for a shift, not for a batch - so its sacks pool by the ten-day period
     * they were packed in, and that label is worked out from the server's own
     * date. It is never taken from the request: a client that could name its
     * own pool could file today's sacks into last month's.
     *
     * A failure here must not lose the packing. The run is already saved, and
     * the group is a derived ledger that packing again will put right, so it is
     * logged rather than raised at a crew standing at the bagging line.
     */
    const delta = Number(sacks) - before;
    if (delta) {
      try {
        await stockService.recordPacking({
          quality: run.quality ?? (run.line === 'coarse' ? COARSE_GRADE : null),
          batchNo: run.batch_no,
          delta,
          packedOn: todayISO(),
        });
      } catch (err) {
        logger.warn(`Packing run ${id}: the stock group was not updated - ${err.message}`);
      }
    }

    return decorate(saved);
  },

  /**
   * The boxing bench: pieces off a press run, filed as moulded stock.
   *
   * A press moulds finished goods out of reclaim compound and counts them one at
   * a time. There is nothing to weigh at the end and nothing to carry into the
   * next run - a piece is a piece - so this is the whole of it: how many were
   * boxed, and into which product's stock they go.
   *
   * The pack is read off the product rather than sent, for the same reason a
   * coarse pool's label is worked out from the server's own date: a client that
   * could name its own pack size could file a hundred loose pieces as two packs
   * of fifty. A product with no pack size set boxes as loose pieces and says so
   * on the yard's screen, which is a settings field somebody can go and fill in
   * - it is not a reason to strand a shift's moulding.
   *
   * More boxed than were moulded is refused. The count came off the press and
   * boxing more than that is a mis-key, not a discovery; absorbing it would put
   * stock in the yard that the plant never made.
   */
  async packPieces(run, { pieces } = {}) {
    const id = run.id;
    if (pieces == null || Number.isNaN(Number(pieces))) {
      throw ApiError.badRequest('The number of pieces boxed is required');
    }
    const boxed = Math.trunc(Number(pieces));
    const moulded = Number(run.pieces || 0);
    if (boxed > moulded) {
      throw ApiError.badRequest(`This run moulded ${moulded} pieces`);
    }

    const before = Number(run.packed_pieces || 0);
    const saved = await base.update(id, { packed_pieces: boxed });

    /*
     * Boxed pieces are stock from here on, filed in the same call that records
     * the boxing - the same rule as bagging, and for the same reason: a yard
     * ledger reconciled later is a yard ledger that is wrong in between.
     *
     * The *change* goes across, not the total, so correcting a count next
     * morning moves the group by the difference instead of filing the same
     * pieces twice.
     *
     * A failure here must not lose the boxing. The run is already saved and the
     * group is a derived ledger that boxing again will put right, so it is
     * logged rather than raised at somebody standing at the bench.
     */
    /*
     * Whether the boxing actually reached the yard.
     *
     * The filing below is deliberately not allowed to fail the request - the
     * run is already saved and the group is a derived ledger that boxing again
     * puts right - but "not raised at the crew" was being read as "not told to
     * the crew at all", and the two are not the same thing. A project without
     * migration 0005 has no way to hold moulded stock: the boxed count is
     * dropped on the way in and the group cannot be created, and the bench got
     * a toast saying the pieces were filed and awaiting the lab. This carries
     * the truth back so the screen can say which of the two happened.
     */
    let stockNote = null;
    if (saved.packed_pieces == null && boxed > 0) {
      stockNote =
        'This project cannot record boxed pieces yet - run supabase/schema.sql, then box again.';
    }

    const delta = boxed - before;
    if (delta) {
      try {
        const product = await runService.productOf(run);
        /*
         * Keyed on the product's id, which is what `stock_groups.product_id`
         * references and what a verdict on moulded goods is addressed by. The
         * column is the fallback rather than the source: a run written while it
         * held the product's name would otherwise file stock against a value the
         * products table has never heard of, and the foreign key would refuse
         * the whole group.
         */
        const productId = product?.id ?? run.product ?? null;
        await stockService.recordPacking({
          /*
           * Which yard the pieces go into, and it is the run that decides.
           *
           * A press pools by the product and the pack it is boxed in, so every
           * pack of loops it has ever moulded is one row and one verdict. Sleeve
           * and loop are made a shift at a time under a batch number of their
           * own and answered for a shift at a time, so each is its own lot -
           * keyed on the product and that number together, and a second shift's
           * boxing opens a second row rather than joining this one.
           *
           * Both halves, which is what keeps the two benches apart. The number is
           * the date and the shift, so a sleeve shift and a loop shift worked
           * side by side carry the same one; keyed on it alone they would box
           * into each other's row.
           *
           * Boxing the same lot again is what appends to it, and that is the
           * `delta` above doing its work: the group is keyed on the pair, so two
           * starts inside one shift - which are one run by the time they get
           * here - and a correction next morning all land in the same row.
           */
          kind: isMoulding(run.kind) ? 'lot' : 'product',
          productId,
          packSize: product?.pack_size ?? null,
          kgPerUnit: product?.piece_kg ?? null,
          // On a press: null on anything moulded since it stopped naming a batch,
          // so the group opens `pending` for the bench to answer. On a lot it is
          // the generated number, and it is the key rather than provenance.
          batchNo: run.batch_no,
          quality: productId,
          delta,
          packedOn: run.shift_date ?? todayISO(),
        });
      } catch (err) {
        logger.warn(`Boxing run ${id}: the stock group was not updated - ${err.message}`);
        stockNote ??= `The pieces are on the run but did not reach the yard - ${err.message}`;
      }
    }

    // The run either way; `stock_filed` is what the bench is told.
    return { ...decorate(saved), stock_filed: !stockNote, stock_note: stockNote };
  },

  /**
   * The product a press run was set up for, or null.
   *
   * Read at boxing time rather than snapshotted at the run, unlike the curing
   * settings and the compound rate. Those are what the run was moulded at and
   * must not move afterwards; the pack is how the goods are boxed *now*, which
   * is a decision made at the bench and one the back office may legitimately
   * change between the press stopping and the boxes being filled.
   *
   * A product that has since been deleted, or a project with no products table,
   * answers null - and the pieces are then filed as loose. Stock in the yard is
   * not contingent on a settings row still being there.
   *
   * Looked up by id, then by name. The name is only for the runs written while
   * pressFields() stored one - they are on the table, they have pieces on them
   * nobody has boxed yet, and read as an id they would find nothing and box
   * loose under a label the products table does not know. New runs never take
   * the second branch.
   */
  async productOf(run) {
    const key = String(run?.product ?? '').trim();
    if (!key) return null;
    try {
      return await productService.findById(key);
    } catch {
      // Not an id. A row written before the column held one names the product.
      try {
        return (await productService.findOne({ name: key })) ?? null;
      } catch {
        return null;
      }
    }
  },

  pause: (id, paused = true) =>
    base
      .update(id, { paused, paused_at: paused ? new Date().toISOString() : null })
      .then(decorate),

  async upsertMany(rows) {
    return (await base.upsertMany(rows)).map(decorate);
  },
};

export default runService;
