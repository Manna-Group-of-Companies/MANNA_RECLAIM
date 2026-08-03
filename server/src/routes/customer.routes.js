import { Router } from 'express';
import * as customers from '../controllers/customer.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly, authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import { DISPATCH_ROLES } from '../config/constants.js';
import {
  customerQuery,
  createCustomerSchema,
  updateCustomerSchema,
} from '../validations/customer.validation.js';

/**
 * Who the plant sells to, and what has gone out to them.
 *
 * Split in two, and the line between the halves is "what a dispatch form needs"
 * against "what the back office owns".
 *
 * The yard raises its own dispatch notes now - see DISPATCH_ROLES - and a
 * dispatch names the customer it goes to, so whoever posts one has to be able
 * to read the list and the last price that customer paid. Those two reads are
 * therefore open to a dispatcher. This is a real widening: the list is
 * commercial information and it is now on the shop floor, which the plant has
 * decided is the price of the yard raising its own paperwork.
 *
 * Everything else stays the office's. Reading a customer in order to send them
 * goods is not the same as being able to add one, rename one, or read back
 * everything they have ever bought - that last is the customer's whole trading
 * history, which is a different question from "who is this lorry going to".
 *
 * The gate is on the route rather than on what a screen chooses to draw: a
 * field left out of a render is still one devtools tab away.
 */
const router = Router();

router.use(authenticate);

/** The two reads a dispatch form cannot be filled in without. */
const forDispatch = authorize(...DISPATCH_ROLES);

router.get('/', forDispatch, validate({ query: customerQuery }), customers.list);
router.get('/:id/last-prices', forDispatch, validate({ params: idParam }), customers.lastPrices);

router.post('/', adminOnly, validate({ body: createCustomerSchema }), customers.create);
router.get('/:id', adminOnly, validate({ params: idParam }), customers.getOne);
router.patch(
  '/:id',
  adminOnly,
  validate({ params: idParam, body: updateCustomerSchema }),
  customers.update,
);

/**
 * What this customer has bought, newest first - their whole trading history,
 * priced. The back office's, and it stays there even though the yard can now
 * dispatch to them: "who is this lorry going to" and "what has this account
 * bought from us all year, and at what" are different questions, and only the
 * first is needed to load a vehicle.
 */
router.get(
  '/:id/dispatches',
  adminOnly,
  validate({ params: idParam, query: listQuery }),
  customers.dispatches,
);

export default router;
