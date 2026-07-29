import { randomUUID } from 'node:crypto';
import { crud, model, wrapError } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination } from '../utils/pagination.js';

/**
 * Batches never became their own Supabase table - the tablets keep the whole
 * plant state in one `shared_state` row (_id: "plant") and push batches inside
 * it, which is why the `batches` collection copied over empty. So this service
 * reads out of that blob and folds in the costing snapshot from
 * `special_batch_detail`, which is keyed by batch number.
 */

const PLANT = 'plant';

const detail = crud(TABLES.specialBatchDetail, { defaultSort: 'shift_date' });

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

async function plantDoc() {
  try {
    const row = await model(TABLES.sharedState).findById(PLANT).lean();
    return row?.doc ?? null;
  } catch (err) {
    throw wrapError(err);
  }
}

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

/** Writes the mutated batch array back into the shared-state blob. */
async function saveBatches(batches) {
  try {
    await model(TABLES.sharedState).updateOne(
      { _id: PLANT },
      {
        $set: { 'doc.batches': batches, updated_at: new Date().toISOString() },
        $inc: { version: 1 },
      },
    );
  } catch (err) {
    throw wrapError(err);
  }
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
    const doc = await plantDoc();
    if (!doc) throw ApiError.unavailable('Plant state has not been synced yet');
    const row = {
      id: payload.id ?? randomUUID(),
      no: String(payload.ref ?? payload.no ?? ''),
      closed: false,
      paired: Boolean(payload.paired),
      capacity: payload.capacity ?? null,
      qualities: payload.qualities ?? (payload.grade ? [payload.grade] : []),
      shiftDate: payload.shiftDate ?? null,
      startedAt: Date.now(),
      autoclaveId: payload.machineId ?? payload.machine_id ?? null,
      formulation: payload.formulation ?? null,
      autoclaveDone: false,
    };
    await saveBatches([...(doc.batches ?? []), row]);
    return toBatch(row);
  },

  async update(id, patch) {
    const doc = await plantDoc();
    const batches = doc?.batches ?? [];
    const index = batches.findIndex((b) => b.id === id);
    if (index < 0) throw ApiError.notFound('batch ' + id + ' not found');
    const next = [...batches];
    next[index] = { ...next[index], ...patch };
    await saveBatches(next);
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
