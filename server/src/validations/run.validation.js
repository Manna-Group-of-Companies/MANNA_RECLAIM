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
  /**
   * The batches a refining pass drew from, the one being refined first and the
   * tailings mixed into it after. Four is the ceiling because that is how many
   * columns the tablets kept them in - see src1..src4 in config/tables. Sent by
   * the special line and by the refiners alike: two batches through one machine
   * is as ordinary on one as on the other.
   */
  sources: z.array(z.string().max(60)).max(4).optional().nullable(),
  // The refiner crews read both meters off the machine as they start it. A
  // reading of zero is a mis-key rather than a meter that has never turned, so
  // it is rejected the same way the tablets reject it.
  elecStart: z.coerce.number().positive().optional().nullable(),
  hourStart: z.coerce.number().positive().optional().nullable(),
  /**
   * A moulding press: which product it is set up for, and the two settings the
   * floor may change for one run - the cure and the mould on the press. The
   * temperature and the compound rate are not here on purpose; those are the
   * product's, and the server copies them off it - see run.service's
   * pressFields().
   */
  product: z.string().max(40).optional().nullable(),
  cyclicMin: z.coerce.number().positive().max(600).optional().nullable(),
  cavities: z.coerce.number().int().positive().max(500).optional().nullable(),
});

/**
 * Stopping a run. The crew normally reads both meters off the machine and the
 * server works out what was used; `kwh` and `hoursRun` are the way in when only
 * the difference is known - entering past data from a paper sheet, or a meter
 * that was replaced mid-run.
 */
export const stopRunSchema = z.object({
  stoppedAt: z.string().datetime().optional(),
  /**
   * The batches that went through together, as the machine is stopped.
   *
   * The same list the start sheet sends, asked again at the other end of the
   * run because that is when the crew know the answer: the second batch goes in
   * when it is ready, which is usually after the pass has begun. The batch the
   * run is filed under is not moved by it - see mixColumns().
   */
  sources: z.array(z.string().max(60)).max(4).optional().nullable(),
  outWeight: z.coerce.number().min(0).optional().nullable(),
  workers: z.coerce.number().int().min(0).max(20).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
  elecEnd: z.coerce.number().positive().optional().nullable(),
  hourEnd: z.coerce.number().positive().optional().nullable(),
  kwh: z.coerce.number().min(0).optional().nullable(),
  hoursRun: z.coerce.number().min(0).optional().nullable(),
  firewoodKg: z.coerce.number().min(0).optional().nullable(),
  /**
   * The three moments inside an autoclave cycle, filled in as it is discharged
   * because that is when somebody is standing at the vessel with the tablet.
   *
   * `pressureAt` splits the heat-up off the cook - without it a long cook and a
   * slow start are the same number. The two door times are a pair, and the gap
   * between them is the point: the vessel standing open while it is emptied and
   * the next charge is put in, which is dead time on a machine that only earns
   * while it is shut and hot, and a figure the plant has never had.
   *
   * Clock times rather than durations. A duration is one subtraction away and
   * cannot be checked afterwards; these are figures the plant will be measured
   * on, so they have to be something somebody can point at on a shift. All
   * optional - a charge from before anybody was recording them has no answer.
   */
  pressureAt: z.string().datetime().optional().nullable(),
  doorOpenAt: z.string().datetime().optional().nullable(),

  /**
   * What came out of a press: the pieces moulded, and the flash trimmed off
   * them. Neither may be negative, and a press that made no pieces at all made
   * nothing to cost - so the count has to be a real one.
   */
  pieces: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
  flashKg: z.coerce.number().min(0).optional().nullable(),
  /**
   * The picking gang on a cracker run: how many were put on pulling scrap tyres
   * out of the yard, and roughly how long they were at it. Approximate by
   * design - the gang is not clocked, the supervisor says "four of them, about
   * three hours" - so hours take a decimal and neither is required.
   *
   * A shift is twelve hours and nobody works more than one at a stretch, so
   * anything past that is a mis-key rather than a long day.
   */
  pickingLabourers: z.coerce.number().int().min(0).max(50).optional().nullable(),
  pickingHours: z.coerce.number().min(0).max(24).optional().nullable(),
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
    /**
     * The batches the pass drew from, the one it is filed under first.
     *
     * Correctable for the reason the plant's own record gives: a mix could only
     * ever be said at the moment the machine was started, and a crew that
     * realised afterwards - or started the run before the second batch went in,
     * which is the ordinary way round - had nowhere to put it. Five runs in
     * August have both numbers typed into `batch_no` with a comma between them,
     * which is a shape no report can read. An empty list takes a mix back off.
     */
    sources: z.array(z.string().max(60)).max(4).optional().nullable(),
    // A press run's own figures. The compound rate is left out: it is what the
    // product cost when this was moulded, not something to correct afterwards.
    product: z.string().max(40).optional().nullable(),
    cavities: z.coerce.number().int().min(0).optional().nullable(),
    cyclicMin: z.coerce.number().min(0).optional().nullable(),
    pieces: z.coerce.number().int().min(0).optional().nullable(),
    flashKg: z.coerce.number().min(0).optional().nullable(),
    // The picking gang on a cracker run. Correctable because the figure is an
    // estimate the supervisor gives at the end of a shift, and an estimate is
    // exactly the kind of thing that gets remembered better the next morning.
    pickingLabourers: z.coerce.number().int().min(0).max(50).optional().nullable(),
    pickingHours: z.coerce.number().min(0).max(24).optional().nullable(),
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
 * The running tally kept while a shiftwise machine is still going: each load is
 * banked as it comes off rather than held in someone's head until the shift
 * ends. The whole list is sent every time, so adding one and removing one are
 * the same call - nothing here weighs the run, which still happens in the Weigh
 * tab once the machine has stopped.
 */
export const tallyRunSchema = z.object({
  entries: z.array(z.coerce.number().positive()).max(60),
});

/**
 * The Packing tab reports what came off a finished run and into the yard.
 *
 * A weighed run reports full sacks, with the remainder below one sack carried
 * into the next batch of the same grade - the tablet sends that too rather than
 * making the server re-derive it. A press run reports boxed pieces instead:
 * there is nothing to weigh, nothing to carry forward, and a piece is a piece,
 * so `sacks` and the two leftouts are simply not part of that entry.
 *
 * One of the two counts has to be there. Neither is required on its own because
 * this one route serves both benches, and which figure applies is decided by the
 * run - a press cannot be packed in sacks and a refiner cannot be packed in
 * pieces, and run.service refuses either rather than trusting the field that
 * happened to arrive.
 */
export const packRunSchema = z
  .object({
    sacks: z.coerce.number().int().min(0).optional(),
    leftoutIn: z.coerce.number().min(0).optional().nullable(),
    leftoutOut: z.coerce.number().min(0).optional().nullable(),
    /** Boxed pieces off a press run. Capped where the piece count itself is. */
    pieces: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((body) => body.sacks != null || body.pieces != null, {
    message: 'Say how many sacks were bagged, or how many pieces were boxed',
    path: ['sacks'],
  });

export const pauseRunSchema = z.object({ paused: z.boolean().default(true) });

export const syncRunsSchema = z.object({ rows: z.array(z.record(z.any())).max(500) });
