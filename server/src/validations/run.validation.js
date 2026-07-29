import { z } from 'zod';
import { isoDate, shiftEnum, qualityEnum } from './common.validation.js';

export const startRunSchema = z.object({
  machineId: z.string().min(1),
  batchId: z.string().optional().nullable(),
  batchNo: z.string().optional().nullable(),
  line: z.string().optional().nullable(),
  quality: qualityEnum.optional().nullable(),
  shiftDate: isoDate.optional(),
  shift: shiftEnum.optional(),
  supervisor: z.string().optional().nullable(),
  workers: z.coerce.number().int().min(0).max(20).optional().nullable(),
  startedAt: z.string().datetime().optional(),
});

export const stopRunSchema = z.object({
  stoppedAt: z.string().datetime().optional(),
  outWeight: z.coerce.number().min(0).optional().nullable(),
  workers: z.coerce.number().int().min(0).max(20).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
});

/** The Weigh tab only ever sends the number that came off the scale. */
export const weighRunSchema = z.object({ outWeight: z.coerce.number().min(0) });

/**
 * The Packing tab reports how many full sacks came out of a weighed run. The
 * remainder below one sack is carried into the next batch of the same grade,
 * so the tablet sends it too rather than making the server re-derive it.
 */
export const packRunSchema = z.object({
  sacks: z.coerce.number().int().min(0),
  leftoutIn: z.coerce.number().min(0).optional().nullable(),
  leftoutOut: z.coerce.number().min(0).optional().nullable(),
});

export const pauseRunSchema = z.object({ paused: z.boolean().default(true) });

export const syncRunsSchema = z.object({ rows: z.array(z.record(z.any())).max(500) });
