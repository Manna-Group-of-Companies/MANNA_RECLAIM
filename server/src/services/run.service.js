import { crud, op } from './base.service.js';
import { machineService } from './machine.service.js';
import { productService } from './product.service.js';
import { dispatchService } from './dispatch.service.js';
import { stockService } from './stock.service.js';
import { absentSchema } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { TABLES, SACK_KG, COARSE_GRADE } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { currentShift, todayISO } from '../utils/shift.js';

const base = crud(TABLES.runs, { defaultSort: 'started_at' });

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

export const decorate = (row) => {
  if (!row) return row;
  const open = !row.ended_at;
  return {
    ...row,
    sources: sourcesOf(row),
    // Only the presses are costed on the run itself; every other line is costed
    // by the batch or the shift, out of the views the back office reads.
    ...(row.kind === 'press' ? pressCost(row) : {}),
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
    leftout_in: row.leftout_in ?? null,
    leftout_out: row.leftout_out ?? null,
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
  // rather than making it, so they belong to none of the three above.
  if (kind === 'press') return 'press';
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
 */
async function pressFields(payload) {
  const id = String(payload.product ?? '').trim();
  if (!id) throw ApiError.badRequest('A press run has to say which product it is moulding');
  const product = await productService.findById(id).catch(() => {
    throw ApiError.badRequest(`No product on the list is called ${id}`);
  });
  return {
    product: product.name ?? product.id,
    cure_temp_c: product.cure_temp_c ?? null,
    compound_rate: product.compound_rate ?? null,
    cyclic_min: payload.cyclicMin ?? product.cyclic_min ?? null,
    cavities: payload.cavities ?? product.cavities ?? null,
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
    elec_start: record.elec_start ?? run.elec_start,
    hour_start: record.hour_start ?? run.hour_start,
    elec_end: leg.elec_end ?? record.elec_end,
    hour_end: leg.hour_end ?? record.hour_end,
    // Loads banked on either row are the same shift's output.
    weigh_entries: entries.length ? entries : null,
    needs_weigh: Boolean(record.needs_weigh || run.needs_weigh),
    // Filled in from this leg only where the shift had nothing on record.
    formulation: record.formulation ?? run.formulation,
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
    return { ...result, rows, total: rows.length };
  },

  /**
   * The packed sacks still in the yard - what the Dispatch tab loads a vehicle
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
    const startedAt = payload.startedAt || new Date().toISOString();
    // A press is set up for a product, and moulds against a batch number of its
    // own; the curing settings come off that product rather than off the sheet.
    const press = isPress ? await pressFields(payload) : null;
    if (isPress && !String(payload.batchNo ?? payload.batchId ?? '').trim()) {
      throw ApiError.badRequest('A press run has to say which batch it is moulding');
    }

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
      shift_date: payload.shiftDate || todayISO(),
      shift: payload.shift || currentShift(),
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
      ended_at: null,
      weight_kg: null,
      non_production: nonProduction,
      // A press weighs its own output at the machine and enters it at stop, so
      // it never reaches the Weigh tab however its machine row is flagged.
      needs_weigh: !nonProduction && !isPress && Boolean(machine.out_weight || machine.weigh),
    });
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
    const hoursRun = isPressRun
      ? run.hours_run ?? null
      : recordedHours ?? run.hours_run ?? (clockMin != null ? +(clockMin / 60).toFixed(2) : null);

    // This start/stop on its own, before anything is decided about where it
    // gets filed.
    const leg = {
      ended_at: ended,
      // See start(): an autoclave keeps its own discharge time alongside.
      unloaded_at: run.kind === 'autoclave' ? ended : run.unloaded_at,
      runtime_min: isPressRun
        ? run.runtime_min ?? null
        : recordedHours != null
          ? Math.round(recordedHours * 60)
          : run.runtime_min ?? clockMin,
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
    await base.remove(id);
    return { id, machine_id: run.machine_id, machine: run.machine ?? null };
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
   */
  async discard(id) {
    const run = await base.findById(id);
    await base.remove(id);
    return {
      id,
      machine_id: run.machine_id,
      machine: run.machine ?? null,
      shift_date: run.shift_date ?? null,
      shift: run.shift ?? null,
      batch_no: run.batch_no ?? null,
      weight_kg: run.weight_kg ?? null,
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
    const run = await base.findById(id);
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
   * Records the sacks packed off a run (the Packing tab).
   *
   * `leftout_out` is the sub-sack remainder that goes into the next batch of
   * the same grade. It is rejected rather than clamped when it comes out
   * negative: that means more sacks were claimed than there was material for,
   * and silently absorbing it would lose weight from the ledger.
   */
  async pack(id, { sacks, leftoutIn, leftoutOut } = {}) {
    const run = await base.findById(id);
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

  pause: (id, paused = true) =>
    base
      .update(id, { paused, paused_at: paused ? new Date().toISOString() : null })
      .then(decorate),

  async upsertMany(rows) {
    return (await base.upsertMany(rows)).map(decorate);
  },
};

export default runService;
