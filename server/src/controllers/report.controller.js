import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/ApiResponse.js';
import { reportService } from '../services/report.service.js';
import { efficiencyService } from '../services/efficiency.service.js';
import { machineLogService } from '../services/machineLog.service.js';

/**
 * The byte-order mark Excel needs to read a CSV as UTF-8.
 *
 * Without it Excel reads the file as the system codepage and mangles anything
 * that is not ASCII - a supervisor's name, a remark written in Malayalam. Every
 * other reader ignores it. Built from its code point rather than written as the
 * character, which is invisible in a diff and in an editor.
 */
const BOM = String.fromCharCode(0xfeff);

/**
 * The machine log as a file, rather than as JSON in an envelope.
 *
 * The only route in this API that does not answer through ApiResponse, and
 * deliberately: what is being asked for is a spreadsheet, and wrapping it in
 * `{ data: "..." }` would leave the browser to unwrap and re-serialise something
 * the server has already got right. The Content-Disposition is what makes it
 * land in Downloads under a name that says which window it covers.
 */
export const machineLog = asyncHandler(async (req, res) => {
  const csv = await machineLogService.csv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${machineLogService.filename(req.query)}"`,
  );
  return res.send(BOM + csv);
});

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
