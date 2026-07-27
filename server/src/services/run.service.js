import { crud, model, wrapError } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { currentShift, todayISO } from '../utils/shift.js';

const base = crud(TABLES.runs, { defaultSort: 'started_at' });

export const runService = {
  ...base,

  listActive: (query = {}) => base.list(query, { status: 'running' }),

  byShift: (query = {}) =>
    base.list(query, {
      shift_date: query.date || todayISO(),
      shift: query.shift || currentShift(),
    }),

  async start(payload) {
    let inProgress;
    try {
      inProgress = await model(TABLES.runs)
        .exists({ machine_id: payload.machineId, status: 'running' });
    } catch (err) {
      throw wrapError(err);
    }
    if (inProgress) throw ApiError.conflict('That machine already has a run in progress');

    return base.create({
      machine_id: payload.machineId,
      batch_id: payload.batchId ?? null,
      quality: payload.quality ?? null,
      shift_date: payload.shiftDate || todayISO(),
      shift: payload.shift || currentShift(),
      supervisor: payload.supervisor ?? null,
      workers: payload.workers ?? null,
      started_at: payload.startedAt || new Date().toISOString(),
      status: 'running',
    });
  },

  async stop(id, payload = {}) {
    const run = await base.findById(id);
    if (run.status !== 'running') throw ApiError.conflict('Run is not in progress');
    return base.update(id, {
      status: 'done',
      stopped_at: payload.stoppedAt || new Date().toISOString(),
      out_weight: payload.outWeight ?? run.out_weight,
      workers: payload.workers ?? run.workers,
      remarks: payload.remarks ?? run.remarks,
    });
  },

  pause: (id, paused = true) => base.update(id, { paused, paused_at: paused ? new Date().toISOString() : null }),
};

export default runService;
