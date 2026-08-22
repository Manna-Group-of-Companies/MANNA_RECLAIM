/**
 * Creates the starting name + PIN accounts in Supabase so the app can be
 * signed into.
 *
 *   node scripts/seed-users.js [flags]
 *
 *   --dry-run    report what would change, write nothing
 *   --reset-pin  also rewrite the PIN of an account that already exists
 *
 * Needs `public.users`, which supabase/schema.sql creates - and, because that
 * table holds PIN hashes and is closed to the anon key, SUPABASE_SERVICE_KEY
 * in server/.env.
 *
 * Safe to re-run: an account whose name already exists is left alone unless
 * --reset-pin is passed, so this never clobbers a PIN someone has changed.
 * The names and PINs mirror config/devSeed.js, which is what the in-memory
 * fallback serves until this has been run.
 */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { request, op } from '../src/config/supabase.js';
import { ROLES, TABLES } from '../src/config/constants.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESET_PIN = args.includes('--reset-pin');

// Mirrors SEED_PINS in src/config/devSeed.js - see the note there on why Admin
// is its own account rather than something Manager was widened to do.
const SEED_USERS = [
  { name: 'Mathai', role: ROLES.SUPERVISOR, pin: '1111' },
  { name: 'Rahul', role: ROLES.SUPERVISOR, pin: '2222' },
  { name: 'Devanand', role: ROLES.SUPERVISOR, pin: '3333' },
  { name: 'Lab', role: ROLES.LAB, pin: '4444' },
  { name: 'Manager', role: ROLES.MANAGER, pin: '2525' },
  { name: 'Admin', role: ROLES.ADMIN, pin: '9999' },
  // The managing director: the overview and the shift efficiency, read-only.
  // Needs migrations/0016 applied first - `users.role` is a checked column and
  // an insert with 'md' is refused by Postgres until it is.
  { name: 'MD', role: ROLES.MD, pin: '3567' },
];

async function seed({ name, role, pin }) {
  // `ilike` with no wildcard is the case-insensitive match the unique index on
  // lower(name) enforces, so "mathai" finds "Mathai".
  const { rows } = await request(TABLES.users, {
    select: 'id,name',
    filters: { name: op.ilike(name) },
    limit: 1,
  });
  const existing = rows[0];

  if (existing && !RESET_PIN) return { name, action: 'skipped (already exists)' };
  if (DRY_RUN) return { name, action: existing ? 'would reset PIN' : 'would create' };

  const pin_hash = await bcrypt.hash(pin, 10);

  if (existing) {
    await request(TABLES.users, {
      method: 'PATCH',
      filters: { id: existing.id },
      body: { pin_hash, active: true, updated_at: new Date().toISOString() },
      returning: false,
    });
    return { name, action: 'PIN reset' };
  }

  await request(TABLES.users, {
    method: 'POST',
    body: { id: randomUUID(), name, role, active: true, pin_hash },
    returning: false,
  });
  return { name, action: 'created' };
}

async function main() {
  if (!env.supabase.url || !env.supabase.key) {
    throw new Error('Set SUPABASE_URL and a key in server/.env - nothing to seed.');
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    logger.warn('SUPABASE_SERVICE_KEY is not set - `users` is closed to the anon key.');
  }

  for (const user of SEED_USERS) {
    const { name, action } = await seed(user);
    logger.info(name.padEnd(10) + action);
  }

  if (DRY_RUN) logger.warn('--dry-run: no rows were written.');
  else logger.info('Done. Sign in with a seeded name and its PIN.');
}

main().catch((err) => {
  logger.error(err.message);
  if (/schema\.sql|does not exist|Could not find/i.test(err.message)) {
    logger.error('Run supabase/schema.sql in the Supabase SQL editor first.');
  }
  process.exitCode = 1;
});
