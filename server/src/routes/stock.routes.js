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

/**
 * The coarse pools and their three sample points.
 *
 * The lab is on this one and on no other stock route. Coarse is not
 * batch-identified, so there is no lot for the bench to test - what it tests is
 * the period, sampled three times - and it cannot do that without being able to
 * see which periods exist and which slots are still empty. The response carries
 * stock and readings and nothing commercial, which is what makes that safe.
 */
const forSampling = authorize(ROLES.LAB, ROLES.SUPERVISOR, ROLES.WORKER, ...ADMIN_ROLES);

router.get('/pools', forSampling, validate({ query: stockQuery }), stock.pools);

/**
 * What the presses have made, and where each product and pack stands with the
 * lab.
 *
 * The lab is on this one for the same reason it is on /pools, and it is the
 * same kind of response: stock and verdicts, with no price, no customer and no
 * packed-against-dispatched split. What makes it necessary rather than merely
 * convenient is that a moulded group cannot be reached from the bench any other
 * way - a batch is found through the batch card and a pool through the route
 * above, and a group keyed on a product and a pack appears on neither. Boxed
 * pieces open `pending` and post_dispatch() refuses anything that is not
 * `pass`, so without this the goods are unsellable and no screen can say why.
 */
router.get('/moulded', forSampling, validate({ query: stockQuery }), stock.moulded);

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
