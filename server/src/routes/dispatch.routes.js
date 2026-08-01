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
 * `GET /` is what left lately, newest first, and `GET /customers/:id/dispatches`
 * is still what a given customer has bought - two different questions. The
 * second is the back office's; the first is the yard's, and exists because
 * somebody who has just posted a document has to be able to see that it landed.
 * Without it the way to check is to post it again.
 *
 * Posting one is the supervisor's - see DISPATCH_ROLES. The vehicle is loaded at
 * the yard, and the person watching the sacks go onto it is the person who
 * should be recording what left. Reading one back is the same set: a document
 * you were allowed to write is not one to be refused sight of afterwards.
 */
const router = Router();

router.use(authenticate, authorize(...DISPATCH_ROLES));

router.get('/', validate({ query: listQuery }), dispatch.list);
router.post('/', validate({ body: createDispatchSchema }), dispatch.create);
router.get('/:id', validate({ params: idParam }), dispatch.getOne);

export default router;
