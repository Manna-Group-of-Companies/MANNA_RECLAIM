/**
 * Writes the 14 plant machines into MongoDB.
 *
 *   node scripts/seed-machines.js [flags]
 *
 *   --dry-run   report what would change, write nothing
 *   --force     overwrite machines that already exist
 *
 * The machine list lives in config/devSeed.js, which the API serves from memory
 * only while MongoDB is unconfigured. Once MONGODB_URI points at a real database
 * that fallback switches off, so the rows have to exist here or the Machines
 * screen comes up empty. Ids are the fixed short codes the UI is built around
 * ("CRK", "AC_A", "R4"), so re-running upserts rather than duplicating.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { DEV_MACHINES } from '../src/config/devSeed.js';
import { Machine } from '../src/models/machine.model.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

async function seed({ id, ...fields }) {
  const existing = await Machine.exists({ _id: id });

  if (existing && !FORCE) return { id, action: 'skipped (already exists)' };
  if (DRY_RUN) return { id, action: existing ? 'would overwrite' : 'would create' };

  await Machine.updateOne({ _id: id }, { $set: fields }, { upsert: true });
  return { id, action: existing ? 'overwritten' : 'created' };
}

async function main() {
  if (!env.mongo.uri) throw new Error('MONGODB_URI is not set - nothing to seed.');

  await mongoose.connect(env.mongo.uri, {
    dbName: env.mongo.dbName || undefined,
    serverSelectionTimeoutMS: env.mongo.serverSelectionTimeoutMS,
  });
  logger.info('MongoDB connected [' + mongoose.connection.name + ']');

  await Machine.syncIndexes();

  for (const machine of DEV_MACHINES) {
    const { id, action } = await seed(machine);
    logger.info(id.padEnd(8) + action);
  }

  const total = await Machine.countDocuments();
  if (DRY_RUN) logger.warn('--dry-run: no documents were written.');
  else logger.info(total + ' machines in the collection.');
}

main()
  .catch((err) => {
    logger.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
