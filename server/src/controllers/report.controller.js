import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/ApiResponse.js';
import { reportService } from '../services/report.service.js';
import { efficiencyService } from '../services/efficiency.service.js';

/** Which days, shifts and machines the run history covers. */
export const filters = asyncHandler(async (_req, res) => ok(res, await reportService.runFilters()));

export const downtime = asyncHandler(async (req, res) =>
  ok(res, await reportService.downtime(req.query)),
);

export const downtimeDetail = asyncHandler(async (req, res) =>
  ok(res, await reportService.downtimeDetail(req.query)),
);

/** Which shifts can be analysed - fills the Efficiency tab's day picker. */
export const shiftOptions = asyncHandler(async (_req, res) =>
  ok(res, await efficiencyService.shiftOptions()),
);

/**
 * One shift measured against the plant's own medians. Computed server-side:
 * the baselines need every run ever logged, which is not something to hand to
 * a browser on the shop floor's connection.
 */
export const shiftEfficiency = asyncHandler(async (req, res) => {
  const [analysis, notes] = await Promise.all([
    efficiencyService.forShift(req.query),
    efficiencyService.listNotes(req.query),
  ]);
  return ok(res, { ...analysis, notes });
});

export const addEfficiencyNote = asyncHandler(async (req, res) =>
  created(
    res,
    await efficiencyService.addNote({ ...req.body, enteredBy: req.body.enteredBy ?? req.user?.name }),
    'Reason recorded',
  ),
);

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
