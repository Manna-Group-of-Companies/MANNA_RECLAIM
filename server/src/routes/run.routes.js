import { Router } from 'express';
import * as runs from '../controllers/run.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  startRunSchema,
  stopRunSchema,
  pauseRunSchema,
  syncRunsSchema,
} from '../validations/run.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuery }), runs.list);
router.get('/active', runs.active);
router.get('/shift', runs.byShift);
router.get('/:id', validate({ params: idParam }), runs.getOne);
router.post('/start', validate({ body: startRunSchema }), runs.start);
router.post('/:id/stop', validate({ params: idParam, body: stopRunSchema }), runs.stop);
router.post('/:id/pause', validate({ params: idParam, body: pauseRunSchema }), runs.pause);
router.post('/sync', validate({ body: syncRunsSchema }), runs.sync);

export default router;
