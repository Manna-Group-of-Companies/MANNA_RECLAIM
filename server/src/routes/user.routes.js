import { Router } from 'express';
import * as users from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import { registerSchema, pinSchema } from '../validations/auth.validation.js';

const router = Router();

router.use(authenticate, adminOnly);

router.get('/', validate({ query: listQuery }), users.list);
router.post('/', validate({ body: registerSchema }), users.create);
router.get('/:id', validate({ params: idParam }), users.getOne);
router.patch('/:id', validate({ params: idParam }), users.update);
router.patch('/:id/pin', validate({ params: idParam, body: pinSchema }), users.resetPin);
router.delete('/:id', validate({ params: idParam }), users.remove);

export default router;
