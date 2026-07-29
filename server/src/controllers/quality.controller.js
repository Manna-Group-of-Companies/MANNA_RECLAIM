import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { qualityService } from '../services/quality.service.js';

// `grade` and `batch_id` are aliases decorate() adds on the way out - a filter
// has to name the stored columns, `quality` and `batch_no`, or it matches
// nothing.
export const list = asyncHandler(async (req, res) =>
  paginated(res, await qualityService.list(req.query, {
    batch_no: req.query.batchNo ?? req.query.batchId,
    quality: req.query.grade,
    verdict: req.query.verdict,
    machine_id: req.query.machineId,
  })),
);

export const record = asyncHandler(async (req, res) =>
  created(res, await qualityService.record({ ...req.body, testedBy: req.body.testedBy ?? req.user?.name }), 'Test recorded'),
);

export const summary = asyncHandler(async (req, res) =>
  ok(res, await qualityService.summary(req.query)),
);

export const remove = asyncHandler(async (req, res) =>
  ok(res, await qualityService.remove(req.params.id), 'Test removed'),
);
