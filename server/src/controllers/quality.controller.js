import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { qualityService } from '../services/quality.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await qualityService.list(req.query, {
    batch_id: req.query.batchId,
    grade: req.query.grade,
    verdict: req.query.verdict,
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
