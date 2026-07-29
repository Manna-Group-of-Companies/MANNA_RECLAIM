import { defineModel } from './base.model.js';

/**
 * Breakdowns raised against a machine, in the shape the tablets write them:
 * when it went down, when it was repaired, and the write-up of why. There is
 * no status or severity column - maintenance.service.js derives both.
 */
export const Maintenance = defineModel(
  'Maintenance',
  'maintenance',
  {
    machine_id: { type: String, required: true, index: true },
    machine: { type: String, default: null },
    down_start: { type: String, default: () => new Date().toISOString(), index: true },
    repaired_at: { type: String, default: null, index: true },
    downtime_min: { type: Number, default: null },
    root_cause: { type: String, default: null },
    resolution: { type: String, default: null },
    prevention: { type: String, default: null },
    resolved_by: { type: String, default: null },
    device: { type: String, default: null },
  },
  undefined,
  { strict: false },
);

/**
 * Greasing / temperature log. One row per bearing position per reading -
 * Cracker and grinders every 2h, refiners every 3h (maintenance.service.js).
 */
export const BearingLog = defineModel(
  'BearingLog',
  'bearing_logs',
  {
    machine_id: { type: String, required: true, index: true },
    machine: { type: String, default: null },
    bearing_type: { type: String, default: 'bearing' },
    position: { type: String, default: null },
    temp_c: { type: Number, default: null },
    supervisor: { type: String, default: null },
    shift_date: { type: String, default: null },
    shift: { type: String, default: null },
    ts: { type: String, default: () => new Date().toISOString(), index: true },
    recorded_at: { type: String, default: null },
    logged_at: { type: String, default: null },
    device: { type: String, default: null },
  },
  undefined,
  { strict: false },
);

export default Maintenance;
