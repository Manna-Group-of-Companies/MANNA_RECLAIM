import { Router } from 'express';
import * as dispatch from '../controllers/dispatch.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  createDispatchSchema,
  updateDispatchSchema,
  addLoadSchema,
} from '../validations/dispatch.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuery }), dispatch.list);
router.get('/:id', validate({ params: idParam }), dispatch.getOne);
router.post('/', validate({ body: createDispatchSchema }), dispatch.create);
router.patch('/:id', validate({ params: idParam, body: updateDispatchSchema }), dispatch.update);
router.post('/:id/loads', validate({ params: idParam, body: addLoadSchema }), dispatch.addLoad);
router.delete('/:id/loads/:loadId', dispatch.removeLoad);
router.delete('/:id', adminOnly, validate({ params: idParam }), dispatch.remove);

export default router;
