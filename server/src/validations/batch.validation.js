import { z } from 'zod';
import { qualityEnum, isoDate, shiftEnum } from './common.validation.js';

export const createBatchSchema = z.object({
  machine_id: z.string().min(1),
  ref: z.string().min(1),
  formulation: z.string().optional().nullable(),
  capacity: z.coerce.number().int().positive().optional().nullable(),
  grade: qualityEnum.optional().nullable(),
  /** The autoclave load that opened it was shared with the twin vessel. */
  paired: z.boolean().optional(),
  /** The shift the load belongs to - a night shift keeps its start date. */
  shift_date: isoDate.optional(),
  opened_at: z.string().datetime().optional(),
  opened_by: z.string().optional().nullable(),
  status: z.enum(['open', 'closed']).default('open'),
});

export const updateBatchSchema = createBatchSchema.partial();

export const closeBatchSchema = z.object({ remarks: z.string().max(500).optional() });

/**
 * A lab verdict. `batchNo` is what the tablets actually key on - `batchId` is
 * still accepted so an older build keeps working. The measured values ride
 * along as free-form `params` so a new test needs no schema change.
 */
export const qualityTestSchema = z.object({
  batchNo: z.string().optional().nullable(),
  batchId: z.string().optional().nullable(),
  runId: z.string().optional().nullable(),
  machineId: z.string().optional().nullable(),
  grade: qualityEnum,
  verdict: z.enum(['pass', 'hold']),
  params: z
    .array(z.object({ name: z.string(), value: z.string(), unit: z.string().optional() }))
    .max(20)
    .optional(),
  shiftDate: isoDate.optional(),
  shift: shiftEnum.optional(),
  testedBy: z.string().optional().nullable(),
  testedAt: z.string().datetime().optional(),
  remarks: z.string().max(500).optional().nullable(),
  /** A report already on file, carried forward when a grade is re-tested. */
  attachmentUrl: z.string().url().optional().nullable(),
  attachmentName: z.string().max(200).optional().nullable(),
});

/**
 * The lab's report for a test already filed. It arrives as a base64 data URL
 * because the tablets read the file with FileReader and queue it while they are
 * offline - see the 8 MB ceiling in quality.service.js.
 */
export const qualityReportSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  dataUrl: z.string().min(1),
});
