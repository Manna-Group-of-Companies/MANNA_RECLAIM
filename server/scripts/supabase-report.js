/**
 * Reads every object in the Supabase project and reports what is in it.
 *
 *   node scripts/supabase-report.js [flags]
 *
 *   --columns    also list each object's columns
 *   --json       machine-readable output
 *   --only=a,b   just these objects
 *
 * This is the "what does the database actually hold" check. It counts rows
 * through the Content-Range header rather than downloading them, so it stays
 * cheap on `runs`, and it flags anything the server expects but the project
 * does not have yet - which is what supabase/schema.sql exists to fix.
 */
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { request } from '../src/config/supabase.js';
import { registry } from '../src/config/tables.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : '';
};

const SHOW_COLUMNS = has('--columns');
const AS_JSON = has('--json');
const ONLY = valueOf('--only').split(',').map((s) => s.trim()).filter(Boolean);

/** Row count without the rows: ask for a zero-length window and read the total. */
async function inspect(name, spec) {
  try {
    const { total } = await request(name, { select: '*', limit: 0, count: true });
    let columns = null;
    if (SHOW_COLUMNS) {
      const { rows } = await request(name, { select: '*', limit: 1 });
      // An empty table gives nothing away; fall back to what the server declares.
      columns = rows[0] ? Object.keys(rows[0]) : spec.columns?.length ? spec.columns : null;
    }
    return { name, kind: spec.readOnly ? 'view' : 'table', rows: total, columns, ok: true };
  } catch (err) {
    return { name, kind: spec.readOnly ? 'view' : 'table', rows: 0, ok: false, error: err.message };
  }
}

async function main() {
  if (!env.supabase.url || !env.supabase.key) {
    throw new Error('Set SUPABASE_URL and a key in server/.env.');
  }

  let entries = Object.entries(registry);
  if (ONLY.length) {
    const wanted = new Set(ONLY);
    const unknown = ONLY.filter((n) => !registry[n]);
    if (unknown.length) throw new Error(`Unknown object(s): ${unknown.join(', ')}`);
    entries = entries.filter(([name]) => wanted.has(name));
  }

  const report = (await Promise.all(entries.map(([name, spec]) => inspect(name, spec))))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));

  if (AS_JSON) {
    console.log(JSON.stringify({ host: env.supabase.url, objects: report }, null, 2));
    return;
  }

  const width = Math.max(...report.map((r) => r.name.length));
  console.log(`\nSupabase  ${env.supabase.url}\n`);
  console.log('object'.padEnd(width + 2) + 'kind    rows  status');
  for (const r of report) {
    const status = r.ok ? 'ok' : `MISSING (${r.error})`;
    console.log(r.name.padEnd(width + 2) + r.kind.padEnd(7) + String(r.rows).padStart(6) + '  ' + status);
    if (SHOW_COLUMNS && r.columns) {
      console.log(' '.repeat(width + 2) + r.columns.join(', '));
    }
  }

  const missing = report.filter((r) => !r.ok);
  const total = report.reduce((sum, r) => sum + r.rows, 0);
  console.log(`\n${total} row(s) across ${report.filter((r) => r.ok).length} object(s).`);
  if (missing.length) {
    console.log(`${missing.length} missing: ${missing.map((r) => r.name).join(', ')}`);
    console.log('Run supabase/schema.sql in the Supabase SQL editor.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(err.message);
  process.exitCode = 1;
});
