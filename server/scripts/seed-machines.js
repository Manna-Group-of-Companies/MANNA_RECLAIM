/**
 * Writes the 14 plant machines into Supabase.
 *
 *   node scripts/seed-machines.js [flags]
 *
 *   --dry-run   report what would change, write nothing
 *   --force     overwrite machines that already exist
 *
 * supabase/schema.sql already inserts these, so this is only needed to repair
 * or re-apply the list - and it is what to run after editing config/devSeed.js,
 * which holds the same 14 rows for the in-memory fallback.
 *
 * Ids are the fixed short codes the whole UI is built around ("CRK", "AC_A",
 * "R4"), so re-running upserts rather than duplicating.
 */
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { request } from '../src/config/supabase.js';
import { DEV_MACHINES } from '../src/config/devSeed.js';
import { TABLES } from '../src/config/constants.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

async function seed({ id, ...fields }) {
  const { total } = await request(TABLES.machines, {
    select: 'id',
    filters: { id },
    limit: 1,
    count: true,
  });
  const existing = total > 0;

  if (existing && !FORCE) return { id, action: 'skipped (already exists)' };
  if (DRY_RUN) return { id, action: existing ? 'would overwrite' : 'would create' };

  await request(TABLES.machines, {
    method: 'POST',
    body: { id, ...fields, updated_at: new Date().toISOString() },
    onConflict: 'id',
    returning: false,
  });
  return { id, action: existing ? 'overwritten' : 'created' };
}

async function main() {
  if (!env.supabase.url || !env.supabase.key) {
    throw new Error('Set SUPABASE_URL and a key in server/.env - nothing to seed.');
  }

  for (const machine of DEV_MACHINES) {
    const { id, action } = await seed(machine);
    logger.info(id.padEnd(8) + action);
  }

  const { total } = await request(TABLES.machines, { select: 'id', limit: 0, count: true });
  if (DRY_RUN) logger.warn('--dry-run: no rows were written.');
  else logger.info(total + ' machines in the table.');
}

main().catch((err) => {
  logger.error(err.message);
  if (/schema\.sql|does not exist|Could not find/i.test(err.message)) {
    logger.error('Run supabase/schema.sql in the Supabase SQL editor first.');
  }
  process.exitCode = 1;
});
