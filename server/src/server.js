import { createApp } from './app.js';
import { env, assertEnv } from './config/env.js';
import { dbInfo, verifySchema } from './config/supabase.js';
import { writableRegistry } from './config/tables.js';
import { logger } from './config/logger.js';

assertEnv();

/**
 * Supabase is reached over HTTP, so there is no connection to open at boot.
 * What is worth checking is that the project actually has the tables and
 * columns this server writes to - a missing one would otherwise surface as a
 * 400 on whichever screen happened to touch it first.
 */
if (env.supabase.verifySchema) {
  const problems = await verifySchema(writableRegistry).catch((err) => {
    logger.error('Supabase schema check failed:', err.message);
    return [];
  });
  if (!problems.length) logger.info('Supabase schema OK');
}

const app = createApp();
const server = app.listen(env.port, () => {
  logger.info('Database: Supabase [' + dbInfo().host + ']');
  logger.info('API listening on http://localhost:' + env.port + env.apiPrefix + ' [' + env.nodeEnv + ']');
});

const shutdown = (signal) => () => {
  logger.info(signal + ' received, closing server');
  server.close(() => process.exit(0));
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
