import { Router } from 'express';
import * as batches from '../controllers/batch.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  createBatchSchema,
  updateBatchSchema,
  closeBatchSchema,
} from '../validations/batch.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuery }), batches.list);
router.get('/open', batches.listOpen);
router.get('/:id', validate({ params: idParam }), batches.getOne);
router.post('/', validate({ body: createBatchSchema }), batches.create);
router.patch('/:id', validate({ params: idParam, body: updateBatchSchema }), batches.update);
router.post('/:id/close', validate({ params: idParam, body: closeBatchSchema }), batches.close);
router.post('/:id/reopen', adminOnly, validate({ params: idParam }), batches.reopen);

export default router;
