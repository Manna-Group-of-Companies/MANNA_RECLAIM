import { Router } from 'express';
import * as reports from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { dateRange } from '../validations/common.validation.js';

const router = Router();

router.use(authenticate, validate({ query: dateRange }));

router.get('/production', reports.production);
router.get('/efficiency', reports.efficiency);

// costing and the combined dashboard payload are back-office only
router.get('/costing', adminOnly, reports.costing);
router.get('/dashboard', adminOnly, reports.dashboard);

export default router;
