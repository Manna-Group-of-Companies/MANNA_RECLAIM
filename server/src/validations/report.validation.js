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

/**
 * A labour rate coming into force on a date.
 *
 * Either half prices it: rupees an hour outright, or the day wage over the
 * shift it covers. Asking for both would be asking the plant to agree with
 * itself about a division it does not do - so one is required and the other is
 * worked out. See rate.service's perHourOf().
 */
export const labourRateSchema = z
  .object({
    effectiveFrom: isoDate,
    perHour: z.coerce.number().min(0).max(10_000).optional().nullable(),
    dailyWage: z.coerce.number().min(0).max(100_000).optional().nullable(),
    shiftHours: z.coerce.number().positive().max(24).optional().nullable(),
    note: z.string().max(200).optional().nullable(),
  })
  .refine((r) => (r.perHour ?? 0) > 0 || (r.dailyWage ?? 0) > 0, {
    message: 'Give the rate per hour, or the day wage it works out from',
    path: ['perHour'],
  });
