import { Router } from 'express';
import * as runs from '../controllers/run.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly, strictAdminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam, listQuery } from '../validations/common.validation.js';
import {
  startRunSchema,
  stopRunSchema,
  updateRunSchema,
  weighRunSchema,
  tallyRunSchema,
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
router.get('/packed', runs.packed);
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
/*
 * Clearing that weighing, and it is the back office's - the same wall the unpack
 * below sits behind, for the same reason.
 *
 * The floor corrects its own scale all day: weigh() takes an absolute figure, so
 * putting a mistyped weight right is the same call as recording it, and nothing
 * here is taken away from the crew. This is the case a correction cannot reach -
 * a weight against a run that was never on the scale - and it puts the row back
 * to owing one, which moves it between two tabs rather than editing a number on
 * one. There is no undo for it from any screen, which is why it is gated by
 * DELETE_ROLES rather than by adminOnly - the admin account alone, where a
 * manager keeps every write they can take back by making it again.
 * Refused outright once anything has been packed off that weight.
 */
router.delete('/:id/weigh', strictAdminOnly, validate({ params: idParam }), runs.unweigh);
router.post('/:id/tally', validate({ params: idParam, body: tallyRunSchema }), runs.tally);
router.post('/:id/pack', validate({ params: idParam, body: packRunSchema }), runs.pack);
/*
 * Undoing that packing, and it is the back office's alone.
 *
 * The floor may pack and re-pack all day - the figure is absolute and a
 * correction is the same call - so nothing here is taken away from the crew.
 * What this does is different in kind: it pulls filed stock back out of the
 * yard and puts the run back on the bench, and it is refused outright once any
 * of that stock has been dispatched. That is the same wall the run delete and
 * the lab-test delete sit behind, for the same reason.
 */
router.delete('/:id/pack', adminOnly, validate({ params: idParam }), runs.unpack);
router.post('/:id/pause', validate({ params: idParam, body: pauseRunSchema }), runs.pause);
router.post('/:id/cancel', validate({ params: idParam }), runs.cancel);
router.post('/sync', validate({ body: syncRunsSchema }), runs.sync);

export default router;
