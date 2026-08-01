/**
 * Applies a .sql file to the Supabase project.
 *
 *   node scripts/apply-sql.js [file] [--dry]
 *   npm run db:migrate                       -> supabase/schema.sql
 *
 * Why this exists: PostgREST - which is all SUPABASE_URL and the service key
 * reach - deliberately has no way to run DDL, so `create table` cannot go
 * through the same door as every other write in this server. The alternative is
 * pasting the file into the Supabase SQL editor by hand every time a column is
 * added, which is a step that gets skipped and is exactly why a project drifts
 * behind the code that expects it.
 *
 * It needs a direct Postgres connection, which is a different credential from
 * the service key:
 *
 *   Supabase dashboard -> Project Settings -> Database -> Connection string
 *   -> URI. Put it in server/.env as DATABASE_URL. It contains the database
 *   password, so it belongs in .env and nowhere else.
 *
 * The whole file runs inside one transaction. DDL is transactional in Postgres,
 * so a statement failing half way through leaves the project exactly as it was
 * rather than half migrated - which matters most on the run where something is
 * wrong with the SQL, since that is the run you least want to be recovering
 * from by hand.
 */
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const target = resolve(repoRoot, args.find((a) => !a.startsWith('--')) ?? 'supabase/schema.sql');

/**
 * Supabase's own certificate chain is not in Node's trust store, and the
 * connection string it hands out is over the public internet either way. This
 * is the setting their docs give for a direct connection from a script.
 */
const ssl = { rejectUnauthorized: false };

/** A rough count of what is about to run, for the line the script prints. */
const statementCount = (sql) =>
  sql
    // Dollar-quoted function bodies hold semicolons that are not statement ends.
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .split(';')
    .filter((part) => part.replace(/--.*$/gm, '').trim()).length;

async function main() {
  let sql;
  try {
    sql = readFileSync(target, 'utf8');
  } catch {
    throw new Error(`Cannot read ${target}`);
  }

  const shown = relative(repoRoot, target).replace(/\\/g, '/');
  logger.info(`${shown}: ${statementCount(sql)} statements, ${sql.length} bytes`);
  logger.info(`Project: ${env.supabase.url.replace(/^https?:\/\//, '') || 'unknown'}`);

  // Checked before the credential, so --dry is a way to look at the file on a
  // machine that has no business holding the database password.
  if (dryRun) {
    logger.info('--dry: nothing was sent.');
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set.\n\n' +
        '  Supabase dashboard -> Project Settings -> Database -> Connection string -> URI\n' +
        '  Add it to server/.env as DATABASE_URL=postgresql://...\n\n' +
        'It carries the database password, which is not the same as SUPABASE_SERVICE_KEY -\n' +
        'the service key reaches PostgREST, and PostgREST cannot run DDL.',
    );
  }

  const client = new pg.Client({ connectionString: url, ssl });
  await client.connect();
  try {
    // One transaction for the whole file. The statements are sent as a single
    // simple query, which is also what keeps `$$ ... $$` function bodies intact -
    // splitting the file on semicolons would cut them in half.
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    logger.info(`${shown} applied.`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    // `position` is a character offset into the file, which is the only thing
    // that turns "syntax error at or near" into somewhere to look.
    const where = err.position ? ` (at character ${err.position})` : '';
    throw new Error(`${shown} was NOT applied - rolled back.\n  ${err.message}${where}`);
  } finally {
    await client.end();
  }

  logger.info('Restart the server: its boot check reports anything still missing.');
}

main().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
