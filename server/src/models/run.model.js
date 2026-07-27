import { defineModel } from './base.model.js';
import { QUALITIES, SHIFTS } from '../config/constants.js';

/** One machine running for part of a shift. At most one `running` row per machine. */
export const Run = defineModel(
  'Run',
  'runs',
  {
    machine_id: { type: String, required: true, index: true },
    batch_id: { type: String, default: null, index: true },
    quality: { type: String, enum: [...QUALITIES, null], default: null },
    shift_date: { type: String, default: null, index: true },
    shift: { type: String, enum: [...Object.values(SHIFTS), null], default: null },
    supervisor: { type: String, default: null },
    workers: { type: Number, default: null },
    started_at: { type: String, default: null },
    stopped_at: { type: String, default: null },
    out_weight: { type: Number, default: null },
    status: { type: String, enum: ['running', 'done'], default: 'running', index: true },
    paused: { type: Boolean, default: false },
    paused_at: { type: String, default: null },
    remarks: { type: String, default: null },
  },
  (schema) => {
    schema.index({ shift_date: 1, shift: 1 });
    // Backs the "does this machine already have a run in progress" lookup in
    // run.service.start(). Deliberately not unique: the offline tablets replay
    // historical rows through /runs/sync and a hard constraint would reject the
    // whole batch.
    schema.index({ machine_id: 1, status: 1 });
  },
);

export default Run;
