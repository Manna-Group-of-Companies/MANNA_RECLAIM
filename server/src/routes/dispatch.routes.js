import { Router } from 'express';
import * as dispatch from '../controllers/dispatch.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../validations/common.validation.js';
import { createDispatchSchema } from '../validations/dispatch.validation.js';

/**
 * Dispatches are written once and never edited.
 *
 * There is no PATCH and no DELETE here on purpose. A load that went out wrong is
 * corrected by a reversal document and a fresh dispatch, so the ledger says what
 * happened rather than what someone last thought had happened - and the stock
 * behind it stays something that only ever moved forward, which is the whole
 * reason the draw-down can be trusted.
 *
 * The list of what went out is read from the customer it went to -
 * GET /customers/:id/dispatches - because that is the only question anyone asks
 * of it. There is no standalone dispatch ledger.
 */
const router = Router();

router.use(authenticate, adminOnly);

router.post('/', validate({ body: createDispatchSchema }), dispatch.create);
router.get('/:id', validate({ params: idParam }), dispatch.getOne);

export default router;
