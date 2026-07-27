import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

let pending = null;

/**
 * Connects once and keeps the handle. Returns null when MONGODB_URI is unset,
 * so the API still boots and data routes answer 503 (the dev seed then serves
 * in-memory accounts and machines - see config/devSeed.js).
 */
export async function connectDb() {
  if (!env.mongo.uri) {
    logger.warn('MONGODB_URI is not set - data routes will return 503.');
    return null;
  }
  if (isDbReady()) return mongoose.connection;
  if (pending) return pending;

  pending = mongoose
    .connect(env.mongo.uri, {
      dbName: env.mongo.dbName || undefined,
      maxPoolSize: env.mongo.maxPoolSize,
      serverSelectionTimeoutMS: env.mongo.serverSelectionTimeoutMS,
      autoIndex: env.mongo.autoIndex,
    })
    .then((m) => {
      logger.info('MongoDB connected [' + m.connection.name + ']');
      return m.connection;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });

  return pending;
}

export const isDbReady = () => mongoose.connection.readyState === 1;

export async function disconnectDb() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  pending = null;
}

mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err.message));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

export { mongoose };
export default connectDb;
