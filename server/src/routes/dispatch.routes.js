import { Router } from 'express';
import * as dispatch from '../controllers/dispatch.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import { createDispatchSchema } from '../validations/dispatch.validation.js';
import { DISPATCH_ROLES } from '../config/constants.js';

/**
 * Dispatches are written once and never edited.
 *
 * There is no PATCH and no DELETE here on purpose. A load that went out wrong is
 * corrected by a reversal document and a fresh dispatch, so the ledger says what
 * happened rather than what someone last thought had happened - and the stock
 * behind it stays something that only ever moved forward, which is the whole
 * reason the draw-down can be trusted.
 *
 * The yard and the back office - see DISPATCH_ROLES. The vehicle is loaded at
 * the yard and the supervisor standing at it is the person who knows what went
 * on it, so that is where the document is raised.
 *
 * A dispatch names the customer it is going to and the price it is going at, so
 * everyone reaching this router can read both - there is no way to post one
 * otherwise, and /customers is open to the same list for exactly that reason.
 * What is not here is any way to change what a customer is or what the card
 * says they pay; that stays the office's.
 *
 * `GET /:id` carries the margin, which means it carries what the goods cost to
 * make. That follows the same door as the rest rather than being carved out:
 * the account that typed the selling price is not learning much from the
 * difference, and a detail view that hid half the document would be a second,
 * quieter policy nobody could see from here.
 *
 * `GET /` is what left lately, newest first. It is not a dispatch history
 * screen and there is none: what a given customer has bought is answered off
 * the customer, at `GET /customers/:id/dispatches`, which is the office's. This
 * list exists so whoever has just posted a document can see that it landed -
 * without it the way to check is to post it again - and so a loading job with
 * no labour recorded against it is visible rather than silent.
 */
const router = Router();

router.use(authenticate, authorize(...DISPATCH_ROLES));

router.get('/', validate({ query: listQuery }), dispatch.list);
router.post('/', validate({ body: createDispatchSchema }), dispatch.create);
router.get('/:id', validate({ params: idParam }), dispatch.getOne);

export default router;
