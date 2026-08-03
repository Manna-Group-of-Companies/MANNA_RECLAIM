import { z } from 'zod';
import { batchQualityEnum, qualityEnum, isoDate, shiftEnum } from './common.validation.js';

/**
 * Opening a batch - which only ever happens by loading an autoclave, so
 * `machine_id` is required and the service checks that it names one.
 *
 * There is no `qualities` or `grade` here on purpose: what a charge yields is
 * settled at the refiners, by the supervisor marking grades on the batch card or
 * by a run being logged on the final refiner. A new batch always starts empty.
 */
export const createBatchSchema = z.object({
  machine_id: z.string().min(1),
  ref: z.string().min(1),
  formulation: z.string().optional().nullable(),
  /** What the vessel was charged with, in kg. */
  capacity: z.coerce.number().int().positive().optional().nullable(),
  /** The autoclave load that opened it was shared with the twin vessel. */
  paired: z.boolean().optional(),
  /** The shift the load belongs to - a night shift keeps its start date. */
  shift: shiftEnum.optional(),
  shift_date: isoDate.optional(),
  opened_by: z.string().optional().nullable(),
});

/**
 * Correcting an open batch. `status` is not settable - a batch is filed away
 * through close, and brought back through reopen, both of which carry rules the
 * plain patch does not.
 */
export const updateBatchSchema = createBatchSchema
  .partial()
  .extend({ remarks: z.string().max(500).optional().nullable() });

export const closeBatchSchema = z.object({ remarks: z.string().max(500).optional() });

/** The supervisor ticking a grade off the batch card, or taking one back off. */
export const batchQualitySchema = z.object({
  quality: batchQualityEnum,
  marked: z.boolean().default(true),
});

/**
 * A lab verdict. `batchNo` is what the tablets actually key on - `batchId` is
 * still accepted so an older build keeps working. The measured values ride
 * along as free-form `params` so a new test needs no schema change.
 *
 * Three kinds of test, and the difference is what is being certified.
 *
 *   batch    one grade of one batch. A lot, with a verdict that releases it -
 *            applyLabVerdict() carries a pass onto the stock group's qc_status
 *            and post_dispatch() reads that before it lets the sacks go.
 *   pool     one sample of a coarse period. Coarse is not batch-identified and
 *            there is no lot to certify, so the period is sampled three times
 *            instead and the samples are a record of the line running to
 *            specification. A pool nobody has sampled still sells - coarse goes
 *            out on the line running to spec rather than on a certificate per
 *            pool - but holding any sample stops the whole period, exactly as
 *            holding a batch stops the batch.
 *   product  what a press moulded. The bench tests loops, not a grade of rubber,
 *            so `grade` carries the product's id here and is not one of the
 *            reclaim grades at all - which is why it is its own kind rather than
 *            a batch test with the enum loosened. `batchNo` is the batch of
 *            compound the press was running, which is what a re-test is filed
 *            against.
 *
 * `batchNo` carries the pool's label on a pool test, which is why it is not
 * renamed: it is the same column, holding the same kind of thing - the key of
 * the lot the sample belongs to.
 *
 * The grade rule runs both ways. Coarse is not a grade a batch is tested in -
 * BATCH_QUALITIES leaves it out and the batch card has no row for it - so a
 * batch test naming Coarse is a mistake rather than a new case. And a pool is
 * coarse by definition, so a pool test naming anything else is one too.
 */
export const qualityTestSchema = z.object({
  kind: z.enum(['batch', 'pool', 'product']).optional().default('batch'),
  batchNo: z.string().optional().nullable(),
  batchId: z.string().optional().nullable(),
  runId: z.string().optional().nullable(),
  machineId: z.string().optional().nullable(),
  /**
   * The grade on a batch or pool test, and the product's id on a product one.
   * The union rather than two fields, because it is one column on the table and
   * one thing in meaning: what was tested. Which of the two it is is decided by
   * `kind` in the refinement below, never by trying to recognise the string.
   */
  grade: z.union([z.enum([...qualityEnum.options, 'Coarse']), z.string().trim().min(1).max(40)]),
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
}).superRefine((test, ctx) => {
  const pool = test.kind === 'pool';
  const product = test.kind === 'product';

  if (pool && test.grade !== 'Coarse') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['grade'],
      message: 'A pool sample is coarse — only the coarse line is pooled by period',
    });
  }
  if (!pool && !product && test.grade === 'Coarse') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['grade'],
      message: 'Coarse is not tested by batch — file it as a pool sample against its period',
    });
  }

  /*
   * `grade` is widened to a free string so a product test can name its product,
   * and this is what keeps that from widening the batch case with it: a batch
   * test still has to name one of the plant's grades. Without this, a typo on
   * the batch bench would file a verdict against a grade that does not exist and
   * release nothing, silently.
   */
  if (!pool && !product && !qualityEnum.options.includes(test.grade)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['grade'],
      message: `A batch is tested in one of: ${qualityEnum.options.join(', ')}`,
    });
  }

  // A moulded verdict releases the product's stock, so it has to say which
  // product - and it names the batch of compound the press was running, which is
  // what a re-test is filed against and what the yard's card is read back by.
  if (product && !test.batchNo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['batchNo'],
      message: 'A moulded test has to name the batch the press was moulding',
    });
  }

  // The pool the sample belongs to, and the day it was taken. Without the day
  // there is no slot to file it in, and the sample would sit in the record
  // belonging to the period but to none of its three sample points.
  if (pool && !test.batchNo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['batchNo'],
      message: 'A pool sample has to name the pool it was taken from',
    });
  }
  if (pool && !test.shiftDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shiftDate'],
      message: 'A pool sample has to carry the date it was taken',
    });
  }
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
