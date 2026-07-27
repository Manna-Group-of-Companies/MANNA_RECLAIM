import { defineModel } from './base.model.js';

/** Breakdowns and services raised against a machine. */
export const Maintenance = defineModel(
  'Maintenance',
  'maintenance',
  {
    machine_id: { type: String, required: true, index: true },
    kind: { type: String, enum: ['breakdown', 'service', 'inspection', 'other'], default: 'breakdown' },
    title: { type: String, required: true, trim: true },
    detail: { type: String, default: null },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    logged_at: { type: String, default: () => new Date().toISOString() },
    logged_by: { type: String, default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    resolved_at: { type: String, default: null },
    resolved_by: { type: String, default: null },
    remarks: { type: String, default: null },
  },
);

/** Greasing log. Cracker/grinders every 2h, refiners every 3h - see maintenance.service.js. */
export const BearingLog = defineModel(
  'BearingLog',
  'bearing_logs',
  {
    machine_id: { type: String, required: true, index: true },
    kind: { type: String, enum: ['bearing', 'bush'], default: 'bearing' },
    positions: { type: [String], default: null },
    by_user: { type: String, default: null },
    ts: { type: String, default: () => new Date().toISOString(), index: true },
    remarks: { type: String, default: null },
  },
);

export default Maintenance;
