import { randomUUID } from 'node:crypto';
import { crud } from './base.service.js';
import { TABLES, VIEWS } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination } from '../utils/pagination.js';

/**
 * Batches never became their own Supabase table - the tablets keep the whole
 * plant state in one `shared_state` row (id: "plant") and push batches inside
 * its `doc` JSON. So this service reads out of that blob and folds in the
 * costing figures from the `special_batch_detail` view, keyed by batch number.
 */

const PLANT = 'plant';

const state = crud(TABLES.sharedState, { defaultSort: 'updated_at' });
const detail = crud(VIEWS.specialBatchDetail, { defaultSort: 'shift_date' });

const iso = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  return String(value);
};

/** shared_state shape -> the Batch model the client is written against. */
const toBatch = (raw, costing) => ({
  id: raw.id,
  ref: raw.no ?? raw.batchNo ?? raw.id,
  machine_id: raw.autoclaveId ?? null,
  formulation: raw.formulation ?? null,
  capacity: raw.capacity ?? null,
  qualities: raw.qualities ?? [],
  grade: raw.qualities?.[0] ?? null,
  paired: Boolean(raw.paired),
  autoclave_done: Boolean(raw.autoclaveDone),
  status: raw.closed ? 'closed' : 'open',
  shift_date: raw.shiftDate ?? null,
  // Batches charged before the tablets started stamping `startedAt` carry only
  // the shift they belong to, so that date stands in for the open time.
  opened_at: iso(raw.startedAt) ?? costing?.started_at ?? (raw.shiftDate ? raw.shiftDate + 'T00:00:00.000Z' : null),
  closed_at: iso(raw.closedAt) ?? costing?.ended_at ?? null,
  opened_by: raw.supervisor ?? null,
  remarks: raw.remarks ?? null,
  // From special_batch_detail, when that batch has been costed.
  stage: costing?.stage ?? null,
  output_kg: costing?.output_kg ?? null,
  packed_sacks: costing?.packed_sacks ?? null,
  total_cost: costing?.total_cost ?? null,
  cost_per_kg: costing?.cost_per_kg ?? null,
  efficiency_pct: costing?.efficiency_pct ?? null,
});

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

async function loadBatches() {
  const [doc, costing] = await Promise.all([plantDoc(), costingByBatchNo()]);
  return (doc?.batches ?? [])
    .map((b) => toBatch(b, costing.get(String(b.no ?? b.batchNo))))
    .sort((a, b) => String(b.opened_at ?? '').localeCompare(String(a.opened_at ?? '')));
}

/**
 * Rewrites the batch array inside the plant blob.
 *
 * Postgres stores `doc` as one JSON value, so there is no way to patch a
 * single key of it over PostgREST - the whole document goes back. A tablet
 * syncing at the same moment would otherwise silently lose its write, so the
 * update is guarded on the `version` the document was read at and retried
 * against a fresh copy when that guard misses.
 */
async function mutateBatches(mutate, attempt = 1) {
  const { doc, version } = await plantState();
  if (!doc) throw ApiError.unavailable('Plant state has not been synced yet');

  const batches = mutate(doc.batches ?? []);
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

const page = (rows, query) => {
  const { from, limit, page: pageNo } = parsePagination(query);
  return { rows: rows.slice(from, from + limit), total: rows.length, page: pageNo, limit };
};

export const batchService = {
  table: TABLES.batches,

  async list(query = {}, filters = {}) {
    let rows = await loadBatches();
    if (filters.status) rows = rows.filter((b) => b.status === filters.status);
    if (filters.machine_id) rows = rows.filter((b) => b.machine_id === filters.machine_id);
    return page(rows, query);
  },

  /** Open batches, oldest first - the order they need attention in. */
  async listOpen(query = {}) {
    const rows = (await loadBatches())
      .filter((b) => b.status === 'open')
      .sort((a, b) => String(a.opened_at ?? '').localeCompare(String(b.opened_at ?? '')));
    return page(rows, query);
  },

  async findById(id) {
    const found = (await loadBatches()).find((b) => b.id === id || b.ref === id);
    if (!found) throw ApiError.notFound('batch ' + id + ' not found');
    return found;
  },

  async create(payload) {
    const row = {
      id: payload.id ?? randomUUID(),
      no: String(payload.ref ?? payload.no ?? ''),
      closed: false,
      paired: Boolean(payload.paired),
      capacity: payload.capacity ?? null,
      qualities: payload.qualities ?? (payload.grade ? [payload.grade] : []),
      shiftDate: payload.shiftDate ?? payload.shift_date ?? null,
      startedAt: Date.now(),
      autoclaveId: payload.machineId ?? payload.machine_id ?? null,
      formulation: payload.formulation ?? null,
      autoclaveDone: false,
    };
    await mutateBatches((batches) => [...batches, row]);
    return toBatch(row);
  },

  async update(id, patch) {
    await mutateBatches((batches) => {
      const index = batches.findIndex((b) => b.id === id);
      if (index < 0) throw ApiError.notFound('batch ' + id + ' not found');
      const next = [...batches];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    return batchService.findById(id);
  },

  /** A batch closes once every stage has a recorded verdict. */
  async close(id, { closedBy, remarks } = {}) {
    const batch = await batchService.findById(id);
    if (batch.status === 'closed') throw ApiError.conflict('Batch is already closed');
    return batchService.update(id, {
      closed: true,
      closedAt: new Date().toISOString(),
      closedBy: closedBy ?? null,
      remarks: remarks ?? batch.remarks,
    });
  },

  reopen: (id) => batchService.update(id, { closed: false, closedAt: null, closedBy: null }),
};

export default batchService;
