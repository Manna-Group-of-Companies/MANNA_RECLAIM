import { Router } from 'express';
import * as reports from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { dateRange } from '../validations/common.validation.js';
import { efficiencyNoteSchema, shiftQuery } from '../validations/report.validation.js';

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
// The machine log as a spreadsheet. Admin only for the same reason /costing is:
// it carries every run the plant has ever logged, with what each cost.
router.get('/machine-log.csv', adminOnly, validate({ query: dateRange }), reports.machineLog);
router.get('/costing', adminOnly, validate({ query: dateRange }), reports.costing);
router.get('/dashboard', adminOnly, validate({ query: dateRange }), reports.dashboard);

export default router;
