import { Router } from 'express';
import * as customers from '../controllers/customer.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly, authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  customerQuery,
  createCustomerSchema,
  updateCustomerSchema,
} from '../validations/customer.validation.js';
import { DISPATCH_ROLES } from '../config/constants.js';

/**
 * Who the plant sells to, and what has gone out to them.
 *
 * Two halves, and the line between them is what a dispatch actually needs.
 *
 * A supervisor posts dispatches, and a dispatch names a customer and carries a
 * price per line - so the list of names and the rate each last paid have to be
 * reachable from the yard, or the form cannot be filled in. Those two are open
 * to DISPATCH_ROLES.
 *
 * Everything else stays with the back office. What a customer has bought over
 * time is the commercial record rather than a thing needed to load a vehicle,
 * and editing the customer file is not the gate's work either. Both guards are
 * on the route rather than on what a screen chooses to draw - a field left out
 * of a render is still one devtools tab away.
 */
const router = Router();

router.use(authenticate);

const forDispatch = authorize(...DISPATCH_ROLES);

// -- what loading a vehicle needs ------------------------------------------
router.get('/', forDispatch, validate({ query: customerQuery }), customers.list);
router.get('/:id/last-prices', forDispatch, validate({ params: idParam }), customers.lastPrices);

// -- the back office's own ------------------------------------------------
router.post('/', adminOnly, validate({ body: createCustomerSchema }), customers.create);
router.get('/:id', adminOnly, validate({ params: idParam }), customers.getOne);
router.patch(
  '/:id',
  adminOnly,
  validate({ params: idParam, body: updateCustomerSchema }),
  customers.update,
);

router.get(
  '/:id/dispatches',
  adminOnly,
  validate({ params: idParam, query: listQuery }),
  customers.dispatches,
);

export default router;
