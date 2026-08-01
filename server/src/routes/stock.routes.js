import { Router } from 'express';
import * as stock from '../controllers/stock.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../validations/common.validation.js';
import { stockQuery, qcStatusSchema } from '../validations/stock.validation.js';
import { ROLES, ADMIN_ROLES } from '../config/constants.js';

/**
 * The yard, from two sides.
 *
 * `/stock` is the back office's: every group with what was packed into it, what
 * has already gone out, and what is left. `/stock/summary` is the shop floor's:
 * the label, the grade, what is there and whether the lab passed it, and
 * nothing else at all.
 *
 * The summary route is listed first because Express matches in order and
 * `/:id` would otherwise swallow it - and a supervisor reaching `/stock/:id`
 * would then be reading the manager's row.
 */
const router = Router();

router.use(authenticate);

const managerOnly = authorize(...ADMIN_ROLES);
const floor = authorize(ROLES.SUPERVISOR, ROLES.WORKER, ...ADMIN_ROLES);

router.get('/summary', floor, validate({ query: stockQuery }), stock.summary);

router.get('/', managerOnly, validate({ query: stockQuery }), stock.list);
router.get('/:id', managerOnly, validate({ params: idParam }), stock.getOne);

/**
 * The lab's verdict, and the only door between packed stock and a vehicle:
 * post_dispatch() refuses any line whose group is not `pass`. Kept on the back
 * office's side of the wall because it is what releases goods for sale.
 */
router.patch(
  '/:id/qc',
  managerOnly,
  validate({ params: idParam, body: qcStatusSchema }),
  stock.setQc,
);

export default router;
