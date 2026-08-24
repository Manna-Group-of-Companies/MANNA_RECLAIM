import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/ApiResponse.js';
import { operatorService } from '../services/operator.service.js';

/** The seven stations an operator is put on. A fixed list, not a table. */
export const stations = asyncHandler(async (_req, res) =>
  ok(res, operatorService.stations()),
);

export const list = asyncHandler(async (req, res) =>
  ok(res, await operatorService.list({ includeInactive: req.query.includeInactive === 'true' })),
);

export const create = asyncHandler(async (req, res) =>
  created(res, await operatorService.create(req.body), 'Operator added'),
);

export const update = asyncHandler(async (req, res) =>
  ok(res, await operatorService.update(req.params.id, req.body), 'Operator updated'),
);

/** Who was on each station for one shift - every station, named or not. */
export const forShift = asyncHandler(async (req, res) =>
  ok(res, await operatorService.forShift(req.query)),
);

/**
 * Put somebody on a station for a shift, or take them off it.
 *
 * The assigner is the signed-in account rather than anything in the body: who
 * put a name against a shift is a fact about who was holding the tablet.
 */
export const assign = asyncHandler(async (req, res) =>
  ok(
    res,
    await operatorService.assign({ ...req.body, assignedBy: req.user?.name ?? null }),
    req.body.operatorId ? 'Operator assigned' : 'Station cleared',
  ),
);

/** Every shift an operator was on, over a window - the incentive's question. */
export const shiftsFor = asyncHandler(async (req, res) =>
  ok(res, await operatorService.shiftsFor(req.query)),
);
