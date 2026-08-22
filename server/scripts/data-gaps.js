/**
 * Which days the plant has no record of, from the first one it does.
 *
 *   node scripts/data-gaps.js                  -> from the earliest run on record
 *   node scripts/data-gaps.js --from=2026-03-13 -> from a day you name
 *   node scripts/data-gaps.js --to=2026-08-01   -> up to a day you name
 *   node scripts/data-gaps.js --json            -> machine-readable
 *
 * A shift that was worked and never logged looks exactly like a shift that was
 * not worked: an absent row. Nothing in the database can tell those apart, so
 * this does not claim to - it reports the shape of the hole and leaves the
 * reading of it to somebody who knows whether the plant ran that day. What it
 * can do is put the holes in front of you, which no screen in the app does:
 * every tab starts from a day that has data and works within it, so a day
 * nobody logged is a day nobody ever navigates to.
 *
 * Five questions, in the order they are worth asking:
 *
 *   1. What is the span - first and last day with any run at all.
 *   2. Which days inside that span have no runs whatsoever.
 *   3. Which days have one shift and not the other, which is the more common
 *      failure: a night crew that never opened the tablet.
 *   4. Which lines are absent on days that do have runs - the grinding line
 *      logged and the special line silent is a gap the day-level count hides.
 *   5. Which batches have never been tested, which is the Quality tab's
 *      question and cannot be answered from the runs alone.
 *
 * Weekday is printed against every gap because a plant does not run every day,
 * and a Sunday missing is not the same finding as a Wednesday missing.
 *
 * It writes nothing. Safe to run against the live project while the plant is
 * working.
 */
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { fetchAll, isDbReady } from '../src/config/supabase.js';
import { TABLES, SHIFTS } from '../src/config/constants.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : '';
};

const AS_JSON = has('--json');
const FROM = valueOf('--from');
const TO = valueOf('--to');

const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The day part of whatever the column holds, which may be a full timestamp. */
const dayOf = (value) => String(value ?? '').slice(0, 10) || null;

/**
 * Every date from `start` to `end` inclusive, as YYYY-MM-DD.
 *
 * Built in UTC on purpose. These are shift dates the crew typed, not instants,
 * so stepping them through a local timezone would shift a day either side of a
 * DST boundary and invent a gap that is not there.
 */
