import { z } from 'zod';
import { isoDate, shiftEnum, qualityEnum } from './common.validation.js';

export const startRunSchema = z.object({
  machineId: z.string().min(1),
  batchId: z.string().optional().nullable(),
  batchNo: z.string().optional().nullable(),
  line: z.string().optional().nullable(),
  /** Copied off the batch, so the run reads on its own at stop time. */
  formulation: z.string().max(120).optional().nullable(),
  /** What the grinding line is fed with this shift, and the crumb it yields. */
  tyreType: z.enum(['truck', 'bike']).optional().nullable(),
  mesh: z.string().max(20).optional().nullable(),
  quality: qualityEnum.optional().nullable(),
  shiftDate: isoDate.optional(),
  shift: shiftEnum.optional(),
  supervisor: z.string().optional().nullable(),
  workers: z.coerce.number().int().min(0).max(20).optional().nullable(),
  /** An autoclave charged alongside its twin - the crew is shared, so half. */
  paired: z.boolean().optional(),
  startedAt: z.string().datetime().optional(),
  /**
   * A run that yields nothing to weigh - the special line's rare
   * non-production pass. It keeps its meter readings, but never reaches the
   * Weigh tab and so is never bagged.
   */
  nonProduction: z.boolean().optional(),
  // The refiner crews read both meters off the machine as they start it. A
  // reading of zero is a mis-key rather than a meter that has never turned, so
  // it is rejected the same way the tablets reject it.
  elecStart: z.coerce.number().positive().optional().nullable(),
  hourStart: z.coerce.number().positive().optional().nullable(),
});

/**
 * Stopping a run. The crew normally reads both meters off the machine and the
 * server works out what was used; `kwh` and `hoursRun` are the way in when only
 * the difference is known - entering past data from a paper sheet, or a meter
 * that was replaced mid-run.
 */
export const stopRunSchema = z.object({
  stoppedAt: z.string().datetime().optional(),
  outWeight: z.coerce.number().min(0).optional().nullable(),
  workers: z.coerce.number().int().min(0).max(20).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
  elecEnd: z.coerce.number().positive().optional().nullable(),
  hourEnd: z.coerce.number().positive().optional().nullable(),
  kwh: z.coerce.number().min(0).optional().nullable(),
  hoursRun: z.coerce.number().min(0).optional().nullable(),
  firewoodKg: z.coerce.number().min(0).optional().nullable(),
});

/**
 * Correcting a run after the fact, from the back office's History tab.
 *
 * Every field is optional and a patch carries only what was actually changed -
 * so a field left out keeps its recorded value, while an explicit null clears
 * it. Energy and hours are derived from the meter readings unless they are sent
 * outright, which is what the "difference only" boxes do.
 */
export const updateRunSchema = z
  .object({
    batchNo: z.string().max(60).optional().nullable(),
    formulation: z.string().max(120).optional().nullable(),
    quality: qualityEnum.optional().nullable(),
    shiftDate: isoDate.optional(),
    shift: shiftEnum.optional(),
    supervisor: z.string().max(80).optional().nullable(),
    workers: z.coerce.number().int().min(0).max(20).optional().nullable(),
    elecStart: z.coerce.number().min(0).optional().nullable(),
    elecEnd: z.coerce.number().min(0).optional().nullable(),
    hourStart: z.coerce.number().min(0).optional().nullable(),
    hourEnd: z.coerce.number().min(0).optional().nullable(),
    kwh: z.coerce.number().min(0).optional().nullable(),
    hoursRun: z.coerce.number().min(0).optional().nullable(),
    outWeight: z.coerce.number().min(0).optional().nullable(),
    firewoodKg: z.coerce.number().min(0).optional().nullable(),
    capacity: z.coerce.number().min(0).optional().nullable(),
    packedSacks: z.coerce.number().int().min(0).optional().nullable(),
    remarks: z.string().max(500).optional().nullable(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

/**
 * The Weigh tab sends the number that came off the scale, and - since material
 * comes off in more than one barrow - the individual weighings behind it. The
 * sheet totals them itself, so `outWeight` is the figure of record either way;
 * the entries are kept so a correction can show what went on the scale.
 */
export const weighRunSchema = z.object({
  outWeight: z.coerce.number().min(0),
  entries: z.array(z.coerce.number().min(0)).max(60).optional(),
});

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
