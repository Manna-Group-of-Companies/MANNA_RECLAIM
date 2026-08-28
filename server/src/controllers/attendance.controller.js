import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/ApiResponse.js';
import { attendanceService } from '../services/attendance.service.js';

/**
 * The gate, and the board the supervisor deploys off it.
 *
 * `receive` is the only one of these opened by a token rather than an account -
 * it is the plant-side script posting what the reader holds. Everything else is
 * an ordinary signed-in route, and the split is the same one the SAP feeds use.
 */
export const receive = asyncHandler(async (req, res) =>
  created(res, await attendanceService.receive(req.body), 'Punches received'),
);

export const forShift = asyncHandler(async (req, res) =>
  ok(res, await attendanceService.forShift(req.query)),
);

export const assign = asyncHandler(async (req, res) =>
  ok(
    res,
    await attendanceService.assign({ ...req.body, by: req.body.by ?? req.user?.name }),
    req.body.station ? 'Assigned' : 'Taken off the station',
  ),
);

export const claim = asyncHandler(async (req, res) =>
  created(
    res,
    await attendanceService.claim({ ...req.body, by: req.body.by ?? req.user?.name }),
    'Added to the floor roster',
  ),
);
