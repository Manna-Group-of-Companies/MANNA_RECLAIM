import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1) });

export const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
}).passthrough();

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const dateRange = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
}).passthrough();

export const shiftEnum = z.enum(['Day', 'Night']);
export const qualityEnum = z.enum(['Special', 'SuperFine', 'Fine', 'Medium', 'DRC']);
export const gradeEnum = z.enum(['Special', 'SuperFine', 'Fine', 'Medium', 'Coarse', 'Sillsheet']);
