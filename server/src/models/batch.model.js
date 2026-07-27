import { defineModel } from './base.model.js';
import { QUALITIES } from '../config/constants.js';

/** An autoclave load. Closes once every stage has a recorded quality verdict. */
export const Batch = defineModel(
  'Batch',
  'batches',
  {
    machine_id: { type: String, required: true, index: true },
    ref: { type: String, required: true, trim: true },
    formulation: { type: String, default: null },
    capacity: { type: Number, default: null },
    grade: { type: String, enum: [...QUALITIES, null], default: null },
    opened_at: { type: String, default: () => new Date().toISOString() },
    opened_by: { type: String, default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    closed_at: { type: String, default: null },
    closed_by: { type: String, default: null },
    remarks: { type: String, default: null },
  },
  (schema) => {
    schema.index({ status: 1, opened_at: -1 });
  },
);

export default Batch;
