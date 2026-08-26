import { Router } from 'express';
import * as reports from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  adminOnly,
  authorize,
  shiftReview,
  summaryOnly,
} from '../middlewares/role.middleware.js';
import { SIGNER_ROLES } from '../config/constants.js';
import { validate } from '../middlewares/validate.middleware.js';
import { dateRange } from '../validations/common.validation.js';
import {
  efficiencyNoteSchema,
  shiftQuery,
  varianceApprovalSchema,
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

/**
 * The three the managing director's screen is built from, and the only routes
 * that role reaches: which shifts exist to pick from, one shift measured against
 * the manager's ideals, and the plant overview. All three are GETs that compute
 * and return; none of them writes.
 */
router.get('/shifts', shiftReview, reports.shiftOptions);
router.get(
  '/shift-efficiency',
  shiftReview,
  validate({ query: shiftQuery }),
  reports.shiftEfficiency,
);
router.post(
  '/efficiency-notes',
  adminOnly,
  validate({ body: efficiencyNoteSchema }),
  reports.addEfficiencyNote,
);
/**
 * Why an actual missed its ideal - written by the shift, signed off by the
 * office.
 *
 * The POST moved to the supervisor, which is where it should have been: the
 * person who can say why a belt was slipping is the person who was standing
 * next to it, and a manager writing that sentence two days later is writing
 * down what somebody told them on the phone. Workers are not on this list -
 * a shift is answered for by whoever signed it.
 *
 * The approval is the other half and is the office's alone. The plant pays an
 * incentive on these figures, so a reason is not merely an explanation - it is
 * a request to discount a miss, and a request that grants itself is not a
 * control. There is no un-approve: a sign-off that can be quietly withdrawn is
 * not a sign-off, and one given in error is corrected by the note beside it.
 *
 * The GET is wider than either, because the supervisor has to be able to read
 * back what they wrote and whether it was accepted.
 *
 * The PATCH takes the wording and nothing else. What a reason is *about* - the
 * day, the shift, the parameter, the two figures - is the record itself.
 */
/**
 * The state of the rule, for the three people it is a rule for: the shift sees
 * what it still owes, the office sees what is waiting on it, and the managing
 * director sees whether the process is running at all.
 */
router.get(
  '/variance-status',
  shiftReview,
  validate({ query: dateRange }),
  reports.varianceStatus,
);

/**
 * The same figures the shift view holds against a benchmark, followed across a
 * window instead of read one shift at a time.
 *
 * Open to the floor as well as the office, like the shift view and for the same
 * reason: the plant pays an incentive on these figures, and a crew entitled to
 * see last night's is entitled to see whether last night was a bad night or a
 * bad fortnight.
 */
router.get(
  '/efficiency-trend',
  shiftReview,
  validate({ query: dateRange }),
  reports.efficiencyTrend,
);

/**
 * The same figures gathered by batch instead of by shift.
 *
 * Open to whoever may see the shift view, and for the same reason: this is the
 * plant's own production read back to it, and a crew that may see what last
 * night made may see what the batch they worked made.
 */
router.get(
  '/batch-efficiency',
  shiftReview,
  validate({ query: dateRange }),
  reports.batchEfficiency,
);
router.get(
  '/variance-reasons',
  shiftReview,
  validate({ query: dateRange }),
  reports.varianceReasons,
);
router.post(
  '/variance-reasons',
  authorize(...SIGNER_ROLES),
  validate({ body: varianceReasonSchema }),
  reports.addVarianceReason,
);
router.post(
  '/variance-reasons/:id/approve',
  adminOnly,
  validate({ body: varianceApprovalSchema }),
  reports.approveVarianceReason,
);
router.patch(
  '/variance-reasons/:id',
  authorize(...SIGNER_ROLES),
  validate({ body: varianceReasonEditSchema }),
  reports.updateVarianceReason,
);
// The machine log as a spreadsheet. Admin only for the same reason /costing is:
// it carries every run the plant has ever logged, with what each cost.
router.get('/machine-log.csv', adminOnly, validate({ query: dateRange }), reports.machineLog);
router.get('/costing', adminOnly, validate({ query: dateRange }), reports.costing);
router.get('/dashboard', summaryOnly, validate({ query: dateRange }), reports.dashboard);

export default router;
