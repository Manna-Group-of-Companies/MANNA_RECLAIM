import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { batchService } from '../services/batch.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await batchService.list(req.query, {
    status: req.query.status,
    machine_id: req.query.machineId,
    /** `special` or `coarse` - unset returns both. */
    line: req.query.line,
  })),
);

export const listOpen = asyncHandler(async (req, res) =>
  paginated(res, await batchService.listOpen(req.query)),
);

/** The batch detail view: the charge, the grades, the conversions, every run. */
export const getOne = asyncHandler(async (req, res) =>
  ok(res, await batchService.detail(req.params.id)),
);

export const create = asyncHandler(async (req, res) =>
  created(
    res,
    await batchService.create({ ...req.body, openedBy: req.body.opened_by ?? req.user?.name }),
    'Batch opened',
  ),
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await batchService.update(req.params.id, req.body), 'Batch updated'),
);

export const close = asyncHandler(async (req, res) =>
  ok(res, await batchService.close(req.params.id, {
    closedBy: req.user?.name,
    remarks: req.body?.remarks,
  }), 'Batch closed'),
);

export const reopen = asyncHandler(async (req, res) =>
  ok(res, await batchService.reopen(req.params.id), 'Batch reopened'),
);

/** Ticking a grade the batch will yield, or taking one back off. */
export const setQuality = asyncHandler(async (req, res) => {
  const { quality, marked } = req.body;
  const batch = await batchService.setQuality(req.params.id, quality, marked);
  return ok(res, batch, `${quality} ${marked ? 'marked' : 'unmarked'}`);
});

/** Deletes an orphaned batch, and the quality tests filed against its number. */
export const remove = asyncHandler(async (req, res) =>
  ok(res, await batchService.remove(req.params.id), 'Batch deleted'),
);
