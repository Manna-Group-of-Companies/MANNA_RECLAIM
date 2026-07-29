import { Router } from 'express';
import * as maint from '../controllers/maintenance.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  createMaintenanceSchema,
  resolveSchema,
  bearingLogSchema,
} from '../validations/maintenance.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuery }), maint.list);
router.post('/', validate({ body: createMaintenanceSchema }), maint.create);
router.post('/:id/resolve', validate({ params: idParam, body: resolveSchema }), maint.resolve);
router.delete('/:id', validate({ params: idParam }), maint.remove);

router.get('/bearings', validate({ query: listQuery }), maint.listBearings);
router.get('/bearings/due', maint.bearingsDue);
router.post('/bearings', validate({ body: bearingLogSchema }), maint.logBearing);

export default router;
