import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import { createProductSchema, updateProductSchema } from '../validations/product.validation.js';

const router = Router();

router.use(authenticate);

// The shop floor reads the list to start a press; the settings on it are the
// back office's to keep, the same way the machine list is.
router.get('/', validate({ query: listQuery }), products.list);
router.get('/:id', validate({ params: idParam }), products.getOne);

router.post('/', adminOnly, validate({ body: createProductSchema }), products.create);
router.patch('/:id', adminOnly, validate({ params: idParam, body: updateProductSchema }), products.update);
router.delete('/:id', adminOnly, validate({ params: idParam }), products.retire);

export default router;
