import { randomUUID } from 'node:crypto';
import { crud } from './base.service.js';
import { machineService } from './machine.service.js';
import { decorate as decorateRun } from './run.service.js';
import {
  TABLES,
  VIEWS,
  BATCH_QUALITIES,
  PRE_REFINER_IDS,
  REFINE_STAGE_IDS,
  FINAL_REFINER_IDS,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination } from '../utils/pagination.js';

/**
 * The batch lifecycle.
 *
 * A batch is what one autoclave charge becomes. It is never created on its own:
 * loading an autoclave opens it, unloading marks it out of the vessel, the
 * refiners work the grades out of it, and it closes once every grade it yielded
 * has been weighed. Nothing else may open one - see create() below.
 *
 * Batches never became their own Supabase table: the tablets keep the whole
 * plant state in one `shared_state` row (id: "plant") and push batches inside
 * its `doc` JSON. So this service reads out of that blob, folds in the costing
 * figures from the `special_batch_detail` view, and reads the stage each grade
 * has reached off the runs logged against the batch number - which is why the
 * grid on the batch card needs nothing recorded for it.
 */

const PLANT = 'plant';

/**
 * How many batch numbers one run lookup may name. PostgREST takes them as an
 * `in.(...)` list in the query string, and the whole plant's batch history is
 * well past what one URL should carry.
 */
const RUN_LOOKUP_CHUNK = 80;

const state = crud(TABLES.sharedState, { defaultSort: 'updated_at' });
const detail = crud(VIEWS.specialBatchDetail, { defaultSort: 'shift_date' });
const runs = crud(TABLES.runs, { defaultSort: 'started_at' });
const tests = crud(TABLES.qualityTests, { defaultSort: 'ts' });
const conversions = crud(TABLES.conversions, { defaultSort: 'ts' });

const iso = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  return String(value);
};

const round2 = (value) => Math.round(value * 100) / 100;

/** The batch number a stored batch goes by, trimmed. */
const refOf = (raw) => String(raw?.no ?? raw?.batchNo ?? raw?.id ?? '').trim();

/**
 * Batch numbers are compared case-insensitively. The crews key them on a
 * tablet - "b-104" and "B-104" are the same charge to everyone on the floor, so
 * letting both exist would split one batch's runs across two records.
 */
const sameRef = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** A pass that yields nothing to weigh never counts towards a grade's stages. */
const producing = (run) => run.non_production !== true;

/** The autoclave passes against a batch - its load, and its twin's if shared. */
const autoclaveRunsOf = (batchRuns) =>
  batchRuns.filter((r) => r.kind === 'autoclave' || r.autoclave_id);

/**
 * Which line the charge was on, and so whether it is a batch at all.
 *
 * Only a special charge becomes a batch the refiners work grades out of. A coarse
 * charge feeds the coarse line for the shift, and a DRC charge is counted by its
 * runs; neither is marked, staged or weighed in grades, so loading either opens
 * no batch - which means every coarse or DRC batch on record came across from the
 * tablets, before that was the rule. None of them has grades to mark and no
 * refiner will pick one up, so the batch list and the pickers show special
 * batches alone; list() still has them all for dispatch and history.
 *
 * Read off the load run's own line where there is one, and off the formulation
 * name otherwise - for the older records that is all there is to go on.
 */
const lineOf = (raw, batchRuns) => {
  if (autoclaveRunsOf(batchRuns).some((r) => r.line === 'coarse')) return 'coarse';
  const formulation = String(raw.formulation ?? '');
  if (/^\s*coarse/i.test(formulation)) return 'coarse';
  if (/^\s*drc/i.test(formulation)) return 'drc';
  return 'special';
};

/**
 * One row of the batch card's grade x stage grid.
 *
 * `marked` is what the supervisor ticked - or what logging the final refiner
 * ticked for them. The three stages are read off the runs: refined on R3 (or R1
 * standing in for it), finished on R4, and weighed once a figure is against it.
 *
 * One row per BATCH_QUALITIES, which is where DRC drops out of the lifecycle: a
 * DRC mark left on an older batch is simply not a grade this grid has a row for,
 * so it counts towards neither the chip nor the close rule.
 */
