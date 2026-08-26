/**
 * Puts a typed-in mix back into the columns that hold a mix.
 *
 *   node scripts/mix-comma-split.js            what it would do, writes nothing
 *   node scripts/mix-comma-split.js --apply    do it, after taking a backup
 *
 * A refining pass can work two batches at once, and the record has held that
 * since the beginning: `batch_no` is the batch the pass is filed under, and
 * `src1`..`src4` are every batch that went through it, the filed-under one
 * first. Forty passes are on record in that shape, in April, June and August.
 *
 * And five are not, because the picker for the second batch had been folded
 * into the first grid as a second tap with nothing on the sheet to announce it.
 * Some crews found it and some did not - in August four jobs recorded the mix
 * and two were typed into the batch box with a comma between them:
 *
 *   batch_no "3056,3058"   src1 null   src2 null
 *
 * That is not a batch number. Nothing reads it as two batches - it is one
 * opaque string that happens to contain a comma - and the damage is not
 * cosmetic:
 *
 *   The special line's efficiency is grouped by batch and grade, so a typed
 *   list is a group of its own. "3056,3058" Fine and "3058,3056" Fine are two
 *   different grades of two different batches as far as the arithmetic is
 *   concerned, though one crew wrote both in one shift about one job. On 8
 *   August that left the 578 kg with a single pass's 6.6 man-hours and sent the
 *   other two passes' 5.6 to the never-weighed pile: 87.58 kg per man-hour
 *   against a real 43.44. The plant pays an incentive on that figure.
 *
 *   A batch search cannot find them without knowing to look for commas, and the
 *   batch card for 3056 does not know that 578 kg of it came out on the 8th.
 *
 * So each typed list is read back into the shape the app writes: the lead into
 * `batch_no` and `src1`, the rest into `src2` onwards.
 *
 * WHICH ONE LEADS is the only judgement here, and it is a judgement - a crew
 * typing into a free box was not being asked to rank them, and on 8 August the
 * same crew wrote the pair in both orders inside one shift. It matters because
 * the lead is what the run is filed under, and because every pass of one job
 * must take the same lead or the arithmetic splits again exactly as it did
 * before.
 *
 * The rule is the order the passes themselves voted for, tied by the batch the
 * plant met first - and every decision is printed with its evidence, because a
 * script that picks silently is a script nobody can check. On the two jobs on
 * record the vote is 2-1 and 2-0, and three other readings of the record agree
 * with both:
 *
 *   3056 was autoclaved before 3058 and 3134 before 3140, and a pass clearing
 *   tailings is filed under the older batch.
 *   3056 never appears again after the 8th, nor 3134 after the 24th, which is
 *   what being finished off looks like.
 *   Leading with the other one would drag a third and a fourth shift into the
 *   merge below rather than the two that are already one job.
 *
 * IT CHANGES TWO EFFICIENCY FIGURES, which is the point, and is still worth
 * seeing before it happens rather than after. Once the 8th's passes are filed
 * under 3056 they join the 3056 Fine already on record from the 7th, and a
 * grade belongs to the shift that weighed it out last - so 7 August night's
 * Fine card merges forward into 8 August day. No kilograms enter or leave the
 * plant's total: 621 + 578 is the 1199 that lands. Every card that moves is
 * printed with its before and after.
 *
 * IDEMPOTENT. A row is touched only while its `batch_no` still holds a comma,
 * which stops being true the moment it is fixed, so a second run finds nothing
 * to do. It writes no run it cannot read: a list naming one batch twice, or
 * naming more batches than there are columns, is reported and left alone.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crud } from '../src/services/base.service.js';
import { isDbReady } from '../src/config/supabase.js';
import { logger } from '../src/config/logger.js';
import { TABLES } from '../src/config/constants.js';
import { refinerUnits } from '../src/services/efficiency.service.js';

const apply = process.argv.slice(2).includes('--apply');
const runsTable = crud(TABLES.runs, { defaultSort: 'shift_date' });

const listOf = (value) =>
  String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/** One physical job: a grade, in a shift, worked out of the same set of batches. */
const jobKey = (row) =>
  [
    row.shift_date,
    row.shift ?? '',
    row.quality ?? '',
    [...listOf(row.batch_no)].sort().join('+'),
  ].join('|');

/**
 * The batch a job is filed under.
 *
 * The passes vote with the order they were typed in, and a tie goes to the
 * batch the record met first - the older one, which is the one a pass clearing
 * tailings is finishing off. The reasoning comes back with the answer so the
 * caller can print it.
 */
function leadFor(rows, firstSeen) {
  const votes = new Map();
  for (const row of rows) {
    const first = listOf(row.batch_no)[0];
    if (first) votes.set(first, (votes.get(first) ?? 0) + 1);
  }
  const ranked = [...votes].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return String(firstSeen.get(a[0]) ?? '').localeCompare(String(firstSeen.get(b[0]) ?? ''));
  });
  const [lead, count] = ranked[0];
  const tied = ranked.length > 1 && ranked[1][1] === count;
  return {
    lead,
    why: tied
      ? `${count} of ${rows.length} passes named it first, level with ${ranked[1][0]} and the older batch`
      : `${count} of ${rows.length} passes named it first`,
    votes: ranked.map(([batch, n]) => `${batch} named first by ${n}`).join(', '),
  };
}

