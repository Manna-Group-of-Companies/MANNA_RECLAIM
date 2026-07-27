import { defineModel } from './base.model.js';
import { QUALITIES } from '../config/constants.js';

/** Lab verdict for a batch / run / machine. */
export const QualityTest = defineModel(
  'QualityTest',
  'quality_tests',
  {
    batch_id: { type: String, default: null, index: true },
    run_id: { type: String, default: null, index: true },
    machine_id: { type: String, default: null, index: true },
    grade: { type: String, enum: QUALITIES, required: true, index: true },
    verdict: { type: String, enum: ['pass', 'hold'], required: true, index: true },
    tested_by: { type: String, default: null },
    tested_at: { type: String, default: () => new Date().toISOString() },
    remarks: { type: String, default: null },
  },
);

export default QualityTest;
