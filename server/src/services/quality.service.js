import { crud } from './base.service.js';
import { TABLES, QUALITIES } from '../config/constants.js';

const base = crud(TABLES.qualityTests, { defaultSort: 'ts' });

/**
 * The lab keys its tests to the batch *number* and calls the grade `quality`;
 * `grade`, `tested_at` and `tested_by` are exposed as aliases so the client
 * models stay readable.
 */
const decorate = (row) =>
  row && {
    ...row,
    grade: row.quality ?? null,
    batch_id: row.batch_no ?? null,
    tested_at: row.ts ?? row.created_at ?? null,
    tested_by: row.tester ?? null,
    remarks: row.notes ?? null,
  };

const decorateList = (result) => ({ ...result, rows: result.rows.map(decorate) });

export const qualityService = {
  ...base,
  qualities: QUALITIES,

  async list(query = {}, filters = {}) {
    return decorateList(await base.list(query, filters));
  },

  async findById(id) {
    return decorate(await base.findById(id));
  },

  /** Tests for a batch, oldest first - `batchRef` is the batch number. */
  listForBatch: async (batchRef, query = {}) =>
    decorateList(await base.list({ ...query, order: 'asc' }, { batch_no: String(batchRef) })),

  record: (payload) =>
    base
      .create({
        kind: payload.kind ?? 'batch',
        batch_no: payload.batchNo ?? payload.batchId ?? null,
        run_id: payload.runId ?? null,
        machine_id: payload.machineId ?? null,
        quality: payload.grade ?? payload.quality ?? null,
        verdict: payload.verdict, // pass | hold
        params: payload.params ?? [],
        tester: payload.testedBy ?? null,
        notes: payload.remarks ?? null,
        shift_date: payload.shiftDate ?? null,
        shift: payload.shift ?? null,
        ts: payload.testedAt || new Date().toISOString(),
      })
      .then(decorate),

  /** Pass rate per grade over the window. */
  async summary({ from, to } = {}) {
    const rows = (await base.all()).map(decorate);
    const byGrade = {};
    for (const t of rows) {
      const day = t.tested_at?.slice(0, 10);
      if (from && day && day < from) continue;
      if (to && day && day > to) continue;
      const key = t.grade ?? 'Unspecified';
      const g = (byGrade[key] ||= { grade: key, total: 0, pass: 0, hold: 0 });
      g.total += 1;
      if (t.verdict === 'pass') g.pass += 1;
      else g.hold += 1;
    }
    return Object.values(byGrade).map((g) => ({
      ...g,
      passRate: g.total ? +((g.pass / g.total) * 100).toFixed(1) : 0,
    }));
  },
};

export default qualityService;
