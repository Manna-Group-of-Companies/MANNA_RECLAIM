import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/ApiResponse.js';
import { maintenanceService } from '../services/maintenance.service.js';
import { machineService } from '../services/machine.service.js';

export const list = asyncHandler(async (req, res) =>
  paginated(res, await maintenanceService.list(req.query, {
    machine_id: req.query.machineId,
    status: req.query.status,
  })),
);

export const create = asyncHandler(async (req, res) =>
  created(res, await maintenanceService.create({ ...req.body, logged_by: req.user?.name }), 'Logged'),
);

export const resolve = asyncHandler(async (req, res) =>
  ok(res, await maintenanceService.resolve(req.params.id, {
    resolvedBy: req.user?.name,
    remarks: req.body?.remarks,
  }), 'Closed'),
);

export const listBearings = asyncHandler(async (req, res) =>
  paginated(res, await maintenanceService.bearings.list(req.query, { machine_id: req.query.machineId })),
);

export const logBearing = asyncHandler(async (req, res) =>
  created(res, await maintenanceService.logBearing({ ...req.body, byUser: req.user?.name }), 'Greasing logged'),
);

export const bearingsDue = asyncHandler(async (req, res) => {
  const { rows } = await machineService.list({ limit: 200 });
  return ok(res, await maintenanceService.dueList(rows));
});
