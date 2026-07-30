import { Router } from 'express';
import * as quality from '../controllers/quality.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly, authorize } from '../middlewares/role.middleware.js';
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
router.get('/summary', validate({ query: dateRange }), quality.summary);
router.post('/', authorize(...QUALITY_WRITE_ROLES), validate({ body: qualityTestSchema }), quality.record);
router.post(
  '/:id/report',
  authorize(...QUALITY_WRITE_ROLES),
  validate({ params: idParam, body: qualityReportSchema }),
  quality.attachReport,
);
router.delete('/:id', adminOnly, validate({ params: idParam }), quality.remove);

export default router;
