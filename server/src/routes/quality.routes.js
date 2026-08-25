import { Router } from 'express';
import * as quality from '../controllers/quality.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize, strictAdminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery, dateRange } from '../validations/common.validation.js';
import { qualityTestSchema, qualityReportSchema } from '../validations/batch.validation.js';
import { QUALITY_WRITE_ROLES } from '../config/constants.js';

const router = Router();

router.use(authenticate);

// Reads stay open to everyone signed in: Batches and Dispatch both warn on a
// held batch, so the floor has to be able to see the verdict even though it
// cannot write one. Writing a test is the lab's alone - see QUALITY_WRITE_ROLES.
router.get('/', validate({ query: listQuery }), quality.list);
/**
 * The lab record by batch and then by grade.
 *
 * Open to any signed-in account, like the rest of the quality reads: it carries
 * verdicts and measured figures and nothing commercial. The managing director's
 * Quality tab is drawn off this one.
 */
router.get('/by-batch', validate({ query: dateRange }), quality.byBatch);
router.get('/summary', validate({ query: dateRange }), quality.summary);
router.post('/', authorize(...QUALITY_WRITE_ROLES), validate({ body: qualityTestSchema }), quality.record);
router.post(
  '/:id/report',
  authorize(...QUALITY_WRITE_ROLES),
  validate({ params: idParam, body: qualityReportSchema }),
  quality.attachReport,
);
/*
 * Taking a verdict off the record: the admin account's alone.
 *
 * The lab writes here and corrects itself by writing again - tests are
 * append-only and the newest verdict standing is the one the yard reads - so
 * nothing the bench does is touched by this. What this is for is the one edit a
 * re-test cannot make, a verdict filed against the wrong batch or the wrong
 * grade, and it moves stock in the yard on its way out. The manager who wants a
 * pallet released has PATCH /stock/:id/qc, which is reversible; this is not.
 */
router.delete('/:id', strictAdminOnly, validate({ params: idParam }), quality.remove);

export default router;
