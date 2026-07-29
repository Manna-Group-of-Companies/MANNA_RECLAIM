import { Router } from 'express';
import * as quality from '../controllers/quality.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery, dateRange } from '../validations/common.validation.js';
import { qualityTestSchema, qualityReportSchema } from '../validations/batch.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuery }), quality.list);
router.get('/summary', validate({ query: dateRange }), quality.summary);
router.post('/', validate({ body: qualityTestSchema }), quality.record);
router.post(
  '/:id/report',
  validate({ params: idParam, body: qualityReportSchema }),
  quality.attachReport,
);
router.delete('/:id', adminOnly, validate({ params: idParam }), quality.remove);

export default router;
