import { crud } from './base.service.js';
import { TABLES, QUALITIES } from '../config/constants.js';

const base = crud(TABLES.qualityTests, { defaultSort: 'tested_at' });

export const qualityService = {
  ...base,
  qualities: QUALITIES,

  listForBatch: (batchId, query = {}) => base.list({ ...query, order: 'asc' }, { batch_id: batchId }),

  record: (payload) =>
    base.create({
      batch_id: payload.batchId ?? null,
      run_id: payload.runId ?? null,
      machine_id: payload.machineId ?? null,
      grade: payload.grade,
      verdict: payload.verdict, // pass | hold
      tested_by: payload.testedBy ?? null,
      tested_at: payload.testedAt || new Date().toISOString(),
      remarks: payload.remarks ?? null,
    }),

  /** Pass rate per grade over the returned window. */
  async summary(query = {}) {
    const { rows } = await base.list({ ...query, limit: 500 });
    const byGrade = {};
    for (const t of rows) {
      const g = (byGrade[t.grade] ||= { grade: t.grade, total: 0, pass: 0, hold: 0 });
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