function gradesFor(raw, batchRuns) {
  const marked = new Set((raw.qualities ?? []).map(String));
  return BATCH_QUALITIES.map((quality) => {
    const mine = batchRuns.filter((r) => r.quality === quality && producing(r));
    const on = (ids) => mine.some((r) => ids.includes(r.machine_id));
    const kg = mine.reduce((sum, r) => sum + Number(r.weight_kg ?? 0), 0);
    return {
      quality,
      marked: marked.has(quality),
      refined: on(REFINE_STAGE_IDS),
      finished: on(FINAL_REFINER_IDS),
      // Only R4 and R2 weigh, so summing every graded run cannot double-count a
      // grade that went through R3 on its way there.
      weighed: kg > 0,
      kg: kg > 0 ? round2(kg) : null,
    };
  });
}

/**
 * Everything about a batch that is worked out rather than stored: the grid, the
 * chip on its card, what it has yielded, and whether it is junk.
 */
function lifecycleOf(raw, batchRuns) {
  const grades = gradesFor(raw, batchRuns);
  const marked = grades.filter((g) => g.marked);
  const weighed = marked.filter((g) => g.weighed);
  const autoclaveDone = Boolean(raw.autoclaveDone);
  const charged = autoclaveRunsOf(batchRuns).length > 0;

  const weighedKg = round2(grades.reduce((sum, g) => sum + (g.kg ?? 0), 0));
  const charge = raw.capacity != null ? Number(raw.capacity) : null;

  return {
    qualities: marked.map((g) => g.quality),
    grades,
    /** Which pre-refiners broke this charge down, in the order they ran. */
    pre_refiners: [
      ...new Set(batchRuns.filter((r) => PRE_REFINER_IDS.includes(r.machine_id)).map((r) => r.machine_id)),
    ],
    runs_count: batchRuns.length,
    marked_count: marked.length,
    weighed_count: weighed.length,
    /** Loaded -> In autoclave -> mark qualities -> n/m weighed. */
    state_label: !charged && !autoclaveDone
      ? 'Loaded'
      : !autoclaveDone
        ? 'In autoclave'
        : !marked.length
          ? 'mark qualities'
          : `${weighed.length}/${marked.length} weighed`,
    /**
     * Junk: a batch nothing was ever logged against - the load cancelled as
     * entered by mistake after the batch had already been opened, or a run
     * history since edited out from under it.
     *
     * "Not currently in an autoclave" needs no separate test: a charge sitting in
     * a vessel has its load run against it, so a batch with no runs at all cannot
     * be in one. Going by `autoclaveDone` instead would miss the common case,
     * because a load cancelled before it was ever discharged leaves that flag
     * false for good.
     */
    orphaned: batchRuns.length === 0,
    weighed_kg: weighedKg || null,
    /** Output over what went in - the plant's yield on this charge. */
    yield_pct: charge && weighedKg ? round2((weighedKg / charge) * 100) : null,
  };
}

