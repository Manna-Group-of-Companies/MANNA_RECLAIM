import { defineModel } from './base.model.js';
import { QUALITIES } from '../config/constants.js';

/**
 * Lab verdict, as the tablets record it: keyed to a batch *number* rather than
 * a batch id, with the measured values kept as a `params` array so the lab can
 * add a test without a schema change.
 */
export const QualityTest = defineModel(
  'QualityTest',
  'quality_tests',
  {
    kind: { type: String, default: 'batch' },
    batch_no: { type: String, default: null, index: true },
    quality: { type: String, enum: [...QUALITIES, null, ''], default: null, index: true },
    machine_id: { type: String, default: null, index: true },
    shift_date: { type: String, default: null },
    shift: { type: String, default: null },
    verdict: { type: String, enum: ['pass', 'hold'], required: true, index: true },
    params: { type: [{ name: String, value: String, unit: String }], default: [] },
    tester: { type: String, default: null },
    notes: { type: String, default: null },
    ts: { type: String, default: () => new Date().toISOString(), index: true },
    attachment_url: { type: String, default: null },
    attachment_name: { type: String, default: null },
    device: { type: String, default: null },
  },
  undefined,
  { strict: false },
);

export default QualityTest;