function everyDay(start, end) {
  const out = [];
  for (let t = Date.parse(start + 'T00:00:00Z'); t <= Date.parse(end + 'T00:00:00Z'); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const weekday = (day) => DAY_NAME[new Date(day + 'T00:00:00Z').getUTCDay()];

/** A run of consecutive days collapses to "13 Mar - 19 Mar (7 days)". */
function spans(days) {
  const out = [];
  for (const day of days) {
    const last = out[out.length - 1];
    const previous = last && new Date(Date.parse(last.to + 'T00:00:00Z') + 86400000)
      .toISOString().slice(0, 10);
    if (last && previous === day) last.to = day;
    else out.push({ from: day, to: day });
  }
  return out.map((s) => ({
    ...s,
    days: Math.round((Date.parse(s.to) - Date.parse(s.from)) / 86400000) + 1,
  }));
}

async function main() {
  if (!isDbReady()) {
    throw new Error('Set SUPABASE_URL and a key in server/.env - there is nothing to read.');
  }

  const runs = await fetchAll(TABLES.runs, {
    select: 'id,shift_date,shift,line,machine_id,batch_no,weight_kg,hours_run,kwh',
    order: 'shift_date',
    ascending: true,
  });

  const dated = runs.filter((r) => dayOf(r.shift_date));
  if (!dated.length) throw new Error('No runs carry a shift_date - nothing to compare.');

  const days = [...new Set(dated.map((r) => dayOf(r.shift_date)))].sort();
  const first = FROM || days[0];
  const last = TO || days[days.length - 1];

  // ---- 2. days with nothing at all --------------------------------------
  const present = new Set(days);
  const calendar = everyDay(first, last);
  const empty = calendar.filter((d) => !present.has(d));

  // ---- 3. days with one shift and not the other -------------------------
  const shiftsByDay = new Map();
  const linesByDay = new Map();
  for (const r of dated) {
    const day = dayOf(r.shift_date);
    if (day < first || day > last) continue;
    if (r.shift) (shiftsByDay.get(day) ?? shiftsByDay.set(day, new Set()).get(day)).add(r.shift);
    if (r.line) (linesByDay.get(day) ?? linesByDay.set(day, new Set()).get(day)).add(r.line);
  }
  const halfDays = [...shiftsByDay]
    .filter(([, s]) => s.size === 1)
    .map(([day, s]) => ({ day, has: [...s][0], missing: [...s][0] === SHIFTS.DAY ? SHIFTS.NIGHT : SHIFTS.DAY }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // ---- 4. lines absent on days that do have runs ------------------------
  const LINES = ['grind', 'special', 'coarse'];
  const lineGaps = LINES.map((line) => ({
    line,
    days: [...linesByDay].filter(([, l]) => !l.has(line)).map(([day]) => day).sort(),
  })).filter((g) => g.days.length);

  // ---- 5. batches never tested ------------------------------------------
  const tests = await fetchAll(TABLES.qualityTests, {
    select: 'id,batch_no,quality,verdict,ts',
    order: 'ts',
    ascending: true,
  }).catch(() => []);
  const testedRefs = new Set(tests.map((t) => String(t.batch_no ?? '').trim().toLowerCase()));
  const batchRefs = [...new Set(dated.map((r) => String(r.batch_no ?? '').trim()).filter(Boolean))];
  const untested = batchRefs.filter((ref) => !testedRefs.has(ref.toLowerCase())).sort();

  // ---- rows that exist but are missing their figures --------------------
  /**
   * The machines that actually put a number on a scale.
   *
   * Not "every run on a weighing line", which is the trap: the cracker weighs
   * nothing because what it cracks is weighed downstream at the grinders, PR1
   * breaks a charge down and only R2 weighs it, and an autoclave is a charge
   * rather than an output. Counting those as missing weights reports the plant
   * as having lost hundreds of figures it was never supposed to record.
   */
  const WEIGHS = ['GRD_K', 'GRD_S', 'GRD_O', 'R2', 'R4'];
  const weighed = dated.filter((r) => WEIGHS.includes(r.machine_id));
  const blankWeightRows = weighed.filter((r) => r.weight_kg == null || r.weight_kg === '');
  const blankWeight = blankWeightRows.length;
  const blankHours = dated.filter(
    (r) => r.kind !== 'autoclave' && (r.hours_run == null || r.hours_run === ''),
  ).length;
  // Only the metered machines. An autoclave has no meter on it.
  const blankKwh = weighed.filter((r) => r.kwh == null || r.kwh === '').length;

  const report = {
    span: { first, last, calendarDays: calendar.length, daysWithRuns: days.length },
    emptyDays: { count: empty.length, spans: spans(empty) },
    halfLoggedDays: halfDays,
    lineGaps,
    batches: { total: batchRefs.length, tested: batchRefs.length - untested.length, untested },
    blankFigures: { weighedRunsWithNoWeight: blankWeight, runsWithNoHours: blankHours, runsWithNoKwh: blankKwh },
    totals: { runs: dated.length, qualityTests: tests.length },
  };

  if (AS_JSON) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  const pct = (n, of) => (of ? Math.round((n / of) * 1000) / 10 : 0);

  logger.info('');
  logger.info(`Span              ${first} -> ${last}  (${calendar.length} calendar days)`);
  logger.info(`Days with runs    ${days.length}  (${pct(days.length, calendar.length)}% of the span)`);
  logger.info(`Runs on record    ${dated.length}`);
  logger.info('');

  logger.info(`--- Days with no runs at all: ${empty.length} ---`);
  for (const s of spans(empty)) {
    logger.info(
      s.days === 1
        ? `  ${s.from}  ${weekday(s.from)}`
        : `  ${s.from} -> ${s.to}  (${s.days} days)`,
    );
  }
  if (!empty.length) logger.info('  none - every day in the span has at least one run');
  logger.info('');

  logger.info(`--- Days with only one shift logged: ${halfDays.length} ---`);
  for (const d of halfDays) logger.info(`  ${d.day}  ${weekday(d.day)}  has ${d.has}, no ${d.missing}`);
  if (!halfDays.length) logger.info('  none');
  logger.info('');

  for (const gap of lineGaps) {
    logger.info(`--- Days with runs but nothing on the ${gap.line} line: ${gap.days.length} ---`);
    for (const s of spans(gap.days)) {
      logger.info(s.days === 1 ? `  ${s.from}  ${weekday(s.from)}` : `  ${s.from} -> ${s.to}  (${s.days} days)`);
    }
    logger.info('');
  }

  logger.info(`--- Batches never tested: ${untested.length} of ${batchRefs.length} ---`);
  logger.info(`  ${untested.length ? untested.join(', ') : 'none - every batch has a verdict'}`);
  logger.info('');

  logger.info(`--- Rows present but incomplete (of ${weighed.length} runs on weighing machines) ---`);
  logger.info(`  no weight   ${blankWeight}`);
  logger.info(`  no kWh      ${blankKwh}`);
  logger.info(`  no hours    ${blankHours}  (of ${dated.filter((r) => r.kind !== 'autoclave').length} non-autoclave runs)`);
  for (const r of blankWeightRows.slice(0, 20)) {
    logger.info(`    ${dayOf(r.shift_date)}  ${r.shift ?? '?'}  ${r.machine_id}  batch ${r.batch_no ?? '-'}`);
  }
  logger.info('');
  logger.info('A missing day is not proof a shift went unlogged - the plant does not');
  logger.info('run every day. The weekday is printed so you can tell the two apart.');
}

main().catch((err) => {
  logger.error(err.message);
  if (!env.supabase.url) logger.error('server/.env has no SUPABASE_URL.');
  process.exitCode = 1;
});