/** shared_state shape -> the Batch model the client is written against. */
const toBatch = (raw, costing, batchRuns = []) => {
  // Sorted oldest first by the caller, so the first autoclave pass is the load.
  const load = autoclaveRunsOf(batchRuns)[0] ?? null;
  return {
    id: raw.id,
    ref: refOf(raw),
    machine_id: raw.autoclaveId ?? null,
    formulation: raw.formulation ?? null,
    line: lineOf(raw, batchRuns),
    /** What the vessel was charged with, in kg. */
    capacity: raw.capacity ?? null,
    grade: raw.qualities?.[0] ?? null,
    /** The load was shared with the twin vessel rather than charged alone. */
    paired: Boolean(raw.paired),
    workers: load?.workers ?? null,
    autoclave_done: Boolean(raw.autoclaveDone),
    status: raw.closed ? 'closed' : 'open',
    shift: raw.shift ?? load?.shift ?? null,
    shift_date: raw.shiftDate ?? null,
    // Batches charged before the tablets started stamping `startedAt` carry only
    // the shift they belong to, so that date stands in for the open time.
    opened_at: iso(raw.startedAt) ?? costing?.started_at ?? (raw.shiftDate ? raw.shiftDate + 'T00:00:00.000Z' : null),
    closed_at: iso(raw.closedAt) ?? costing?.ended_at ?? null,
    opened_by: raw.supervisor ?? load?.supervisor ?? null,
    closed_by: raw.closedBy ?? null,
    remarks: raw.remarks ?? null,
    /**
     * When the charge went into the vessel, and when it came back out.
     *
     * The run has the last word on both. The crew dates a discharge by hand - a
     * charge pulled at 02:00 is often logged after the fact - so the copy kept on
     * the batch is only the fallback for a batch whose load run is no longer on
     * the record.
     */
    loaded_at: load?.loaded_at ?? load?.started_at ?? iso(raw.startedAt),
    unloaded_at: load?.unloaded_at ?? load?.ended_at ?? iso(raw.unloadedAt) ?? null,
    // From special_batch_detail, when that batch has been costed.
    stage: costing?.stage ?? null,
    output_kg: costing?.output_kg ?? null,
    packed_sacks: costing?.packed_sacks ?? null,
    total_cost: costing?.total_cost ?? null,
    cost_per_kg: costing?.cost_per_kg ?? null,
    efficiency_pct: costing?.efficiency_pct ?? null,
    ...lifecycleOf(raw, batchRuns),
  };
};

/** The plant blob and the version it was read at, for the write guard below. */
async function plantState() {
  const row = await state.findOne({ id: PLANT });
  return { doc: row?.doc ?? null, version: row?.version ?? 0 };
}

const plantDoc = async () => (await plantState()).doc;

async function costingByBatchNo() {
  const rows = await detail.all();
  return new Map(rows.map((r) => [String(r.batch_no), r]));
}

/**
 * The runs logged against each of these batch numbers, oldest first.
 *
 * Chunked so a long list of batch numbers cannot outgrow the query string, and
 * keyed case-insensitively because the number on a run is whatever the tablet
 * keyed - the same charge, in a different case.
 */
async function runsByBatchNo(refs) {
  const wanted = [...new Set(refs.map((ref) => String(ref).trim()).filter(Boolean))];
  const byRef = new Map(wanted.map((ref) => [ref.toLowerCase(), []]));
  if (!wanted.length) return byRef;

  for (let from = 0; from < wanted.length; from += RUN_LOOKUP_CHUNK) {
    const rows = await runs.all(
      { batch_no: wanted.slice(from, from + RUN_LOOKUP_CHUNK) },
      { sort: 'started_at', ascending: true },
    );
    for (const row of rows) {
      byRef.get(String(row.batch_no ?? '').trim().toLowerCase())?.push(row);
    }
  }
  return byRef;
}

async function loadBatches() {
  const doc = await plantDoc();
  const stored = doc?.batches ?? [];
  const [costing, byRef] = await Promise.all([
    costingByBatchNo(),
    runsByBatchNo(stored.map(refOf)),
  ]);
  return stored
    .map((raw) => toBatch(raw, costing.get(refOf(raw)), byRef.get(refOf(raw).toLowerCase()) ?? []))
    .sort((a, b) => String(b.opened_at ?? '').localeCompare(String(a.opened_at ?? '')));
}

/**
 * Rewrites the batch array inside the plant blob.
 *
 * Postgres stores `doc` as one JSON value, so there is no way to patch a
 * single key of it over PostgREST - the whole document goes back. A tablet
 * syncing at the same moment would otherwise silently lose its write, so the
 * update is guarded on the `version` the document was read at and retried
 * against a fresh copy when that guard misses. `mutate` runs inside that guard,
 * so a uniqueness check made there holds for the write that follows it.
 *
 * Handing back the array it was given means "nothing to do" - the document is
 * left alone rather than rewritten at a new version for no change.
 */
