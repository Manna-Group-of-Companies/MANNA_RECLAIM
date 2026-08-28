/**
 * Load a file of punches into the plant's record.
 *
 *   node scripts/punch-import.js                 what it would do, writes nothing
 *   node scripts/punch-import.js --apply         do it
 *   node scripts/punch-import.js --file x.json --apply
 *
 * The file is what scripts/punch-read.py wrote off the gate reader. This puts it
 * through attendanceService.receive - the same call the live sync route makes -
 * rather than writing rows itself, so a punch loaded by hand and a punch that
 * arrived on its own are the same row, derived the same way. A second copy of
 * the shift arithmetic here is a second copy that would drift.
 *
 * Idempotent, because that call is: the unique index on (device, code, punched
 * at) means a file loaded twice stores nothing the second time.
 *
 * It writes to whatever SUPABASE_URL points at, which on this machine is the
 * live plant database. There is no separate copy to practise on.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attendanceService } from '../src/services/attendance.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const at = args.indexOf('--file');
const file = at === -1
  ? join(dirname(fileURLToPath(import.meta.url)), 'punches.json')
  : resolve(args[at + 1]);

/** In batches, because one array of eighty thousand is one request nothing accepts. */
const CHUNK = 2000;

async function main() {
  if (!isDbReady()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set - see server/.env.example');
  }

  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const { device, punches = [] } = payload;
  const days = [...new Set(punches.map((p) => p.date))].sort();
  const withDirection = punches.filter((p) => p.direction).length;

  logger.info(`${file}`);
  logger.info(`  device ${device}`);
  logger.info(`  ${punches.length} punches, ${days.length} day(s), ${days[0]} to ${days[days.length - 1]}`);
  logger.info(`  ${withDirection} carry a direction (in / out), which is what decides the shift`);

  if (!apply) {
    logger.info('DRY RUN - nothing was written. Re-run with --apply to load it.');
    return;
  }

  let stored = 0;
  let already = 0;
  for (let i = 0; i < punches.length; i += CHUNK) {
    const slice = punches.slice(i, i + CHUNK);
    const res = await attendanceService.receive({ device, punches: slice });
    stored += res.stored;
    already += res.already;
  }
  logger.info(`Done. ${stored} punches stored, ${already} were already on record.`);
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
