import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { dbInfo } from './config/supabase.js';
import routes from './routes/index.js';
import { requestLogger } from './middlewares/requestLogger.middleware.js';
import { apiLimiter, writeLimiter } from './middlewares/rateLimiter.middleware.js';
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

  // This process serves JSON and nothing else - no HTML, no scripts, no frames -
  // so the policy says exactly that. `default-src 'none'` means a response that
  // somehow came back as a document could not load a resource or run a script,
  // which is what turns a reflected-content bug into a dead end.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
      // frame-ancestors above is the modern control; this is the same answer for
      // browsers that predate it, and helmet's own default is only SAMEORIGIN.
      frameguard: { action: 'deny' },
      // Referrer would otherwise carry the API path - including ids in it - to
      // whatever a browser navigated to next.
      referrerPolicy: { policy: 'no-referrer' },
      // The client is a separate origin, so CORS decides who may read a
      // response; CORP's stricter default would refuse the browser outright.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Told to the browser only over HTTPS, and only worth asserting once the
      // API is actually behind TLS.
      hsts: env.isProd
        ? { maxAge: 180 * 24 * 60 * 60, includeSubDomains: true, preload: false }
        : false,
    }),
  );
  app.disable('x-powered-by');
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
  // A lab report is a phone photo or a PDF, handed over as a base64 data URL -
  // nothing else the API takes comes near that size, so only that one route
  // gets the larger ceiling (8 MB of file is ~11 MB of base64).
  const standardBody = express.json({ limit: '2mb' });
  const reportBody = express.json({ limit: '12mb' });
  app.use((req, res, next) =>
    (/\/quality-tests\/[^/]+\/report$/.test(req.path) ? reportBody : standardBody)(req, res, next),
  );
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  // Unauthenticated on purpose - a load balancer has to be able to ask. So in
  // production it answers only what a health check needs, and keeps the runtime
  // and the database host to itself.
  /**
   * Whether the machine feeds are switched on, as a word rather than a secret.
   *
   * Answered in production too, unlike everything else here, and that is a
   * deliberate exception. Setting up the plant server's sync means somebody
   * standing at a dashboard in one building and somebody reading a log in
   * another, and the question between them is only ever "has the token landed".
   * Without an answer they take turns guessing: the variable is misspelt, or it
   * was saved with an empty value, or it went onto the wrong service, and each
   * guess costs a redeploy and a phone call.
   *
   * It gives nothing away. The sync route already tells any anonymous caller
   * exactly this, in a whole sentence, because a script that cannot post has to
   * be told why - so a boolean here reveals nothing that a single POST does not,
   * and it can be read without pretending to be the plant server.
   */
  const feeds = () => ({ sapSync: env.sapSyncToken ? 'configured' : 'not configured' });

  app.get('/health', (_req, res) =>
    env.isProd
      ? res.json({ success: true, status: 'up', feeds: feeds() })
      : res.json({ success: true, status: 'up', env: env.nodeEnv, db: dbInfo(), feeds: feeds() }),
  );

  app.use(env.apiPrefix, apiLimiter, writeLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