async function mutateBatches(mutate, attempt = 1) {
  const { doc, version } = await plantState();
  if (!doc) throw ApiError.unavailable('Plant state has not been synced yet');

  const current = doc.batches ?? [];
  const batches = mutate(current);
  if (batches === current) return current;

  const { rows } = await state.updateWhere(
    { id: PLANT, version },
    {
      doc: { ...doc, batches },
      version: version + 1,
      updated_at: new Date().toISOString(),
    },
  );

  if (!rows.length) {
    if (attempt >= 3) throw ApiError.conflict('Plant state is being written to; try again');
    return mutateBatches(mutate, attempt + 1);
  }
  return batches;
}

/**
 * Rewrites one batch, found by id. `patch` may be a function of the stored row,
 * for the changes that depend on what is already there; returning null leaves
 * the document untouched.
 */
async function patchBatch(id, patch) {
  await mutateBatches((batches) => {
    const index = batches.findIndex((b) => b.id === id);
    if (index < 0) throw ApiError.notFound('batch ' + id + ' not found');
    const fields = typeof patch === 'function' ? patch(batches[index]) : patch;
    if (!fields) return batches;
    const next = [...batches];
    next[index] = { ...next[index], ...fields };
    return next;
  });
  return batchService.findById(id);
}

const page = (rows, query) => {
  const { from, limit, page: pageNo } = parsePagination(query);
  return { rows: rows.slice(from, from + limit), total: rows.length, page: pageNo, limit };
};

