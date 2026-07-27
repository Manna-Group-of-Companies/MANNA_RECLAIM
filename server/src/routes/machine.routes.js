import { Router } from 'express';
import * as machines from '../controllers/machine.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuery }), machines.list);
router.get('/grouped', machines.grouped);
router.get('/:id', validate({ params: idParam }), machines.getOne);

// admin side only
router.post('/', adminOnly, machines.create);
router.patch('/:id', adminOnly, validate({ params: idParam }), machines.update);
router.patch('/:id/enabled', adminOnly, validate({ params: idParam }), machines.toggle);

export default router;
