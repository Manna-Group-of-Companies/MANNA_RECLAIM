import { Router } from 'express';
import * as customers from '../controllers/customer.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  customerQuery,
  createCustomerSchema,
  updateCustomerSchema,
} from '../validations/customer.validation.js';

/**
 * Who the plant sells to, and what has gone out to them.
 *
 * The whole file is behind `adminOnly` - manager and admin - and there is no
 * shop-floor half of it. A supervisor has a stock list and no business knowing
 * who bought any of it, so the guard is on the route rather than on what the
 * screen chooses to draw.
 */
const router = Router();

router.use(authenticate, adminOnly);

router.get('/', validate({ query: customerQuery }), customers.list);
router.post('/', validate({ body: createCustomerSchema }), customers.create);
router.get('/:id', validate({ params: idParam }), customers.getOne);
router.patch('/:id', validate({ params: idParam, body: updateCustomerSchema }), customers.update);

router.get(
  '/:id/dispatches',
  validate({ params: idParam, query: listQuery }),
  customers.dispatches,
);
router.get('/:id/last-prices', validate({ params: idParam }), customers.lastPrices);

export default router;
