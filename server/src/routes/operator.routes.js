import { Router } from 'express';
import * as operators from '../controllers/operator.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly, authorize, shiftReview } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, dateRange } from '../validations/common.validation.js';
import { SIGNER_ROLES } from '../config/constants.js';
import {
  assignSchema,
  operatorEditSchema,
  operatorSchema,
  rosterQuery,
} from '../validations/operator.validation.js';

const router = Router();

router.use(authenticate);

/**
 * Who operates the lines, and who was on which one for a given shift.
 *
 * Reading is wide - the floor picks from this list every shift, and the
 * efficiency cards name whoever was responsible, so anyone who can read a shift
 * can read the roster.
 *
 * Keeping the list is the back office's. It is the plant's roll of who works
 * here: an operator added on a tablet mid-shift, misspelt, becomes a second
 * person that an incentive total then pays separately, and that is exactly the
 * failure the list exists to prevent.
 *
 * Assigning is the supervisor's, because it is a fact about the shift they are
 * running and they are the one standing there when somebody swaps.
 */
router.get('/stations', shiftReview, operators.stations);
router.get('/', shiftReview, operators.list);
router.get('/roster', shiftReview, validate({ query: rosterQuery }), operators.forShift);
router.get('/shifts', shiftReview, validate({ query: dateRange }), operators.shiftsFor);

router.post('/', adminOnly, validate({ body: operatorSchema }), operators.create);
router.patch(
  '/:id',
  adminOnly,
  validate({ params: idParam, body: operatorEditSchema }),
  operators.update,
);

router.post(
  '/roster',
  authorize(...SIGNER_ROLES),
  validate({ body: assignSchema }),
  operators.assign,
);

export default router;
