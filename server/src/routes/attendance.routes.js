import { Router } from 'express';
import * as attendance from '../controllers/attendance.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize, shiftReview } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { shiftQuery, assignBody, claimBody } from '../validations/attendance.validation.js';
import { SIGNER_ROLES } from '../config/constants.js';

/**
 * The labour board: who came through the gate, and where they were put.
 *
 * Read by the floor as well as the office. The crew is paid an incentive on
 * figures built out of a crew count, and who was counted is not a secret from
 * the people being counted.
 *
 * Written by the supervisor and up. Deploying labour is the supervisor's job on
 * a shift and a worker holding the same tablet must not be able to move
 * somebody off a machine - so the writes take SIGNER_ROLES, which is the same
 * list that signs a shift off.
 *
 * The way in for the reader itself is not here. It has no account and no
 * session, so it posts through /sync behind a shared secret - see sync.routes.
 */
const router = Router();

router.use(authenticate);

router.get('/shift', shiftReview, validate({ query: shiftQuery }), attendance.forShift);

router.post(
  '/assign',
  authorize(...SIGNER_ROLES),
  validate({ body: assignBody }),
  attendance.assign,
);

/**
 * A punch the roster has never seen, claimed as one of ours.
 *
 * The gate meets a new hand before this app does, every time. Making that a trip
 * to the back office means in practice the shift is worked and never recorded,
 * so the supervisor can name them from the board and the roster grows out of the
 * punches that actually happen.
 */
router.post('/claim', authorize(...SIGNER_ROLES), validate({ body: claimBody }), attendance.claim);

export default router;
