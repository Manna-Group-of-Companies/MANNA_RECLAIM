import { Router } from 'express';
import * as runs from '../controllers/run.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  startRunSchema,
  stopRunSchema,
  updateRunSchema,
  weighRunSchema,
  packRunSchema,
  pauseRunSchema,
  syncRunsSchema,
} from '../validations/run.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuery }), runs.list);
router.get('/active', runs.active);
router.get('/pending-weigh', runs.pendingWeigh);
router.get('/weighed', runs.weighed);
router.get('/pending-pack', runs.pendingPack);
router.get('/shift', runs.byShift);
router.get('/:id', validate({ params: idParam }), runs.getOne);
router.post('/start', validate({ body: startRunSchema }), runs.start);
// Correcting a logged run, and taking one off the record altogether.
//
// Both rewrite the plant's record - the reports and the costing are added up
// off these rows - and both were the back office's alone to begin with. They
// are open to anyone signed in because the crews find their own mistakes first
// and were waiting on the office to put them right. What guards them now is
// the History tab: a correction shows what it will save before it saves it,
// and a delete has to be confirmed against the run it names.
router.patch('/:id', validate({ params: idParam, body: updateRunSchema }), runs.update);
router.delete('/:id', validate({ params: idParam }), runs.remove);
router.post('/:id/stop', validate({ params: idParam, body: stopRunSchema }), runs.stop);
router.post('/:id/weigh', validate({ params: idParam, body: weighRunSchema }), runs.weigh);
router.post('/:id/pack', validate({ params: idParam, body: packRunSchema }), runs.pack);
router.post('/:id/pause', validate({ params: idParam, body: pauseRunSchema }), runs.pause);
router.post('/:id/cancel', validate({ params: idParam }), runs.cancel);
router.post('/sync', validate({ body: syncRunsSchema }), runs.sync);

export default router;
