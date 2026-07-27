import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { batchService } from '../services/batch.service.js';
import { qualityService } from '../services/quality.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await batchService.list(req.query, {
    status: req.query.status,
    machine_id: req.query.machineId,
  })),
);

export const listOpen = asyncHandler(async (req, res) =>
  paginated(res, await batchService.listOpen(req.query)),
);

export const getOne = asyncHandler(async (req, res) => {
  const batch = await batchService.findById(req.params.id);
  const { rows: tests } = await qualityService.listForBatch(req.params.id, { limit: 100 });
  return ok(res, { ...batch, qualityTests: tests });
});

export const create = asyncHandler(async (req, res) =>
  created(res, await batchService.create(req.body), 'Batch opened'),
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
