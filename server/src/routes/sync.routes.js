import { Router } from 'express';
import * as sapStock from '../controllers/sapStock.controller.js';
import { machineToken } from '../middlewares/machineAuth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { sapStockSnapshot } from '../validations/sapStock.validation.js';

/**
 * The way in for machines rather than people.
 *
 * Its own prefix and its own gate, deliberately kept apart from everything the
 * tablets and the back office use. Every other route on this API is opened by a
 * signed-in account with a role behind it; this one is opened by a shared
 * secret held by a scheduled script on the plant server - see
 * machineAuth.middleware and SAP_SYNC_TOKEN.
 *
 * Two guards would be a mistake here rather than a belt and braces. Mounting
 * this under /stock would put it behind `authenticate`, which would refuse a
 * script that has no session, and the fix would have been an exception carved
 * into the middleware that every future route under /stock would inherit. A
 * separate prefix means the exception is the whole file.
 *
 * Nothing here reads. What the app shows off the back of this is GET
 * /stock/sap, behind the ordinary account guard with the rest of the yard.
 */
const router = Router();

router.post(
  '/sap-stock',
  machineToken,
  validate({ body: sapStockSnapshot }),
  sapStock.receive,
);

export default router;
