import { crud, model, wrapError } from './base.service.js';
import { TABLES, SACK_KG } from '../config/constants.js';
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
export const decorate = (row) => {
  if (!row) return row;
  const open = !row.ended_at;
  return {
    ...row,
    status: open ? 'running' : 'done',
    stopped_at: row.ended_at ?? null,
    out_weight: row.weight_kg ?? null,
    batch_id: row.batch_no ?? null,
    // Whether a run still owes a weight depends on its machine, which a single
    // row cannot answer - listPendingWeigh() sets this once it has that list.
    needs_weight: false,
    packed_sacks: row.packed_sacks ?? null,
    leftout_in: row.leftout_in ?? null,
    leftout_out: row.leftout_out ?? null,
  };
};

const decorateList = (result) => ({ ...result, rows: result.rows.map(decorate) });

/** Machine ids whose runs are weighed after the fact, read once per call. */
async function weighedMachineIds() {
  try {
    const rows = await model(TABLES.machines)
      .find({ $or: [{ out_weight: true }, { weigh: true }] }, '_id')
      .lean();
    return rows.map((m) => m._id);
  } catch (err) {
    throw wrapError(err);
  }
}

/**
 * The most recent shift that actually has runs. The shop-floor History tab
 * asks for "today", but a plant that has not started yet today would then show
 * an empty table for the whole first half of the shift.
 */
async function latestShiftWithRuns() {
  try {
    const [row] = await model(TABLES.runs)
      .find({ shift_date: { $ne: null } }, 'shift_date shift started_at')
      .sort({ shift_date: -1, started_at: -1 })
      .limit(1)
      .lean();
    return row ? { date: row.shift_date, shift: row.shift } : null;
  } catch (err) {
    throw wrapError(err);
  }
}

export const runService = {
  ...base,

  async list(query = {}, filters = {}) {
    return decorateList(await base.list(query, filters));
  },

  async findById(id) {
    return decorate(await base.findById(id));
  },

  /** Runs still in progress: started, not yet ended. */
  async listActive(query = {}) {
    return decorateList(await base.list(query, { ended_at: { $eq: null } }));
  },

  /**
   * Finished runs on a weighed machine that nobody has put a weight against.
   * This is what the Weigh tab lists - the prototype's `pendingWeigh()`.
   */
  async listPendingWeigh(query = {}) {
    const machineIds = await weighedMachineIds();
    if (!machineIds.length) return { rows: [], total: 0, page: 1, limit: 0 };
    const result = await base.list(
      { order: 'desc', sort: 'ended_at', ...query },
      { machine_id: machineIds, weight_kg: { $eq: null } },
    );
    return {
      ...result,
      rows: result.rows.map((row) => ({ ...decorate(row), needs_weight: true })),
    };
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
        weight_kg: { $gt: 0 },
        $or: [{ quality: { $nin: [null, ''] } }, { line: 'coarse' }],
      },
    );
    const rows = result.rows
      .map((row) => ({ ...decorate(row), needs_pack: true }))
      .filter((row) => {
        const total = Number(row.weight_kg || 0) + Number(row.leftout_in || 0);
        const packed = Number(row.packed_sacks || 0) * SACK_KG;
        return row.packed_sacks == null || total - packed >= SACK_KG;
      });
    return { ...result, rows, total: rows.length };
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
      const hasToday = await model(TABLES.runs)
        .exists({ shift_date: today })
        .catch((err) => { throw wrapError(err); });
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
    let inProgress;
    try {
      inProgress = await model(TABLES.runs)
        .exists({ machine_id: payload.machineId, ended_at: null });
    } catch (err) {
      throw wrapError(err);
    }
    if (inProgress) throw ApiError.conflict('That machine already has a run in progress');

    let machine = null;
    try {
      machine = await model(TABLES.machines).findById(payload.machineId).lean();
    } catch (err) {
      throw wrapError(err);
    }
    if (!machine) throw ApiError.notFound('Unknown machine ' + payload.machineId);

    const row = await base.create({
      machine_id: payload.machineId,
      machine: machine.name ?? null,
      kind: machine.kind ?? null,
      line: payload.line ?? null,
      batch_no: payload.batchNo ?? payload.batchId ?? null,
      quality: payload.quality || null,
      capacity: machine.capacity ?? null,
      shift_date: payload.shiftDate || todayISO(),
      shift: payload.shift || currentShift(),
      supervisor: payload.supervisor ?? null,
      workers: payload.workers ?? null,
      passes: 1,
      started_at: payload.startedAt || new Date().toISOString(),
      ended_at: null,
      weight_kg: null,
      needs_weigh: Boolean(machine.out_weight || machine.weigh),
    });
    return decorate(row);
  },

  async stop(id, payload = {}) {
    const run = await base.findById(id);
    if (run.ended_at) throw ApiError.conflict('Run is not in progress');
    const ended = payload.stoppedAt || new Date().toISOString();
    const started = run.started_at ? new Date(run.started_at).getTime() : null;
    const runtimeMin = started ? Math.round((new Date(ended).getTime() - started) / 60000) : null;

    const row = await base.update(id, {
      ended_at: ended,
      runtime_min: run.runtime_min ?? runtimeMin,
      hours_run: run.hours_run ?? (runtimeMin != null ? +(runtimeMin / 60).toFixed(2) : null),
      weight_kg: payload.outWeight ?? run.weight_kg,
      workers: payload.workers ?? run.workers,
      remarks: payload.remarks ?? run.remarks,
    });
    return decorate(row);
  },

  /** Records the out-weight of an already finished run (the Weigh tab). */
  async weigh(id, outWeight) {
    const run = await base.findById(id);
    if (outWeight == null || Number.isNaN(Number(outWeight))) {
      throw ApiError.badRequest('A weight in kg is required');
    }
    return decorate(await base.update(id, { weight_kg: Number(outWeight) }));
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
    return decorate(
      await base.update(id, {
        packed_sacks: Number(sacks),
        leftout_in: carriedIn,
        leftout_out: left,
      }),
    );
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
