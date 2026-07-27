import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { isDbReady } from './config/db.js';
import routes from './routes/index.js';
import { requestLogger } from './middlewares/requestLogger.middleware.js';
import { apiLimiter } from './middlewares/rateLimiter.middleware.js';
import { notFound } from './middlewares/notFound.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { ApiError } from './utils/ApiError.js';

/** Vite falls forward to 5174, 5175... when its port is taken, so in dev any loopback origin passes. */
const isLoopback = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);

const originAllowed = (origin) =>
  !origin || env.corsOrigins.includes(origin) || (!env.isProd && isLoopback(origin));

export function createApp() {
  const app = express();

  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // a plain Error here reaches the handler without a statusCode and surfaces as a 500
      origin: (origin, cb) =>
        originAllowed(origin)
          ? cb(null, true)
          : cb(ApiError.forbidden('Origin ' + origin + ' is not allowed by CORS')),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.get('/health', (_req, res) =>
    res.json({ success: true, status: 'up', env: env.nodeEnv, db: isDbReady() }),
  );

  app.use(env.apiPrefix, apiLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
