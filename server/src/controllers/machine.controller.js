import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { machineService } from '../services/machine.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await machineService.list(req.query, {
    kind: req.query.kind,
    enabled: req.query.enabled,
  })),
);

export const grouped = asyncHandler(async (req, res) =>
  ok(res, await machineService.listByGroup(req.query)),
);

export const getOne = asyncHandler(async (req, res) =>
  ok(res, await machineService.findById(req.params.id)),
);

export const create = asyncHandler(async (req, res) =>
  created(res, await machineService.create(req.body), 'Machine added'),
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await machineService.update(req.params.id, req.body), 'Machine updated'),
);

export const toggle = asyncHandler(async (req, res) =>
  ok(res, await machineService.setEnabled(req.params.id, req.body.enabled), 'Machine updated'),
);
