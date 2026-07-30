import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import machineRoutes from './machine.routes.js';
import productRoutes from './product.routes.js';
import batchRoutes from './batch.routes.js';
import runRoutes from './run.routes.js';
import qualityRoutes from './quality.routes.js';
import dispatchRoutes from './dispatch.routes.js';
import rateRoutes from './rate.routes.js';
import maintenanceRoutes from './maintenance.routes.js';
import reportRoutes from './report.routes.js';
import { dbInfo } from '../config/supabase.js';
import { env } from '../config/env.js';
import { ok } from '../utils/ApiResponse.js';

const router = Router();

/**
 * The API's own index. Unauthenticated, so it names itself and nothing else -
 * dbInfo() carries the Supabase project host, which is not something to hand to
 * an anonymous caller. /health does the same, for the same reason.
 */
router.get('/', (_req, res) =>
  ok(res, env.isProd ? { name: 'manna-reclaim-api' } : { name: 'manna-reclaim-api', db: dbInfo() }),
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/machines', machineRoutes);
router.use('/products', productRoutes);
router.use('/batches', batchRoutes);
router.use('/runs', runRoutes);
router.use('/quality-tests', qualityRoutes);
router.use('/dispatches', dispatchRoutes);
router.use('/rates', rateRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/reports', reportRoutes);

export default router;
