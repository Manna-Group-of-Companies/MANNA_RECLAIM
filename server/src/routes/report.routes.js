import { Router } from 'express';
import * as reports from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { dateRange } from '../validations/common.validation.js';
import {
  efficiencyNoteSchema,
  shiftQuery,
  varianceReasonEditSchema,
  varianceReasonSchema,
} from '../validations/report.validation.js';

const router = Router();

router.use(authenticate);

router.get('/production', validate({ query: dateRange }), reports.production);
router.get('/efficiency', validate({ query: dateRange }), reports.efficiency);
router.get('/filters', reports.filters);

// the back office's own views
router.get('/downtime', adminOnly, reports.downtime);
router.get('/downtime/detail', adminOnly, reports.downtimeDetail);
router.get('/shifts', adminOnly, reports.shiftOptions);
router.get('/shift-efficiency', adminOnly, validate({ query: shiftQuery }), reports.shiftEfficiency);
router.post(
  '/efficiency-notes',
  adminOnly,
  validate({ body: efficiencyNoteSchema }),
  reports.addEfficiencyNote,
);
/**
 * Why an actual missed its ideal. A shift's own reasons come back with it on
 * /shift-efficiency; the GET here is the review across a window of days, which
 * is what the record is kept for. Written and corrected by the back office only
 * - the benchmark is the manager's and so is the answer for missing it.
 *
 * The PATCH takes the wording and nothing else. What a reason is *about* - the
 * day, the shift, the parameter, the two figures - is the record itself.
 */
router.get('/variance-reasons', adminOnly, validate({ query: dateRange }), reports.varianceReasons);
router.post(
  '/variance-reasons',
  adminOnly,
  validate({ body: varianceReasonSchema }),
  reports.addVarianceReason,
);
router.patch(
  '/variance-reasons/:id',
  adminOnly,
  validate({ body: varianceReasonEditSchema }),
  reports.updateVarianceReason,
);
// The machine log as a spreadsheet. Admin only for the same reason /costing is:
// it carries every run the plant has ever logged, with what each cost.
router.get('/machine-log.csv', adminOnly, validate({ query: dateRange }), reports.machineLog);
router.get('/costing', adminOnly, validate({ query: dateRange }), reports.costing);
router.get('/dashboard', adminOnly, validate({ query: dateRange }), reports.dashboard);

export default router;
