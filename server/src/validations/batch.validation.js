import { z } from 'zod';
import { qualityEnum } from './common.validation.js';

export const createBatchSchema = z.object({
  machine_id: z.string().min(1),
  ref: z.string().min(1),
  formulation: z.string().optional().nullable(),
  capacity: z.coerce.number().int().positive().optional().nullable(),
  grade: qualityEnum.optional().nullable(),
  opened_at: z.string().datetime().optional(),
  opened_by: z.string().optional().nullable(),
  status: z.enum(['open', 'closed']).default('open'),
});

export const updateBatchSchema = createBatchSchema.partial();

export const closeBatchSchema = z.object({ remarks: z.string().max(500).optional() });

export const qualityTestSchema = z.object({
  batchId: z.string().optional().nullable(),
  runId: z.string().optional().nullable(),
  machineId: z.string().optional().nullable(),
  grade: qualityEnum,
  verdict: z.enum(['pass', 'hold']),
  testedBy: z.string().optional().nullable(),
  testedAt: z.string().datetime().optional(),
  remarks: z.string().max(500).optional().nullable(),
});
