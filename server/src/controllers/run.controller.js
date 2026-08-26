import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { op } from '../services/base.service.js';
import { runService, settlesGrade } from '../services/run.service.js';
import { batchService } from '../services/batch.service.js';
import { logger } from '../config/logger.js';

/**
 * One day, or a window, or neither.
 *
 * Returned as a list of clauses when it is a window - see applyFilters, which
 * ands repeated parameters the way PostgREST does - and as a bare value for a
 * single day, because that is the common case and an equality reads better in
 * a log than a pair of inequalities that mean the same thing.
 */
/**
 * Runs that name a batch, including the ones that name it alongside another.
 *
 * `batch_no` is usually one number and sometimes a list - the plant writes
 * "3134,3140" on a pass that worked both - so an equality match finds the first
 * kind and silently misses the second. Searching for 3134 and being shown some
 * of its runs is worse than being shown none: the answer looks complete.
 *
 * Four clauses rather than a contains: `like '*3134*'` would also match 13134
 * and 31340, and a batch search that returns another batch's runs is the one
 * failure this must not have. So it is the number alone, or the number at
 * either end of a list, or in the middle of one.
 *
 * Quoted throughout because the patterns contain commas, which PostgREST would
 * otherwise read as the separator between clauses.
 */
const batchClause = (batch) => {
  const wanted = String(batch ?? '').trim();
  if (!wanted) return {};
  // The same escaping the query builder does for a quoted value.
  const safe = wanted.replace(/(["\\])/g, '\\$1');
  return {
    or: [
      `batch_no.eq."${safe}"`,
      `batch_no.like."${safe},*"`,
      `batch_no.like."*,${safe}"`,
      `batch_no.like."*,${safe},*"`,
    ],
  };
};

const dayOrWindow = ({ date, from, to } = {}) => {
  if (date) return date;
  const clauses = [];
  if (from) clauses.push(op.gte(from));
  if (to) clauses.push(op.lte(to));
  return clauses.length ? clauses : undefined;
};

/**
 * The run record, cut however it was asked for.
 *
 * `date` is one day and `from`/`to` are a window, and both are here because
 * they answer different questions: a manager correcting last night wants the
 * shift, and anyone comparing wants the fortnight. A window given without an
 * end is open at that end, which is what "since the first" means.
 *
 * `category` is a cut of the machine list - the autoclaves, the refiners, the
 * grinders - resolved against the plant's own machines so a machine bought next
 * year lands in its category by its kind. An explicit machine wins over it:
 * asking for R4 and for the refiners means R4.
 */
export const list = asyncHandler(async (req, res) =>
  paginated(res, await runService.list(req.query, {
    machine_id: req.query.machineId || (await runService.machineIdsIn(req.query.category)),
    shift_date: dayOrWindow(req.query),
    shift: req.query.shift,
    quality: req.query.quality,
    ...batchClause(req.query.batch ?? req.query.batchNo),
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

/** Packed sacks still in the yard - what the Stock tab loads from. */
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

/**
 * Starting a run records two names, not one.
 *
 * `supervisor` is what the record is signed with: the sheet's pick, which the
 * crew may switch to whoever is actually on the floor, falling back to the
 * account when they have not. `enteredBy` is who was signed in - read off the
 * verified token and spread last so a body that sends one of its own is
 * overwritten rather than believed.
 *
 * They are usually the same name. When they are not, History says so, which is
 * the only way a shift signed with a stale pick can be spotted at all.
 */
export const start = asyncHandler(async (req, res) =>
  created(
    res,
    await runService.start({
      ...req.body,
      supervisor: req.body.supervisor ?? req.user?.name,
      enteredBy: req.user?.name ?? null,
    }),
    'Run started',
  ),
);

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

/**
 * The other half of applyToBatch(), for a run coming off the record.
 *
 * The batch card is not a table - it is a row inside the tablets' plant blob -
 * so nothing in Postgres cascades into it and a deleted run would otherwise
 * leave its discharge mark and its grade tick behind, indistinguishable from
 * facts. batchService.forgetRun() takes back only what nothing else on record
 * still says; see the note there.
 *
 * A failure is logged rather than raised, the same way applyToBatch()'s is: the
 * run is already off the record either way, and turning that into a 500 would
 * have the crew press delete again on a row that is no longer there.
 */
async function forgetBatch(run) {
  if (!run?.batch_no) return null;
  try {
    return await batchService.forgetRun(run);
  } catch (err) {
    logger.error(`Run ${run.id} deleted, but batch ${run.batch_no} still carries its marks: ${err.message}`);
    return null;
  }
}

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

/**
 * Clears the weighing off a run and puts it back on the scale queue, leaving the
 * run itself standing (the Weigh tab's delete). Not the same act as deleting the
 * run, which also takes the shift off the plant's record.
 */
export const unweigh = asyncHandler(async (req, res) =>
  ok(res, await runService.unweigh(req.params.id), 'Weight cleared'),
);

export const pack = asyncHandler(async (req, res) =>
  ok(res, await runService.pack(req.params.id, req.body), 'Packing recorded'),
);

/**
 * Takes the packing back off a run and the stock back out of the yard, leaving
 * the run itself standing (the Packing tab's delete). Not the same act as
 * deleting the run, which also takes the shift off the plant's record.
 */
export const unpack = asyncHandler(async (req, res) =>
  ok(res, await runService.unpack(req.params.id), 'Packing removed'),
);

/** Corrects a run already on record (the back office's History tab). */
export const update = asyncHandler(async (req, res) =>
  ok(res, await runService.edit(req.params.id, req.body), 'Run updated'),
);

/** Discards a run started by mistake - nothing is logged against the machine. */
export const cancel = asyncHandler(async (req, res) =>
  ok(res, await runService.cancel(req.params.id), 'Run cancelled'),
);

/**
 * Removes a logged run from the record for good (the History tab's delete).
 *
 * The run is read before it is discarded because deleting it is not the whole
 * of the act: what it told its batch has to be taken back afterwards, and by
 * then the row it would have been read off is gone. The read is the same one
 * discard() does, so a run that is not there still 404s here and nothing is
 * touched.
 */
export const remove = asyncHandler(async (req, res) => {
  const run = await runService.findById(req.params.id);
  const removed = await runService.discard(req.params.id);
  return ok(res, { ...removed, batch_cleared: await forgetBatch(run) }, 'Run deleted');
});

export const pause = asyncHandler(async (req, res) =>
  ok(res, await runService.pause(req.params.id, req.body.paused !== false), 'Run updated'),
);

export const sync = asyncHandler(async (req, res) =>
  ok(res, await runService.upsertMany(req.body.rows), 'Runs synced'),
);
