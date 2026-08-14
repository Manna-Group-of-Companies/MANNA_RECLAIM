import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1) });

export const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
}).passthrough();

/**
 * The few endpoints a screen reads whole rather than a page at a time: the rate
 * card and the customer list behind Dispatch's pricing, and the bearing log the
 * Bearings tab charts. Each row is a handful of short fields, and the screens
 * want the entire set - paging them would fetch the same rows in more requests.
 *
 * Still a ceiling, and only these routes opt into it: the 200 above stays the
 * default for every other list, where an unbounded `limit` would be a way to
 * ask the API for the whole plant's history in one go.
 */
export const bulkListQuery = listQuery.extend({
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const dateRange = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
}).passthrough();

export const shiftEnum = z.enum(['Day', 'Night']);
export const qualityEnum = z.enum(['Special', 'SuperFine', 'Fine', 'Medium', 'DRC', 'Special DRC']);
/** The grades a batch is tracked in - DRC is not one. See BATCH_QUALITIES. */
export const batchQualityEnum = z.enum([
  'Special',
  'SuperFine',
  'Fine',
  'Medium',
  'Special DRC',
]);
export const gradeEnum = z.enum([
  'Special',
  'SuperFine',
  'Fine',
  'Medium',
  'Special DRC',
  'Coarse',
  'Sillsheet',
]);
