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
  created(
    res,
    await maintenanceService.create({ ...req.body, loggedBy: req.user?.name }),
    'Machine marked down',
  ),
);

export const resolve = asyncHandler(async (req, res) =>
  ok(
    res,
    await maintenanceService.resolve(req.params.id, { ...req.body, resolvedBy: req.user?.name }),
    'Back online',
  ),
);

/** Undoes a breakdown reported by mistake - nothing is kept. */
export const remove = asyncHandler(async (req, res) =>
  ok(res, await maintenanceService.remove(req.params.id), 'Breakdown cancelled'),
);

export const listBearings = asyncHandler(async (req, res) =>
  paginated(res, await maintenanceService.bearings.list(req.query, { machine_id: req.query.machineId })),
);

export const logBearing = asyncHandler(async (req, res) =>
  created(res, await maintenanceService.logBearings({ ...req.body, byUser: req.user?.name }), 'Temperatures logged'),
);

/** Every machine's greasing spec, and how overdue each one is right now. */
export const bearingsDue = asyncHandler(async (req, res) => {
  const { rows } = await machineService.list({ limit: 200 });
  return ok(res, await maintenanceService.dueList(rows));
});
