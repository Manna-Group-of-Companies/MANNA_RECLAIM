import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { runService } from '../services/run.service.js';
import { batchService } from '../services/batch.service.js';
import { FINAL_REFINER_IDS } from '../config/constants.js';
import { logger } from '../config/logger.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await runService.list(req.query, {
    machine_id: req.query.machineId,
    shift_date: req.query.date,
    shift: req.query.shift,
    batch_no: req.query.batch ?? req.query.batchNo,
    status: req.query.status,
  })),
);

export const active = asyncHandler(async (req, res) =>
  paginated(res, await runService.listActive(req.query)),
);

/** Finished runs on a weighed machine that still have no out-weight. */
export const pendingWeigh = asyncHandler(async (req, res) =>
  paginated(res, await runService.listPendingWeigh(req.query)),
);

/** Runs already weighed, newest first - the Weigh tab's correction list. */
export const weighed = asyncHandler(async (req, res) =>
  paginated(res, await runService.listWeighed(req.query)),
);

/** Weighed runs that still have full sacks left to bag. */
export const pendingPack = asyncHandler(async (req, res) =>
  paginated(res, await runService.listPendingPack(req.query)),
);

/** Packed sacks still in the yard - what the Dispatch tab loads from. */
export const packed = asyncHandler(async (req, res) =>
  paginated(res, await runService.listPacked(req.query)),
);

export const byShift = asyncHandler(async (req, res) => {
  const result = await runService.byShift(req.query);
  // The service may have fallen back to the latest shift on record, so the
  // client is told which one it is actually looking at.
  return paginated(res, result, 'OK', { shift_date: result.shift_date, shift: result.shift });
});

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await runService.findById(req.params.id)),
);

export const start = asyncHandler(async (req, res) =>
  created(res, await runService.start({ ...req.body, supervisor: req.body.supervisor ?? req.user?.name }), 'Run started'),
);

/**
 * Whether logging this run is what settles a grade for its batch.
 *
 * The final refiner always does: it is the last pass a special-line grade goes
 * through, so the supervisor is not left ticking a grade the plant has already
 * made. A coarse-line machine turned onto the special line does too, but only
 * where its output is actually weighed - which is R2, and not PR1, whose pass
 * is a pre-refining one that yields no output record at all.
 */
const settlesGrade = (run) =>
  Boolean(run.quality) &&
  run.non_production !== true &&
  (FINAL_REFINER_IDS.includes(run.machine_id) || (run.line === 'special' && run.needs_weigh === true));

/**
 * What logging a run tells the batch it was logged against.
 *
 * Discharging an autoclave is what takes a batch out of the vessel, and that is
 * what makes it selectable by the refiners; a pass that settles a grade marks
 * that grade off on the batch card.
 *
 * Both are follow-ups to a run that is already saved. A batch the number matches
 * nothing for - a coarse load, or a number keyed by hand - is a no-op, and a
 * failure here is logged rather than raised: the run itself is on the record, and
 * failing the stop would have the crew log it twice.
 */
async function applyToBatch(run) {
  const ref = run.batch_no;
  if (!ref) return;
  try {
    if (run.kind === 'autoclave' || run.autoclave_id) {
      await batchService.markAutoclaveDone(ref, run.unloaded_at ?? run.ended_at);
    }
    if (settlesGrade(run)) {
      await batchService.markQuality(ref, run.quality);
    }
  } catch (err) {
    logger.error(`Run ${run.id} logged, but batch ${ref} could not be updated: ${err.message}`);
  }
}

export const stop = asyncHandler(async (req, res) => {
  const run = await runService.stop(req.params.id, req.body);
  await applyToBatch(run);
  return ok(res, run, 'Run stopped');
});

/** The running tally kept on a machine that is still going. */
export const tally = asyncHandler(async (req, res) =>
  ok(res, await runService.tally(req.params.id, req.body.entries), 'Tally updated'),
);

export const weigh = asyncHandler(async (req, res) =>
  ok(
    res,
    await runService.weigh(req.params.id, req.body.outWeight, req.body.entries),
    'Weight recorded',
  ),
);

export const pack = asyncHandler(async (req, res) =>
  ok(res, await runService.pack(req.params.id, req.body), 'Packing recorded'),
);

/** Corrects a run already on record (the back office's History tab). */
export const update = asyncHandler(async (req, res) =>
  ok(res, await runService.edit(req.params.id, req.body), 'Run updated'),
);

/** Discards a run started by mistake - nothing is logged against the machine. */
export const cancel = asyncHandler(async (req, res) =>
  ok(res, await runService.cancel(req.params.id), 'Run cancelled'),
);

/** Removes a logged run from the record for good (the History tab's delete). */
export const remove = asyncHandler(async (req, res) =>
  ok(res, await runService.discard(req.params.id), 'Run deleted'),
);

export const pause = asyncHandler(async (req, res) =>
  ok(res, await runService.pause(req.params.id, req.body.paused !== false), 'Run updated'),
);

export const sync = asyncHandler(async (req, res) =>
  ok(res, await runService.upsertMany(req.body.rows), 'Runs synced'),
);
