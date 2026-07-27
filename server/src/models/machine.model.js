import { defineModel } from './base.model.js';
import { MACHINE_KINDS } from '../config/constants.js';

/** The 14 plant machines. Ids are the short codes used across the UI (CRK, R4...). */
export const Machine = defineModel(
  'Machine',
  'machines',
  {
    name: { type: String, required: true, trim: true },
    short: { type: String, trim: true, default: null },
    kind: { type: String, enum: MACHINE_KINDS, required: true, index: true },
    group_name: { type: String, default: null },
    sub: { type: String, default: null },
    accent: { type: String, default: null },
    capacity: { type: Number, default: null },
    out_weight: { type: Boolean, default: false },
    needs_quality: { type: Boolean, default: false },
    weigh: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true, index: true },
    sort_order: { type: Number, default: 0 },
  },
  (schema) => {
    schema.index({ sort_order: 1 });
  },
);

export default Machine;
