/**
 * Writes what the moulding presses mould into Supabase.
 *
 *   node scripts/seed-products.js [flags]
 *
 *   --dry-run   report what would change, write nothing
 *   --force     overwrite products that already exist
 *
 * The rows are seeded with their figures unset - no curing temperature, no cycle
 * time, no cavities, no compound rate. Nobody has measured them into this system,
 * and a placeholder rate would quietly cost every press run wrong; the back
 * office fills them in on the Products screen. --force therefore blanks anything
 * already entered there, which is why it is not the default.
 *
 * supabase/schema.sql already inserts these, so this is only needed to repair or
 * re-apply the list after editing config/devSeed.js.
 */
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { request } from '../src/config/supabase.js';
import { DEV_PRODUCTS } from '../src/config/devSeed.js';
import { TABLES } from '../src/config/constants.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

async function seed({ id, ...fields }) {
  const { total } = await request(TABLES.products, {
    select: 'id',
    filters: { id },
    limit: 1,
    count: true,
  });
  const existing = total > 0;

  if (existing && !FORCE) return { id, action: 'skipped (already exists)' };
  if (DRY_RUN) return { id, action: existing ? 'would overwrite' : 'would create' };

  await request(TABLES.products, {
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

  for (const product of DEV_PRODUCTS) {
    const { id, action } = await seed(product);
    logger.info(id.padEnd(8) + action);
  }

  const { total } = await request(TABLES.products, { select: 'id', limit: 0, count: true });
  if (DRY_RUN) logger.warn('--dry-run: no rows were written.');
  else logger.info(total + ' products in the table.');
}

main().catch((err) => {
  logger.error(err.message);
  if (/schema\.sql|does not exist|Could not find/i.test(err.message)) {
    logger.error('Run supabase/fix-missing-columns.sql in the Supabase SQL editor first.');
  }
  process.exitCode = 1;
});
