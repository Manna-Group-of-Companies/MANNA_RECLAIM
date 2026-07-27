/**
 * Creates the starting name + PIN accounts so the app can be signed into.
 *
 *   node scripts/seed-users.js [flags]
 *
 *   --dry-run    report what would change, write nothing
 *   --reset-pin  also rewrite the PIN of an account that already exists
 *
 * Safe to re-run: an account whose name already exists is left alone unless
 * --reset-pin is passed, so this never clobbers a PIN someone has changed.
 * The names and PINs mirror config/devSeed.js, which is what the in-memory
 * fallback serves while MongoDB is unconfigured.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { ROLES } from '../src/config/constants.js';
import { User } from '../src/models/user.model.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESET_PIN = args.includes('--reset-pin');

const SEED_USERS = [
  { name: 'Mathai', role: ROLES.SUPERVISOR, pin: '1111' },
  { name: 'Rahul', role: ROLES.SUPERVISOR, pin: '2222' },
  { name: 'Devanand', role: ROLES.SUPERVISOR, pin: '3333' },
  { name: 'Manager', role: ROLES.MANAGER, pin: '2525' },
];

// Matches the unique index on user.model.js, so "mathai" finds "Mathai".
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

async function seed({ name, role, pin }) {
  const existing = await User.findOne({ name }, '_id name role')
    .collation(CASE_INSENSITIVE)
    .lean();

  if (existing && !RESET_PIN) return { name, action: 'skipped (already exists)' };

  if (DRY_RUN) return { name, action: existing ? 'would reset PIN' : 'would create' };

  const pin_hash = await bcrypt.hash(pin, 10);
  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { pin_hash, active: true } });
    return { name, action: 'PIN reset' };
  }

  await User.create({ name, role, active: true, pin_hash });
  return { name, action: 'created' };
}

async function main() {
  if (!env.mongo.uri) throw new Error('MONGODB_URI is not set - nothing to seed.');

  await mongoose.connect(env.mongo.uri, {
    dbName: env.mongo.dbName || undefined,
    serverSelectionTimeoutMS: env.mongo.serverSelectionTimeoutMS,
  });
  logger.info('MongoDB connected [' + mongoose.connection.name + ']');

  // The unique name index may not exist yet on a collection the migration created.
  await User.syncIndexes();

  for (const user of SEED_USERS) {
    const { name, action } = await seed(user);
    logger.info(name.padEnd(10) + action);
  }

  if (DRY_RUN) logger.warn('--dry-run: no documents were written.');
  else logger.info('Done. Sign in with a seeded name and its PIN.');
}

main()
  .catch((err) => {
    logger.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