export const batchService = {
  table: TABLES.batches,

  /**
   * Every batch on record whatever line it was charged on - dispatch and history
   * read this. Narrow it with `line` to ask for one of them on its own.
   */
  async list(query = {}, filters = {}) {
    let rows = await loadBatches();
    if (filters.status) rows = rows.filter((b) => b.status === filters.status);
    if (filters.machine_id) rows = rows.filter((b) => b.machine_id === filters.machine_id);
    if (filters.line) rows = rows.filter((b) => b.line === filters.line);
    return page(rows, query);
  },

  /**
   * Open special-line batches, oldest first - the order they need attention in.
   *
   * This is the batch list and every refiner picker on the floor, so a closed
   * batch is gone from all of them at once - and so is anything not on the special
   * line, because no refiner works a grade out of a coarse or DRC charge. All of
   * them stay on list() above, which is what dispatch and the history tabs read.
   */
  async listOpen(query = {}) {
    const rows = (await loadBatches())
      .filter((b) => b.status === 'open' && b.line === 'special')
      .sort((a, b) => String(a.opened_at ?? '').localeCompare(String(b.opened_at ?? '')));
    return page(rows, query);
  },

  async findById(id) {
    const found = (await loadBatches()).find((b) => b.id === id || sameRef(b.ref, id));
    if (!found) throw ApiError.notFound('batch ' + id + ' not found');
    return found;
  },

  /**
   * The whole record of one batch: the charge and the crew that put it in, the
   * grades taken off it with the kg against each, the conversions between them,
   * the yield that comes out of the two, and every run logged against it.
   */
  async detail(id) {
    const batch = await batchService.findById(id);
    const [batchRuns, conversionRows, testRows] = await Promise.all([
      runs.all({ batch_no: batch.ref }, { sort: 'started_at', ascending: true }),
      conversions.all({ batch_no: batch.ref }, { sort: 'ts', ascending: true }).catch(() => []),
      tests.all({ batch_no: batch.ref }, { sort: 'ts', ascending: true }).catch(() => []),
    ]);
    return {
      ...batch,
      runs: batchRuns.map(decorateRun),
      conversions: conversionRows,
      qualityTests: testRows.map((row) => ({
        ...row,
        grade: row.quality ?? null,
        tested_at: row.ts ?? row.created_at ?? null,
        tested_by: row.tester ?? null,
        remarks: row.notes ?? null,
      })),
    };
  },

  /**
   * Opens a batch. Only ever reached by loading an autoclave: the vessel is
   * checked to be one, because a batch with no charge behind it has no
   * formulation, no capacity and no yield to measure - nothing the rest of the
   * lifecycle can work with.
   *
   * The grades start empty whatever the caller sent. Which grades a charge
   * yields is not known at the autoclave - it is settled at the refiners, by the
   * supervisor marking them or by a run being logged on the final refiner.
   */
  async create(payload) {
    const ref = String(payload.ref ?? payload.no ?? '').trim();
    if (!ref) throw ApiError.badRequest('A batch number is required');

    const machineId = payload.machineId ?? payload.machine_id ?? null;
    if (!machineId) throw ApiError.badRequest('A batch is opened by loading an autoclave - name the vessel');
    const machine = await machineService.findById(machineId).catch(() => null);
    if (!machine) throw ApiError.badRequest('Unknown machine ' + machineId);
    if (machine.kind !== 'autoclave') {
      throw ApiError.badRequest(
        `A batch is opened by loading an autoclave - ${machine.name ?? machineId} is a ${machine.kind} machine`,
      );
    }

    // Only a special charge is worked through in grades. Opening a batch for a
    // coarse or DRC one would put a record on the list that has no grades to mark
    // and that nothing could ever move off it - see lineOf() above.
    const line = lineOf({ formulation: payload.formulation }, []);
    if (line !== 'special') {
      throw ApiError.badRequest(
        `A ${line === 'coarse' ? 'coarse' : 'DRC'} charge is counted by its runs, not as a batch - ${payload.formulation} opens no batch`,
      );
    }

    const row = {
      id: payload.id ?? randomUUID(),
      no: ref,
      closed: false,
      /** The load was shared between both vessels rather than charged alone. */
      paired: Boolean(payload.paired),
      capacity: payload.capacity ?? machine.capacity ?? null,
      qualities: [],
      shift: payload.shift ?? null,
      shiftDate: payload.shiftDate ?? payload.shift_date ?? null,
      startedAt: Date.now(),
      autoclaveId: machineId,
      formulation: payload.formulation ?? null,
      autoclaveDone: false,
      supervisor: payload.openedBy ?? payload.opened_by ?? null,
    };

    // Under the version guard, so the number cannot be taken between the check
    // and the write.
    await mutateBatches((batches) => {
      const clash = batches.find((b) => sameRef(refOf(b), ref));
      if (clash) throw ApiError.conflict('Batch ' + refOf(clash) + ' already exists');
      return [...batches, row];
    });
    return toBatch(row, undefined, []);
  },

  /**
   * Corrects a batch that is already open - the details the load sheet got
   * wrong. The client model's field names are not the ones the plant blob
   * stores, so the patch is translated rather than merged in raw, and anything
   * it does not name is left exactly as it was.
   *
   * Grades are not settable here (setQuality owns them) and neither is `status`
   * (close and reopen own that), because both carry rules of their own.
   */
  async update(id, patch = {}) {
    const fields = {};
    if (patch.machine_id !== undefined) fields.autoclaveId = patch.machine_id;
    if (patch.formulation !== undefined) fields.formulation = patch.formulation;
    if (patch.capacity !== undefined) fields.capacity = patch.capacity;
    if (patch.paired !== undefined) fields.paired = Boolean(patch.paired);
    if (patch.shift !== undefined) fields.shift = patch.shift;
    if (patch.shift_date !== undefined) fields.shiftDate = patch.shift_date;
    if (patch.opened_by !== undefined) fields.supervisor = patch.opened_by;
    if (patch.remarks !== undefined) fields.remarks = patch.remarks;

    const current = await batchService.findById(id);
    const ref = patch.ref === undefined ? null : String(patch.ref).trim();
    // Runs, quality tests and conversions all key on the batch *number*, so
    // renumbering a batch that has any of them against it would cut it loose
    // from its own record. The number is only correctable while it has none.
    if (ref && !sameRef(ref, current.ref)) {
      if (current.runs_count) {
        throw ApiError.conflict(
          `Batch ${current.ref} has ${current.runs_count} run${current.runs_count > 1 ? 's' : ''} logged against its number, so it cannot be renumbered`,
        );
      }
      fields.no = ref;
    }

    if (!Object.keys(fields).length) return current;

    await mutateBatches((batches) => {
      const index = batches.findIndex((b) => b.id === id);
      if (index < 0) throw ApiError.notFound('batch ' + id + ' not found');
      // A renumbered batch answers to the same rule a new one does, against
      // every batch but itself.
      if (fields.no) {
        const clash = batches.find((b) => b.id !== id && sameRef(refOf(b), fields.no));
        if (clash) throw ApiError.conflict('Batch ' + refOf(clash) + ' already exists');
      }
      const next = [...batches];
      next[index] = { ...next[index], ...fields };
      return next;
    });
    return batchService.findById(id);
  },

  /**
   * Discharging the autoclave. The batch is out of the vessel, which is what
   * makes it selectable by the refiners - see the pickers on the Machines tab.
   *
   * Called with the number off the run being stopped, so a coarse load or a
   * number keyed by hand that matches no batch is a no-op rather than an error.
   *
   * `unloadedAt` is the discharge time off that run, not the server's clock: the
   * crew dates a discharge by hand, and stamping "now" over it here would have
   * the batch and its own load run disagree about when it came out.
   */
  async markAutoclaveDone(batchNo, unloadedAt) {
    const ref = String(batchNo ?? '').trim();
    if (!ref) return null;
    let found = null;
    await mutateBatches((batches) => {
      const index = batches.findIndex((b) => sameRef(refOf(b), ref));
      if (index < 0) return batches;
      found = batches[index];
      if (found.autoclaveDone) return batches;
      const next = [...batches];
      found = next[index] = {
        ...next[index],
        autoclaveDone: true,
        unloadedAt: iso(unloadedAt) ?? new Date().toISOString(),
      };
      return next;
    });
    return found;
  },

  /**
   * Marks a grade on a batch from a run that has just been logged on the final
   * refiner - the pass that settles what the charge actually yielded, so the
   * supervisor does not have to tick a grade the plant has already made.
   *
   * Unguarded on purpose: the run is the evidence. Whether the batch is closed
   * or still reads as in the vessel, a logged R4 pass is the fact of the matter.
   *
   * A grade the batch grid does not track - DRC - is left alone rather than
   * refused. The run stands as the record of it either way, and the batch simply
   * has nothing to say about that grade.
   */
  async markQuality(batchNo, quality) {
    const ref = String(batchNo ?? '').trim();
    if (!ref || !BATCH_QUALITIES.includes(quality)) return null;
    let found = null;
    await mutateBatches((batches) => {
      const index = batches.findIndex((b) => sameRef(refOf(b), ref));
      if (index < 0) return batches;
      found = batches[index];
      const marked = found.qualities ?? [];
      if (marked.includes(quality)) return batches;
      const next = [...batches];
      found = next[index] = { ...next[index], qualities: [...marked, quality] };
      return next;
    });
    return found;
  },

  /**
   * The supervisor ticking a grade off the batch card, or taking one back off.
   *
   * Only once the charge is out of the vessel: which grades it will yield is not
   * a question anyone can answer while it is still cooking. A grade a refiner has
   * already run cannot be unticked either - the runs against it would be left
   * describing a grade the batch says it never made.
   */
  async setQuality(id, quality, marked) {
    if (!BATCH_QUALITIES.includes(quality)) {
      throw ApiError.badRequest(
        `${quality} is not a grade a batch is tracked in - the batch grid covers ${BATCH_QUALITIES.join(', ')}`,
      );
    }
    const batch = await batchService.findById(id);
    if (batch.status === 'closed') {
      throw ApiError.conflict('Batch ' + batch.ref + ' is closed - reopen it to change its grades');
    }
    if (!batch.autoclave_done) {
      throw ApiError.conflict(
        'Batch ' + batch.ref + ' is still in the autoclave - unload it before marking grades',
      );
    }
    if (!marked) {
      const row = batch.grades.find((g) => g.quality === quality);
      if (row?.refined || row?.finished || row?.weighed) {
        throw ApiError.conflict(
          `${quality} has already been run off batch ${batch.ref} - correct those runs in History first`,
        );
      }
    }
    return patchBatch(id, (raw) => {
      const current = raw.qualities ?? [];
      if (marked === current.includes(quality)) return null;
      return {
        qualities: marked ? [...current, quality] : current.filter((q) => q !== quality),
      };
    });
  },

  /**
   * Files the batch away: it drops off the batch list and every refiner picker,
   * and stays on the record for dispatch, history and costing.
   *
   * A batch closes only once it has said what it yielded and weighed all of it.
   * Closing on a grade with no weight against it would lose that material from
   * the plant's ledger for good, so the count still outstanding is named rather
   * than the close quietly going through.
   */
  async close(id, { closedBy, remarks } = {}) {
    const batch = await batchService.findById(id);
    if (batch.status === 'closed') throw ApiError.conflict('Batch is already closed');

    const marked = batch.grades.filter((g) => g.marked);
    if (!marked.length) {
      throw ApiError.unprocessable(
        `Batch ${batch.ref} has no grades marked yet - mark what it yielded before closing it`,
      );
    }
    const outstanding = marked.filter((g) => !g.weighed);
    if (outstanding.length) {
      throw ApiError.unprocessable(
        `Batch ${batch.ref} has ${outstanding.length} of ${marked.length} marked grade${
          marked.length > 1 ? 's' : ''
        } still to weigh: ${outstanding.map((g) => g.quality).join(', ')}`,
      );
    }

    return patchBatch(id, {
      closed: true,
      closedAt: new Date().toISOString(),
      closedBy: closedBy ?? null,
      remarks: remarks ?? batch.remarks,
    });
  },

  reopen: (id) => patchBatch(id, { closed: false, closedAt: null, closedBy: null }),

  /**
   * Deletes an orphaned batch, and the quality tests filed against its number
   * with it - the lab keys tests to the batch number, so those would otherwise
   * be left pointing at nothing.
   *
   * Refused unless the batch really is orphaned, checked against the runs as
   * they read right now rather than as they read when the screen flagged it. A
   * batch with production against it is part of the plant's record: the runs are
   * what the reports, the costing and the yield figures are added up from, and a
   * delete here would move all three.
   */
  async remove(id) {
    const batch = await batchService.findById(id);

    const linked = await runs.all({ batch_no: batch.ref });
    if (linked.length) {
      const cooking = linked.some((r) => (r.kind === 'autoclave' || r.autoclave_id) && !r.ended_at);
      throw ApiError.conflict(
        cooking
          ? `Batch ${batch.ref} is in an autoclave right now - unload it, or cancel that load on the Machines tab`
          : `Batch ${batch.ref} has ${linked.length} run${linked.length > 1 ? 's' : ''} logged against it, so it is not orphaned - delete those in History first`,
      );
    }

    const linkedTests = await tests.all({ batch_no: batch.ref }).catch(() => []);
    for (const test of linkedTests) await tests.remove(test.id);

    await mutateBatches((batches) => {
      const next = batches.filter((b) => b.id !== id);
      return next.length === batches.length ? batches : next;
    });
    return { id, ref: batch.ref, runs: linked.length, qualityTests: linkedTests.length };
  },
};

export default batchService;