/** Everything about to be written, on disk, before anything is written. */
function backup(payload) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `mix-comma-split-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

/** The special line's cards, keyed so before and after can be set side by side. */
const cards = (rows) => {
  const out = new Map();
  for (const u of refinerUnits(rows)) out.set(`${u.day} ${u.shift} ${u.quality}`, u);
  return out;
};

function plan(runs) {
  // When the plant first met each batch, which is the tie-break above.
  const firstSeen = new Map();
  for (const row of runs) {
    for (const batch of listOf(row.batch_no)) {
      const at = `${row.shift_date}|${row.shift === 'Day' ? 0 : 1}`;
      const seen = firstSeen.get(batch);
      if (!seen || at < seen) firstSeen.set(batch, at);
    }
  }

  const jobs = new Map();
  for (const row of runs) {
    if (listOf(row.batch_no).length < 2) continue;
    jobs.set(jobKey(row), [...(jobs.get(jobKey(row)) ?? []), row]);
  }

  const edits = [];
  const problems = [];
  const decisions = [];
  for (const [key, rows] of jobs) {
    const named = listOf(rows[0].batch_no);
    const batches = [...new Set(named)];
    if (batches.length !== named.length) {
      problems.push({ key, why: 'the same batch is named twice', batch_no: rows[0].batch_no });
      continue;
    }
    if (batches.length > 4) {
      problems.push({ key, why: 'more batches than there are columns', batch_no: rows[0].batch_no });
      continue;
    }
    const { lead, why, votes } = leadFor(rows, firstSeen);
    const ordered = [lead, ...batches.filter((batch) => batch !== lead)];
    decisions.push({ key, lead, why, votes, passes: rows.length });
    for (const row of rows) {
      edits.push({
        id: row.id,
        was: {
          batch_no: row.batch_no,
          src1: row.src1,
          src2: row.src2,
          src3: row.src3,
          src4: row.src4,
        },
        patch: {
          batch_no: lead,
          src1: ordered[0] ?? null,
          src2: ordered[1] ?? null,
          src3: ordered[2] ?? null,
          src4: ordered[3] ?? null,
        },
        where: [
          row.shift_date,
          row.shift,
          row.machine_id,
          row.quality,
          row.weight_kg == null ? 'no weight' : `${row.weight_kg} kg`,
        ].join(' '),
      });
    }
  }
  return { edits, problems, decisions };
}

async function main() {
  if (!isDbReady()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set - see server/.env.example');
  }

  const runs = await runsTable.all({});
  const { edits, problems, decisions } = plan(runs);

  logger.info(`${runs.length} runs on record, ${edits.length} holding a typed list of batches`);
  for (const d of decisions) {
    logger.info(`  ${d.key}`);
    logger.info(`     filed under ${d.lead} - ${d.why}`);
    logger.info(`     votes: ${d.votes}`);
  }
  for (const e of edits) {
    logger.info(`  ${e.where}: ${JSON.stringify(e.was.batch_no)} -> ${e.patch.batch_no}, mixed with ${e.patch.src2}`);
  }
  for (const p of problems) logger.warn(`  LEFT ALONE ${p.key}: ${p.why} (${p.batch_no})`);

  const byId = new Map(edits.map((e) => [e.id, e.patch]));
  const before = cards(runs);
  const now = cards(runs.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r)));
  // A card can be missing either half - output with nobody's hours against it,
  // or hours against nothing weighed - and printing it as 0.00 would read as a
  // figure somebody measured rather than one nothing was recorded for.
  const fix = (value, places) => (value == null ? 'not recorded' : value.toFixed(places));
  const show = (u) =>
    u ? `${u.out} kg over ${fix(u.labour, 1)} man-hours = ${fix(u.pmh, 2)} per man-hour` : 'no card';
  logger.info('special line cards that move:');
  for (const key of [...new Set([...before.keys(), ...now.keys()])].sort()) {
    if (show(before.get(key)) === show(now.get(key))) continue;
    logger.info(`  ${key}`);
    logger.info(`     was  ${show(before.get(key))}`);
    logger.info(`     now  ${show(now.get(key))}`);
  }

  if (!edits.length) {
    logger.info('Nothing to do - no run holds a typed list of batches.');
    return;
  }
  if (!apply) {
    logger.info('DRY RUN - nothing was written. Re-run with --apply to do it.');
    logger.info('A backup of every row about to change is written first.');
    return;
  }

  const file = backup({ at: new Date().toISOString(), edits });
  logger.info(`backup written to ${file}`);
  for (const e of edits) await runsTable.update(e.id, e.patch);

  // PostgREST drops a write to a column it does not know about and answers 200,
  // so the only proof the mix landed is reading it back off the table.
  const check = await runsTable.all({});
  const stuck = check.filter((r) => listOf(r.batch_no).length > 1);
  const wrong = edits.filter((e) => {
    const row = check.find((r) => r.id === e.id);
    return !row || row.batch_no !== e.patch.batch_no || (row.src2 ?? null) !== (e.patch.src2 ?? null);
  });
  if (stuck.length || wrong.length) {
    throw new Error(`${stuck.length} still hold a list and ${wrong.length} did not take the mix - see ${file}`);
  }
  logger.info(`${edits.length} runs now carry their mix in the columns that hold one, and none hold a list.`);
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
