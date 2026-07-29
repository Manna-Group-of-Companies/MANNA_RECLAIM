import { defineModel } from './base.model.js';

/**
 * Why a shift came in under par. The back office writes one of these against
 * the metric it flagged, so a dip in the numbers carries the plant's own
 * explanation next to it rather than being re-litigated months later.
 */
export const EfficiencyNote = defineModel(
  'EfficiencyNote',
  'efficiency_notes',
  {
    shift_date: { type: String, required: true, index: true },
    shift: { type: String, default: null },
    /** 'refiner' or 'grind' - which half of the plant the note is about. */
    line: { type: String, default: null, index: true },
    /** The card it was filed against, e.g. "Refiner Special", "Grinder 1". */
    metric: { type: String, default: null },
    reason: { type: String, required: true },
    entered_by: { type: String, default: null },
  },
  (schema) => {
    schema.index({ shift_date: 1, shift: 1 });
  },
  { strict: false },
);

export default EfficiencyNote;
