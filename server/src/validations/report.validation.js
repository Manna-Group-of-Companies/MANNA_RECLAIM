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

/**
 * Replaces the whole cost-rate set; unknown keys are dropped by the service.
 *
 * The order of the union is load-bearing and was wrong. A zod union takes the
 * first branch that accepts, and `z.coerce.number()` accepts null - Number(null)
 * is 0 - so with coercion first, every unset figure on the sheet came back as a
 * target of nought the moment the form was saved. `z.null()` never got a turn.
 *
 * A target of nought is not a small error. On a figure where less is better it
 * puts the line permanently over target and flags every shift forever; on one
 * where more is better nothing can ever fall below it, so a benchmark nobody has
 * filled in reads as one the plant meets every day - a hole reported as a pass,
 * which is the exact failure this sheet exists to prevent.
 *
 * So the two "this is blank" cases are tested before anything is coerced.
 */
export const costRatesSchema = z.object({
  data: z.record(z.union([z.null(), z.literal(''), z.coerce.number()])),
});

/**
 * The manager's benchmarks, saved as one sheet. Same shape as the cost rates
 * above: unknown keys are dropped by the service against IDEAL_VALUE_KEYS, and a
 * blank clears a target rather than setting it to nought.
 */
export const idealValuesSchema = costRatesSchema;

/**
 * Why an actual missed its ideal.
 *
 * `parameter` is the benchmark's own key rather than a card's title, so the
 * reason stays attached to the figure it explains even if the screen is laid out
 * differently later. `ideal` and `actual` come from the client because they are
 * what it had on screen when the manager was asked - the point is to keep the
 * two numbers the reason was written about, not today's.
 */
export const varianceReasonSchema = z.object({
  date: isoDate,
  shift: shiftEnum.optional().nullable(),
  parameter: z.string().min(1).max(120),
  label: z.string().max(200).optional().nullable(),
  ideal: z.coerce.number().optional().nullable(),
  actual: z.coerce.number().optional().nullable(),
  reason: z.string().min(1).max(1000),
  enteredBy: z.string().max(120).optional().nullable(),
});

/**
 * Correcting the wording of a reason already recorded.
 *
 * The text and who wrote it, and nothing else. The day, the shift, the parameter
 * and the two figures are what the record is - re-pointing one at a different
 * parameter would be a second record wearing the first one's id.
 */
export const varianceReasonEditSchema = z.object({
  reason: z.string().min(1).max(1000),
  enteredBy: z.string().max(120).optional().nullable(),
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
