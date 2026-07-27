import { createApp } from './app.js';
import { env, assertEnv } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { logger } from './config/logger.js';

assertEnv();

try {
  await connectDb();
} catch (err) {
  logger.error('MongoDB connection failed:', err.message);
  // In production a database-less API is useless; in development we keep going
  // so the dev seed can serve the in-memory accounts and machines.
  if (env.isProd) process.exit(1);
  logger.warn('Starting without a database - data routes will return 503.');
}

const app = createApp();
const server = app.listen(env.port, () => {
  logger.info('API listening on http://localhost:' + env.port + env.apiPrefix + ' [' + env.nodeEnv + ']');
});

const shutdown = (signal) => () => {
  logger.info(signal + ' received, closing server');
  server.close(async () => {
    await disconnectDb().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

export default server;
