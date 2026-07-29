import { z } from 'zod';
import { isoDate, shiftEnum } from './common.validation.js';

/** The Efficiency tab always looks at exactly one shift. */
export const shiftQuery = z
  .object({ date: isoDate, shift: shiftEnum })
  .passthrough();

/** Why a flagged shift came in under par. */
export const efficiencyNoteSchema = z.object({
  date: isoDate,
  shift: shiftEnum.optional().nullable(),
  line: z.enum(['refiner', 'grind']),
  metric: z.string().min(1).max(120),
  reason: z.string().min(1).max(1000),
  enteredBy: z.string().max(120).optional().nullable(),
});

/** Replaces the whole cost-rate set; unknown keys are dropped by the service. */
export const costRatesSchema = z.object({
  data: z.record(z.union([z.coerce.number(), z.literal(''), z.null()])),
});
