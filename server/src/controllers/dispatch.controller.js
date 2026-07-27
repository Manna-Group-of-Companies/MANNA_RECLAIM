import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { dispatchService } from '../services/dispatch.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await dispatchService.list(req.query, {
    customer: req.query.customer,
    grade: req.query.grade,
    status: req.query.status,
  })),
);

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await dispatchService.detail(req.params.id)),
);

export const create = asyncHandler(async (req, res) =>
  created(res, await dispatchService.create({ ...req.body, created_by: req.user?.name }), 'Dispatch created'),
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await dispatchService.update(req.params.id, req.body), 'Dispatch updated'),
);

export const addLoad = asyncHandler(async (req, res) =>
  created(res, await dispatchService.addLoad(req.params.id, req.body), 'Load added'),
);

export const removeLoad = asyncHandler(async (req, res) =>
  ok(res, await dispatchService.removeLoad(req.params.loadId), 'Load removed'),
);

export const remove = asyncHandler(async (req, res) =>
  ok(res, await dispatchService.remove(req.params.id), 'Dispatch removed'),
);
