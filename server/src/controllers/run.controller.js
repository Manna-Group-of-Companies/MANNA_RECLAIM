import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { runService } from '../services/run.service.js';

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

export const stop = asyncHandler(async (req, res) =>
  ok(res, await runService.stop(req.params.id, req.body), 'Run stopped'),
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
