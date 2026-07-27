import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import machineRoutes from './machine.routes.js';
import batchRoutes from './batch.routes.js';
import runRoutes from './run.routes.js';
import qualityRoutes from './quality.routes.js';
import dispatchRoutes from './dispatch.routes.js';
import rateRoutes from './rate.routes.js';
import maintenanceRoutes from './maintenance.routes.js';
import reportRoutes from './report.routes.js';
import { isDbReady } from '../config/db.js';
import { ok } from '../utils/ApiResponse.js';

const router = Router();

router.get('/', (_req, res) =>
  ok(res, { name: 'manna-reclaim-api', db: isDbReady() ? 'ready' : 'not-configured' }),
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/machines', machineRoutes);
router.use('/batches', batchRoutes);
router.use('/runs', runRoutes);
router.use('/quality-tests', qualityRoutes);
router.use('/dispatches', dispatchRoutes);
router.use('/rates', rateRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/reports', reportRoutes);

export default router;
