import { z } from 'zod';
import { isoDate, shiftEnum, qualityEnum } from './common.validation.js';

export const startRunSchema = z.object({
  machineId: z.string().min(1),
  batchId: z.string().optional().nullable(),
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

export const pauseRunSchema = z.object({ paused: z.boolean().default(true) });

export const syncRunsSchema = z.object({ rows: z.array(z.record(z.any())).max(500) });
