import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/ApiResponse.js';
import { reportService } from '../services/report.service.js';

export const production = asyncHandler(async (req, res) =>
  ok(res, await reportService.production(req.query)),
);

export const efficiency = asyncHandler(async (req, res) =>
  ok(res, await reportService.efficiency(req.query)),
);

export const costing = asyncHandler(async (req, res) =>
  ok(res, await reportService.costing(req.query)),
);

/** Everything the admin dashboard needs in one round trip. */
export const dashboard = asyncHandler(async (req, res) => {
  const [production, efficiencyRows, costing] = await Promise.all([
    reportService.production(req.query),
    reportService.efficiency(req.query),
    reportService.costing(req.query),
  ]);
  return ok(res, { production, efficiency: efficiencyRows, costing });
});
