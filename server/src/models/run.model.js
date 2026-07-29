import { defineModel } from './base.model.js';
import { QUALITIES, SHIFTS } from '../config/constants.js';

/**
 * One machine running for part of a shift.
 *
 * The column names below are the ones the shop-floor tablets write (and that
 * the Supabase -> Mongo migration copied over verbatim): a run is *open* while
 * `ended_at` is null, and its output is `weight_kg`. There is no `status`
 * column - run.service.js derives one so the API keeps a stable shape.
 *
 * `strict: false` because the tablets carry a dozen more per-line columns
 * (elec_start, hour_end, leftout_in, pickcut_hours ...) that the server only
 * needs to store and hand back untouched.
 */
export const Run = defineModel(
  'Run',
  'runs',
  {
    machine_id: { type: String, required: true, index: true },
    machine: { type: String, default: null },
    kind: { type: String, default: null },
    line: { type: String, default: null },
    batch_no: { type: String, default: null, index: true },
    autoclave_id: { type: String, default: null },
    formulation: { type: String, default: null },
    capacity: { type: Number, default: null },
    quality: { type: String, enum: [...QUALITIES, null, ''], default: null },
    mesh: { type: String, default: null },
    tyre_type: { type: String, default: null },
    shift_date: { type: String, default: null, index: true },
    shift: { type: String, enum: [...Object.values(SHIFTS), null, ''], default: null },
    supervisor: { type: String, default: null },
    workers: { type: Number, default: null },
    passes: { type: Number, default: 1 },
    paired: { type: Boolean, default: false },
    started_at: { type: String, default: null },
    ended_at: { type: String, default: null, index: true },
    runtime_min: { type: Number, default: null },
    hours_run: { type: Number, default: null },
    weight_kg: { type: Number, default: null },
    kwh: { type: Number, default: null },
    firewood_kg: { type: Number, default: null },
    packed_sacks: { type: Number, default: null },
    remarks: { type: String, default: null },
    device: { type: String, default: null },
  },
  (schema) => {
    schema.index({ shift_date: 1, shift: 1 });
    // Backs the "does this machine already have a run in progress" lookup in
    // run.service.start(). Deliberately not unique: the offline tablets replay
    // historical rows through /runs/sync and a hard constraint would reject the
    // whole batch.
    schema.index({ machine_id: 1, ended_at: 1 });
  },
  { strict: false },
);

export default Run;
