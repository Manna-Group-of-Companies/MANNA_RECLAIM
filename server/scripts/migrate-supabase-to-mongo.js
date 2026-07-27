/**
 * Copies every Supabase object into MongoDB, one collection per object, same name.
 *
 *   node scripts/migrate-supabase-to-mongo.js [flags]
 *
 *   --dry-run          read and count, write nothing
 *   --tables-only      skip the derived views
 *   --views-only       only the derived views
 *   --only=a,b,c       just these objects
 *   --keep             append instead of replacing the collection
 *
 * Rows land exactly as PostgREST returns them - no type coercion - so a copy is
 * byte-comparable with the source. When a row has a scalar `id` and the ids in
 * that object are unique, it becomes `_id` so re-running upserts instead of
 * duplicating; otherwise Mongo assigns one and `--keep` would double the rows.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { SUPABASE_OBJECTS } from './supabaseObjects.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : '';
};

const DRY_RUN = has('--dry-run');
const KEEP = has('--keep');
const ONLY = valueOf('--only').split(',').map((s) => s.trim()).filter(Boolean);
const INSERT_BATCH = 500;

function selectObjects() {
  let list = SUPABASE_OBJECTS;
  if (has('--tables-only')) list = list.filter((o) => o.kind === 'table');
  if (has('--views-only')) list = list.filter((o) => o.kind === 'view');
  if (ONLY.length) {
    const wanted = new Set(ONLY);
    const known = new Set(SUPABASE_OBJECTS.map((o) => o.name));
    const unknown = ONLY.filter((n) => !known.has(n));
    if (unknown.length) throw new Error(`Unknown object(s): ${unknown.join(', ')}`);
    list = list.filter((o) => wanted.has(o.name));
  }
  return list;
}

const headers = () => ({
  apikey: env.supabase.key,
  Authorization: `Bearer ${env.supabase.key}`,
  Accept: 'application/json',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A dropped connection mid-copy would silently truncate a collection, so retry. */
async function fetchPage(name, from, to, attempt = 1) {
  try {
    const res = await fetch(`${env.supabase.url}/rest/v1/${name}?select=*`, {
      headers: { ...headers(), Range: `${from}-${to}`, 'Range-Unit': 'items' },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return res.json();
  } catch (err) {
    if (attempt >= 4) throw new Error(`${name} [${from}-${to}]: ${err.message}`);
    await sleep(attempt * 500);
    return fetchPage(name, from, to, attempt + 1);
  }
}

/** PostgREST caps a response at its own max-rows, so walk the Range window. */
async function fetchAll(name) {
  const size = env.supabase.pageSize;
  const rows = [];
  for (let from = 0; ; from += size) {
    const page = await fetchPage(name, from, from + size - 1);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}

/** Only promote `id` to `_id` when it is scalar and unique across the object. */
function keyRows(rows) {
  const ids = rows.map((r) => r?.id);
  const usable =
    rows.length > 0 &&
    ids.every((id) => (typeof id === 'string' && id !== '') || typeof id === 'number') &&
    new Set(ids).size === ids.length;
  if (!usable) return { rows, keyed: false };
  return { rows: rows.map((r) => ({ _id: r.id, ...r })), keyed: true };
}

async function writeRows(db, name, rows) {
  const col = db.collection(name);
  if (!KEEP) await col.deleteMany({});
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await col.insertMany(rows.slice(i, i + INSERT_BATCH), { ordered: false });
  }
  return col.countDocuments();
}

async function main() {
  if (!env.supabase.url || !env.supabase.key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY) in server/.env');
  }
  if (!env.mongo.uri) throw new Error('Set MONGODB_URI in server/.env');

  const objects = selectObjects();
  logger.info(
    `Copying ${objects.length} object(s) from ${env.supabase.url} ` +
      `into ${env.mongo.uri}/${env.mongo.dbName}${DRY_RUN ? ' [DRY RUN]' : ''}`
  );

  await mongoose.connect(env.mongo.uri, {
    dbName: env.mongo.dbName || undefined,
    serverSelectionTimeoutMS: env.mongo.serverSelectionTimeoutMS,
  });
  const db = mongoose.connection.db;

  const report = [];
  for (const obj of objects) {
    try {
      const fetched = await fetchAll(obj.name);
      const { rows, keyed } = keyRows(fetched);
      const written = DRY_RUN || !rows.length ? 0 : await writeRows(db, obj.name, rows);
      report.push({ ...obj, read: fetched.length, written, keyed, ok: true });
      logger.info(`  ${obj.name}: ${fetched.length} read${DRY_RUN ? '' : ` / ${written} written`}`);
    } catch (err) {
      report.push({ ...obj, read: 0, written: 0, keyed: false, ok: false, error: err.message });
      logger.error(`  ${obj.name}: ${err.message}`);
    }
  }

  const pad = (v, n) => String(v).padStart(n);
  const nameWidth = Math.max(...report.map((r) => r.name.length));
  console.log('\nobject'.padEnd(nameWidth + 2) + 'kind   supabase    mongo  status');
  for (const r of report) {
    const status = !r.ok ? `FAILED (${r.error})` : DRY_RUN ? 'dry-run' : r.written === r.read ? 'ok' : 'MISMATCH';
    console.log(
      r.name.padEnd(nameWidth + 2) + r.kind.padEnd(7) + pad(r.read, 8) + pad(r.written, 9) + '  ' + status
    );
  }

  const failed = report.filter((r) => !r.ok);
  const mismatched = report.filter((r) => r.ok && !DRY_RUN && r.written !== r.read);
  const read = report.reduce((a, r) => a + r.read, 0);
  const written = report.reduce((a, r) => a + r.written, 0);
  console.log(`\n${read} row(s) read, ${written} written across ${report.length} collection(s).`);
  if (failed.length) console.log(`${failed.length} object(s) failed: ${failed.map((r) => r.name).join(', ')}`);
  if (mismatched.length) console.log(`${mismatched.length} count mismatch: ${mismatched.map((r) => r.name).join(', ')}`);

  await mongoose.disconnect();
  process.exit(failed.length || mismatched.length ? 1 : 0);
}

main().catch(async (err) => {
  logger.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
