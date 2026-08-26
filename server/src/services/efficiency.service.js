import { crud } from './base.service.js';
import { ApiError } from '../utils/ApiError.js';
import { rateService } from './rate.service.js';
import {
  TABLES,
  GRINDER_IDS,
  SHIFT_MINUTES,
  EFFICIENCY_THRESHOLDS as TH,
  IDEAL_AUTOCLAVES,
  idealKey,
  idealFieldFor,
  STATION_OF_MACHINE,
  SPECIAL_LINE_KEY,
} from '../config/constants.js';
import { operatorService } from './operator.service.js';

/**
 * The back office's efficiency view, computed here rather than in the browser.
 *
 * The point of this screen is accountability: did the shift make what the
 * manager said it should make, and if not, who signs the reason why. Every flag
 * on it is a comparison with an ideal off the Ideal values tab. There is one
 * exception and it is named as one - utilisation, which is measured against the
 * twelve hours of the shift itself.
 *
 * It used to carry a second comparison beside every figure: the plant's own
 * median for the same figure, across every shift on record. That is gone. A
 * median answers "is this shift worse than usual" and cannot answer "is usual
 * any good", and on a screen that exists to ask a supervisor to explain a
 * shortfall it is worse than merely unhelpful - it moves. A bad month lowers the
 * bar the next month is judged by, so the same output could be a miss in March
 * and a pass in June, and nobody could be held to either. What a shift is asked
 * about is now a figure a manager decided on and can point at.
 *
 * The whole run history is still read here rather than in the browser: the day
 * fold-up and the batch yields both need runs from outside the picked shift, and
 * that is not something to ship to a phone on the shop floor's connection.
 */

const runs = crud(TABLES.runs, { defaultSort: 'shift_date' });
const notes = crud(TABLES.efficiencyNotes, { defaultSort: 'created_at' });
const reasons = crud(TABLES.varianceReasons, { defaultSort: 'created_at' });
const machines = crud(TABLES.machines, { defaultSort: 'sort_order' });
const breakdowns = crud(TABLES.maintenance, { defaultSort: 'down_start' });

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const round = (n, d = 2) => (n == null ? null : +Number(n).toFixed(d));

/**
 * How many decimals a number is actually written to. 4.5 is one, 3 is nought.
 *
 * Read off the string rather than computed, so it answers "how precise is this
 * figure as the manager typed it" rather than "what can a float represent".
 */
const decimalsOf = (n) => {
  const s = String(n);
  const dot = s.indexOf('.');
  return dot === -1 || s.includes('e') ? 0 : s.length - dot - 1;
};

/**
 * Hours a run took. Prefers what the crew recorded over the sync timestamps -
 * `started_at`/`ended_at` are written seconds apart when a tablet flushes, so
 * subtracting them gives near-zero for every run in the plant.
 */
export function runHours(r) {
  if (num(r.hours_run) != null) return num(r.hours_run);
  if (num(r.hour_end) != null && num(r.hour_start) != null) {
    return Math.max(0, num(r.hour_end) - num(r.hour_start));
  }
  if (num(r.runtime_min) != null) return num(r.runtime_min) / 60;
  return null;
}

/** kWh for a run, from the figure or from the meter readings around it. */
/**
 * What one record cost in labour: its crew for its hours.
 *
 * Worked out per record and added up, never as the summed crew times the
 * summed hours. Those two are not the same number and the difference is not
 * small: a grade refined by 2 hands for 2.5 h and then 3 hands for 0.9 h cost
 * 7.7 labour-hours, and multiplying the sums reads 5 hands over 3.4 h = 17.
 *
 * dailyUnits has carried this warning in its own comment since it was
 * written - it folds a day out of shifts and is careful to add the shifts'
 * labour rather than multiply the day's totals. The same mistake was being
 * made one level further down, across the passes inside a single shift, where
 * nothing was guarding against it: on the special line, where one grade goes
 * through two to four passes in a shift, the labour came out 2.26 times too
 * high on 240 of 278 shift-grades, so every kg per man-hour the line has ever
 * been judged on was about half what the crew actually achieved.
 */
export function runLabour(r) {
  const crew = num(r.workers);
  const hours = runHours(r);
  if (crew == null || hours == null) return 0;
  return crew * hours;
}

/**
 * One record as a line of the shift it belongs to.
 *
 * A shift on the special line is two to four passes, often on different
 * machines and sometimes across two batches, and the shift's own figure is
 * their sum. Kept alongside the sum so the sum can be opened: "why was
 * Tuesday night 3.15" is answered by which pass was long and what it weighed,
 * and a total on its own ends that question at the paper record.
 *
 * The batch is the run's own, and a run can name more than one - the plant
 * writes "3134,3140" on a pass that worked both. So this splits by record,
 * which is a real division, rather than by batch, which would mean cutting a
 * pass in two and inventing the proportion.
 */
function runPart(r) {
  return {
    runId: r.id,
    machineId: r.machine_id ?? null,
    machine: r.machine ?? r.machine_id ?? null,
    batch: r.batch_no ?? null,
    workers: num(r.workers),
    hours: round(runHours(r), 2),
    labour: round(runLabour(r), 2),
    out: num(r.weight_kg),
    kwh: round(runKwh(r), 1),
  };
}

export function runKwh(r) {
  if (num(r.kwh) != null) return num(r.kwh);
  if (num(r.elec_end) != null && num(r.elec_start) != null) {
    return Math.max(0, num(r.elec_end) - num(r.elec_start));
  }
  return null;
}

/** One unit per shift + grade, summed across the refiner passes it went through. */
/**
 * One unit per grade per shift - the shift that weighed it out.
 *
 * A grade goes through two to four refiner passes and only the finishing one
 * is weighed. The passes need not be in the same shift: batch 3096 Special was
 * worked on R3 through the day of 15 August and finished on R4 that night.
 *
 * Attributed to the shift each pass ran in - which is what this did - that
 * batch reads as 12.4 man-hours against no output on the day, and 1,083 kg
 * against only the night's own 19.2 on the night. So the day looks like a crew
 * that produced nothing and the night like one that produced 56.4 kg per
 * man-hour, when the material actually cost 31.6 man-hours and came to 34.3.
 * Both halves wrong, in opposite directions, on a figure the plant pays an
 * incentive against. It happens to 36 of the 267 batch-grades on record.
 *
 * So the unit is the material rather than the clock: every pass on a batch and
 * grade is counted in the shift where that grade was weighed out, because that
 * is the shift whose figure the whole of the work produced. Batch yield has
 * always been attributed this way; this is the same rule reaching the rates.
 *
 * Three cases the rule has to answer, and it answers them here rather than
 * leaving them to fall out of the loop:
 *
 *   Weighed in more than one shift - 18 groups. The last weighing takes it,
 *   because that is the shift the grade was finished in. Splitting the earlier
 *   passes between them would mean inventing a proportion.
 *
 *   Never weighed at all - 16 groups, 172 man-hours, 2.6% of the line. Left
 *   out of every rate rather than charged to the shift it ran in, and this is
 *   the second half of the same fix. On 15 August the night weighed 1,083 kg
 *   of batch 3096 and also carried 18.6 hours worked on batch 3088, which has
 *   never been weighed at all - so the night read 21.6 kg per man-hour when
 *   the material it produced cost 34.3. Labour spent on one batch must not be
 *   charged against another's output, whichever shift it happened in.
 *
 *   Not lost: a rate is kilograms out over the hours that produced those
 *   kilograms, so work in progress joins the figure on the shift it is finally
 *   weighed in. These sixteen are months old and will not be - see
 *   refinerPending, which is what makes them visible rather than silently
 *   dropped. Two of them are batch numbers with the grade typed into them,
 *   "3088 special drc", which is where somebody should start.
 *
 *   A pass naming two batches - 5 runs, written "3134,3140". Kept as its own
 *   group under that literal key rather than divided, for the same reason: a
 *   pass cannot be cut in two without inventing how much of it was which.
 */
export function refinerUnits(rows) {
  /*
   * Any machine working the line, but never a vessel.
   *
   * It used to be REFINER_IDS - PR2, R1, R3, R4 - and the plant does not work
   * that way: Medium is finished on R2, which is a coarse-line machine, and
   * DRC has come off PR2. Eleven runs and 6,177 kg of Medium were dropped for
   * being on the wrong machine, and dropped by coarseUnits too for being on
   * the special line. What is on the line is what the run says it is on.
   *
   * A vessel is excluded by name, the same way coarseUnits excludes it and for
   * the same reason: 138 charges are logged on the special line carrying 4,054
   * hours, and a vessel cooking for eight hours with one hand attending is not
   * the same kind of labour-hour as a crew working a refiner. Averaged in they
   * would make the line's kg per man-hour four times too lax.
   */
  const onTheLine = rows.filter(
    (r) => r.line === 'special' && r.quality && r.kind !== 'autoclave',
  );

  /** The material: one batch worked into one grade, however many passes. */
  const slotOf = (r) => `${r.shift_date}|${r.shift ?? ''}`;
  const byMaterial = new Map();
  for (const r of onTheLine) {
    const key = `${r.batch_no ?? ''}|${r.quality}`;
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), r]);
  }

  /**
   * Where each pass is counted: the shift its grade was weighed out in.
   *
   * Built as a map from run to slot rather than by moving rows about, so the
   * aggregation below stays the single pass it was and nothing is counted
   * twice by an accident of ordering.
   */
  const homeOf = new Map();
  for (const group of byMaterial.values()) {
    const weighed = group
      .filter((r) => (num(r.weight_kg) ?? 0) > 0)
      .sort((a, b) => slotOf(a).localeCompare(slotOf(b)));
    // Never weighed means no shift owns it yet - see the note above.
    if (!weighed.length) continue;
    const home = slotOf(weighed[weighed.length - 1]);
    for (const r of group) homeOf.set(r.id, home);
  }

  const byKey = new Map();
  for (const r of onTheLine) {
    const home = homeOf.get(r.id);
    if (!home) continue;
    const [day, shift] = home.split('|');
    const key = `${home}|${r.quality}`;
    const u = byKey.get(key) ?? {
      day, shift, quality: r.quality,
      out: 0, workers: 0, hours: 0, labour: 0, kwh: 0, batches: new Set(), parts: [],
    };
    /*
     * The pass carries the shift it actually ran in, where that is not the
     * shift it is counted in. The figure belongs to the weighing shift and the
     * hours were still worked when they were worked - a detail panel that said
     * otherwise would be answering "when did this happen" with the wrong night.
     */
    u.parts.push({ ...runPart(r), ranOn: r.shift_date ?? null, ranIn: r.shift ?? null });
    u.workers += num(r.workers) ?? 0;
    u.hours += runHours(r) ?? 0;
    u.labour += runLabour(r);
    u.kwh += runKwh(r) ?? 0;
    if (r.batch_no) u.batches.add(r.batch_no);
    /*
     * Whatever the line weighed, on whichever machine weighed it.
     *
     * This used to count R4 alone, on the reasoning that the earlier passes are
     * the same material moving on and counting their weights too would
     * double-count the shift. The first half of that is right and the
     * conclusion was not: a pass that is only moving material on does not get
     * weighed at all, and a weighed pass is one that finished a grade. Medium
     * is finished on R2 and 14,618 kg fell between this and coarseUnits.
     */
    const w = num(r.weight_kg);
    if (w != null && w > 0) u.out += w;
    byKey.set(key, u);
  }

  return [...byKey.values()].map((u) => ({
    ...u,
    batches: [...u.batches],
    pmh: u.out > 0 && u.labour > 0 ? u.out / u.labour : null,
    kwhkg: u.out > 0 && u.kwh > 0 ? u.kwh / u.out : null,
  }));
}

/** One unit per grinder per shift. The cracker has no output, so it drops out. */
export function grinderUnits(rows) {
  const byKey = new Map();
  for (const r of rows) {
    if (r.line !== 'grind' || !GRINDER_IDS.includes(r.machine_id)) continue;
    const w = num(r.weight_kg);
    if (w == null || w <= 0) continue;
    const key = `${r.machine_id}|${r.shift_date}|${r.shift ?? ''}`;
    const u = byKey.get(key) ?? {
      machineId: r.machine_id, machine: r.machine ?? r.machine_id,
      day: r.shift_date, shift: r.shift ?? '',
      out: 0, workers: 0, hours: 0, labour: 0, kwh: 0, parts: [],
    };
    u.parts.push(runPart(r));
    u.out += w;
    u.workers += num(r.workers) ?? 0;
    u.hours += runHours(r) ?? 0;
    u.labour += runLabour(r);
    u.kwh += runKwh(r) ?? 0;
    byKey.set(key, u);
  }
  return [...byKey.values()].map((u) => ({
    ...u,
    pmh: u.out > 0 && u.labour > 0 ? u.out / u.labour : null,
    kwhkg: u.out > 0 && u.kwh > 0 ? u.kwh / u.out : null,
    // Capped at 1.5 so a mis-keyed hour meter cannot report 400% utilisation.
    util: u.hours > 0 ? Math.min(1.5, u.hours / (SHIFT_MINUTES / 60)) : null,
  }));
}

/**
 * Material the special line worked and never weighed out.
 *
 * refinerUnits leaves these out of every rate, because a rate is kilograms
 * out over the hours that produced those kilograms and this labour produced
 * none that anybody recorded. Left in, it is charged against some other
 * batch's output on whichever shift it happened to run in.
 *
 * Exported so that exclusion is a thing somebody can look at rather than a
 * silence. 172 man-hours over sixteen groups on the record as it stands, and
 * two of those groups are batch numbers with the grade typed into them.
 */
export function refinerPending(rows) {
  const line = rows.filter(
    (r) => r.line === 'special' && r.quality && r.kind !== 'autoclave',
  );
  const byMaterial = new Map();
  for (const r of line) {
    const key = `${r.batch_no ?? ''}|${r.quality}`;
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), r]);
  }

  const out = [];
  for (const group of byMaterial.values()) {
    if (group.some((r) => (num(r.weight_kg) ?? 0) > 0)) continue;
    const days = group.map((r) => r.shift_date).filter(Boolean).sort();
    out.push({
      batch: group[0].batch_no ?? null,
      quality: group[0].quality,
      passes: group.length,
      labour: round(group.reduce((sum, r) => sum + runLabour(r), 0), 2),
      hours: round(group.reduce((sum, r) => sum + (runHours(r) ?? 0), 0), 2),
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
    });
  }
  return out.sort((a, b) => b.labour - a.labour);
}

/**
 * A day's figures for a line, folded up out of its shifts.
 *
 * The two efficiency benchmarks - kWh per kg and kg per man-hour - are set
 * against the day rather than the shift, because that is the figure the plant
 * actually judges by: a night shift that ran four hours on a line the day shift
 * had already warmed up is not a worse crew, and comparing each half against a
 * whole-day target would say it was.
 *
 * Labour-hours are summed per shift and then added, not summed across the day
 * and multiplied: crew × hours has to be worked out while the crew and the hours
 * still belong to the same shift, or a day with 2 hands over 12 h and 3 over 4 h
 * reads as 5 hands over 16 h - eighty labour-hours where the plant spent thirty-
 * six.
 */
export function dailyUnits(units, keyOf) {
  const byKey = new Map();
  for (const u of units) {
    const id = keyOf(u);
    const mapKey = `${id}|${u.day}`;
    // Built field by field rather than spread off the first shift: `workers`,
    // `hours` and `util` belong to that one shift, and a day carrying one
    // shift's crew is a figure somebody will eventually read as the day's.
    const d = byKey.get(mapKey) ?? {
      key: id,
      day: u.day,
      machineId: u.machineId ?? null,
      machine: u.machine ?? null,
      quality: u.quality ?? null,
      out: 0,
      kwh: 0,
      labourHours: 0,
      shifts: 0,
    };
    d.out += u.out ?? 0;
    d.kwh += u.kwh ?? 0;
    // The shift's own labour, already worked out record by record - see
    // runLabour. Multiplying this shift's summed crew by its summed hours
    // here would put the very mistake back that the note above warns about.
    d.labourHours += u.labour ?? 0;
    d.shifts += 1;
    byKey.set(mapKey, d);
  }
  return [...byKey.values()].map((d) => ({
    ...d,
    pmh: d.out > 0 && d.labourHours > 0 ? d.out / d.labourHours : null,
    kwhkg: d.out > 0 && d.kwh > 0 ? d.kwh / d.out : null,
  }));
}

/**
 * Yield per batch. A batch is charged in one shift and finishes in another, so
 * it is attributed to the shift its R4 output was weighed in - that is the
 * shift whose crew the number actually reflects.
 */
function batchYields(rows) {
  const byBatch = new Map();
  for (const r of rows) {
    if (r.line !== 'special' || !r.batch_no) continue;
    const u = byBatch.get(r.batch_no) ?? {
      batch: r.batch_no, charge: null, out: 0, outDay: null, outShift: null,
    };
    if (r.kind === 'autoclave' && num(r.capacity) != null) u.charge = num(r.capacity);
    /*
     * The same rule as refinerUnits above, and for the same reason: a batch's
     * yield is everything that came off it, and the Medium finished on R2 is
     * part of what the charge gave back. Counting R4 alone understated the
     * yield of every batch that had a grade finished elsewhere.
     */
    const w = num(r.weight_kg);
    if (w != null && w > 0) {
      u.out += w;
      if (r.shift_date) {
        u.outDay = r.shift_date;
        u.outShift = r.shift ?? '';
      }
    }
    byBatch.set(r.batch_no, u);
  }
  return [...byBatch.values()]
    .map((u) => ({ ...u, pct: u.charge && u.out > 0 ? (u.out / u.charge) * 100 : null }))
    .filter((u) => u.pct != null);
}

/**
 * The coarse line's shift, as one unit.
 *
 * The line is two machines - PR1 breaks the charge down and R2 works it - and
 * only R2 weighs, so a shift's coarse output is the sum of what the line weighed
 * rather than anything per-machine. It has a card because the manager sets an
 * ideal against it, and a target with nothing beside it is a number in a form.
 */
export function coarseUnits(rows) {
  /*
   * The two coarse machines, not the vessels that feed them.
   *
   * A coarse-form autoclave charge is logged with `line: 'coarse'` - correctly,
   * it is coarse work - and there are 354 of them carrying 9,147 labour-hours
   * against PR1 and R2's 4,777. Counted as the line's labour they put its
   * productivity at about 51 kg/man-hour where the line itself runs at about
   * 149: a vessel cooking for eight hours with one hand attending is not the
   * same kind of labour-hour as a crew working a refiner, and a benchmark built
   * on the mixture would be three times too lax on the crew it is meant to hold
   * to account. A grinder is measured on its own crew and so is this.
   *
   * They carry no meter either, so they were never in the energy figure.
   */
  const onTheLine = rows.filter((r) => r.line === 'coarse' && r.kind !== 'autoclave');

  /*
   * The line is two machines and one flow: PR1 pre-refines and never weighs
   * anything - nought of its 103 passes on record - and R2 finishes and always
   * does, all 104 of its own. So PR1's crew is half the labour that made every
   * kilogram R2 books, and a shift counted on its own passes alone is counted
   * on whichever half of the line happened to be logged against it.
   *
   * On 89 of the 91 days the line has run, both machines are logged in the same
   * shift and the question does not arise. On 16 August it did: PR1 worked 31.2
   * man-hours through the day, R2 weighed out 7,046 kg that night, and the night
   * was credited with 546.2 kg per man-hour on its own 12.9 - three and a half
   * times what the line does, on a figure the plant pays an incentive against,
   * while the day showed no card at all for a shift that had worked the line all
   * day.
   *
   * So a pass is counted in the shift the line weighed out in, which is the same
   * rule the special line follows. Scoped to the production day rather than
   * chained to the next weighing whenever it falls: material moves through a
   * buffer here rather than as a batch anybody can trace, so past midnight the
   * record cannot say which pre-refining fed which weighing, and a rule that
   * guessed would rewrite the 89 ordinary days to answer the two odd ones.
   */
  const slotOf = (r) => `${r.shift_date}|${r.shift ?? ''}`;
  const weighs = (r) => (num(r.weight_kg) ?? 0) > 0;

  const weighedIn = new Map();
  for (const r of onTheLine) {
    if (!weighs(r)) continue;
    const slots = weighedIn.get(r.shift_date) ?? new Set();
    slots.add(slotOf(r));
    weighedIn.set(r.shift_date, slots);
  }

  /**
   * Where each pass is counted.
   *
   * Its own shift wherever that shift weighed, which is every ordinary day and
   * leaves them exactly as they were. Otherwise the day's one weighing shift.
   * If the day weighed nothing at all, no shift owns the labour - see
   * coarsePending, which is what keeps that visible rather than silent.
   */
  const homeOf = new Map();
  for (const r of onTheLine) {
    const slots = weighedIn.get(r.shift_date);
    if (!slots?.size) continue;
    if (slots.has(slotOf(r))) homeOf.set(r.id, slotOf(r));
    else if (slots.size === 1) homeOf.set(r.id, [...slots][0]);
  }

  const byKey = new Map();
  for (const r of onTheLine) {
    const home = homeOf.get(r.id);
    if (!home) continue;
    const [day, shift] = home.split('|');
    const u = byKey.get(home) ?? {
      day, shift,
      out: 0, workers: 0, hours: 0, labour: 0, kwh: 0, parts: [],
    };
    // The pass carries the shift it actually ran in, for the same reason the
    // special line's does: the figure belongs to the weighing shift and the
    // hours were still worked when they were worked.
    u.parts.push({ ...runPart(r), ranOn: r.shift_date ?? null, ranIn: r.shift ?? null });
    u.out += num(r.weight_kg) ?? 0;
    u.workers += num(r.workers) ?? 0;
    u.hours += runHours(r) ?? 0;
    u.labour += runLabour(r);
    u.kwh += runKwh(r) ?? 0;
    byKey.set(home, u);
  }

  // The same two rates every other line is judged on. The line has always
  // carried the figures they are made of - crew, hours and the meter - and only
  // ever reported what it weighed, so a shift could miss on energy or on labour
  // and the screen had nothing to say about it.
  return [...byKey.values()]
    .filter((u) => u.out > 0)
    .map((u) => ({
      ...u,
      pmh: u.out > 0 && u.labour > 0 ? u.out / u.labour : null,
      kwhkg: u.out > 0 && u.kwh > 0 ? u.kwh / u.out : null,
    }));
}

/**
 * Coarse work on days the line never weighed anything out.
 *
 * The same exclusion refinerPending covers, for the same reason: a rate is
 * kilograms over the hours that produced those kilograms, and this labour
 * produced none that anybody recorded. It cannot be carried to the next day
 * the line ran either - there is no batch on this line to carry it with.
 *
 * One day on the record, 9 March, where PR1 worked 24.6 man-hours and neither
 * shift weighed. Exported so that is a thing somebody can look at rather than a
 * silence, because the other direction of the same gap is not fixable here
 * either: on 9 April R2 weighed 4,767 kg with no pre-refining logged anywhere
 * that day, and it reads at 397 kg per man-hour because half its line is
 * missing from the record rather than from the arithmetic.
 */
export function coarsePending(rows) {
  const onTheLine = rows.filter((r) => r.line === 'coarse' && r.kind !== 'autoclave');
  const byDay = new Map();
  for (const r of onTheLine) byDay.set(r.shift_date, [...(byDay.get(r.shift_date) ?? []), r]);

  const out = [];
  for (const [day, group] of byDay) {
    if (group.some((r) => (num(r.weight_kg) ?? 0) > 0)) continue;
    out.push({
      day: day ?? null,
      shifts: [...new Set(group.map((r) => r.shift).filter(Boolean))].sort(),
      machines: [...new Set(group.map((r) => r.machine_id).filter(Boolean))].sort(),
      passes: group.length,
      labour: round(group.reduce((sum, r) => sum + runLabour(r), 0), 2),
      hours: round(group.reduce((sum, r) => sum + (runHours(r) ?? 0), 0), 2),
    });
  }
  return out.sort((a, b) => b.labour - a.labour);
}

/**
 * How many charges each vessel took on a day.
 *
 * Counted per day rather than per shift on purpose: a vessel is charged, cooked
 * and emptied across whatever shift boundary happens to fall in the middle, so a
 * per-shift count would report the same day's work differently depending on when
 * the crew changed over. The manager's benchmark is per day for the same reason.
 *
 * A run is one charge. The load is what opens it, so counting the runs on the
 * vessel counts the charges it took.
 */
function autoclaveRunsByDay(rows) {
  const byKey = new Map();
  for (const r of rows) {
    if (r.kind !== 'autoclave' || !r.shift_date) continue;
    const key = `${r.machine_id}|${r.shift_date}`;
    const u = byKey.get(key) ?? {
      machineId: r.machine_id, machine: r.machine ?? r.machine_id, day: r.shift_date,
      runs: 0, hours: 0, timed: 0,
    };
    u.runs += 1;
    // Only the charges that recorded a time. A charge whose duration was
    // never written down is not a charge that took nought hours, and
    // averaging it in as one would report the vessel as twice as quick.
    const h = runHours(r);
    if (h != null && h > 0) {
      u.hours += h;
      u.timed += 1;
    }
    byKey.set(key, u);
  }
  return [...byKey.values()].map((u) => ({
    ...u,
    cycle: u.timed > 0 ? u.hours / u.timed : null,
  }));
}

/**
 * Each charge on a vessel in one shift, and how long it took.
 *
 * Per shift and per charge, which is a different span from the count above and
 * deliberately so. How many charges a vessel got through is a fact about how
 * much work there was - a quiet day is not a slow vessel, and the crew cannot
 * answer for it - and it is counted per day because a charge crosses the
 * handover. How long each charge took is the vessel's own, it belongs to the
 * charge rather than to the day, and it is the figure that moves when a valve
 * is passing or the fire is not being kept up.
 */
function autoclaveCharges(rows) {
  return rows
    .filter((r) => r.kind === 'autoclave')
    .map((r) => ({
      id: r.id,
      machineId: r.machine_id,
      batch: r.batch_no ?? null,
      startedAt: r.started_at ?? null,
      hours: runHours(r),
      charge: num(r.capacity),
    }))
    .sort((a, b) => String(a.startedAt ?? '').localeCompare(String(b.startedAt ?? '')));
}

/**
 * One measured figure against the manager's benchmark for it.
 *
 * `offTarget` is the whole point of `lowerIsBetter`: more kg is better and fewer
 * kWh per kg is better, and a comparison that does not know the difference flags
 * every good shift the energy line ever has. A shift that beats its target is
 * not flagged and is still shown its variance - the number is worth reading
 * either way round.
 *
 * An unset benchmark compares to nothing and flags nothing. That is not the same
 * as a target of zero, and it is why an unset figure is stored as null.
 */
function againstIdeal(value, ideal, { lowerIsBetter = false, digits = 2 } = {}) {
  const target = ideal == null || !Number.isFinite(Number(ideal)) ? null : Number(ideal);
  /**
   * Never round coarser than the target itself is written.
   *
   * `digits` is the precision the measured figure is worth showing at, and for a
   * count of autoclave charges that is nought - you cannot take a third of a
   * charge. But the target is an average over a day and 4.5 is a perfectly
   * ordinary thing to ask for, and at nought decimals the screen reported it as
   * 5 and a shift that took 3 as two charges short. It is one and a half short.
   *
   * The percentage was right throughout, which is what makes this the kind of
   * error nobody catches: -33.3% beside "-2 runs" is arithmetic that does not
   * check out, and the reader is left to work out which of the two to believe.
   *
   * Capped, because a target stored as 0.30000000000000004 would otherwise drag
   * seventeen decimals onto the card.
   */
  const places = target == null ? digits : Math.min(4, Math.max(digits, decimalsOf(target)));
  if (value == null || target == null) {
    return { ideal: round(target, places), variance: null, variancePct: null, offTarget: false };
  }
  const variance = value - target;
  return {
    ideal: round(target, places),
    variance: round(variance, places),
    // A target of nought has no percentage to be off by - anything over it is
    // infinitely better, which is not a figure to put on a screen.
    variancePct: target === 0 ? null : round((variance / target) * 100, 1),
    offTarget: lowerIsBetter ? value > target : value < target,
  };
}

/**
 * The comparison attached to a metric, ready for the screen: the ideal, the
 * variance, and the key a reason for it would be filed under.
 *
 * `parameter` travels with the metric rather than being rebuilt on the client,
 * so a reason is filed against the benchmark's own key and stays attached to the
 * figure it explains however the screen is laid out later.
 */
function idealFor(key, value, ideals, digits = 2) {
  const field = idealFieldFor(key);
  const lowerIsBetter = field?.lowerIsBetter ?? false;
  const comparison = againstIdeal(value, ideals?.[key], { lowerIsBetter, digits });
  return {
    parameter: key,
    idealLabel: field?.label ?? null,
    /**
     * Which way is good, sent to the screen rather than left for it to infer.
     *
     * Two figures on one card can both be above their target and only one of
     * them be in trouble: 12.8 kg/man-hour against 12.5 is a crew beating its
     * benchmark, and 0.214 kWh/kg against 0.202 is the same rubber costing more
     * electricity to make. Without this the screen draws "+2.7%" and "+5.8%" the
     * same way and colours one of them red for no reason a reader can see, which
     * reads as a bug in the screen rather than a fact about the plant.
     */
    lowerIsBetter,
    ...comparison,
  };
}

/*
 * There was a `noTargetHere` helper here, for a figure shown on a card with
 * nothing to compare it against. It has no callers left and it is not coming
 * back: every figure on this screen is now measured against something a manager
 * set, or - utilisation alone - against the twelve hours of the shift itself.
 *
 * The two that used it are gone for different reasons. Energy and labour used to
 * be shown per shift and compared on a second card at the foot of the page; they
 * are compared on the one card now. A grade's shift output used to be shown with
 * no target on principle, since the split between grades follows demand rather
 * than the crew - that figure is still on the card, in the line under the grade,
 * but it is no longer dressed as a metric whose verdict column is permanently
 * blank. A row on this screen that never has an answer teaches people to skim
 * past the rows that do.
 */

/**
 * How finely each unit is worth reading. kWh per kg moves in the third place -
 * 0.202 against 0.214 is the plant's whole energy argument - and a count of
 * charges has no decimals at all, because there is no third of a charge.
 */
const DIGITS_OF = {
  'kWh/kg': 3,
  kg: 0,
  charges: 0,
  '%': 1,
  'kg/man-h': 2,
};

/**
 * The special line read one batch at a time, instead of one shift at a time.
 *
 * Every other figure in here is a shift's: what a crew got out of the hours
 * they worked. That answers "was last night a good night" and cannot answer the
 * question the plant is actually stuck on, which is what to do with a charge
 * once it is out of the vessel.
 *
 * The grades come off the special line in sequence - Special first, then the
 * finer cuts out of what is left - and which of them are taken is decided by
 * what the market is asking for that week. Special and skip SuperFine, then
 * Fine and Medium. Sometimes Fine alone. Sometimes Special, SuperFine and
 * Medium. Each of those is a different amount of refining done to the same
 * 2,200 kg, and the plant has never been able to see what each one costs,
 * because the cost lands in whichever shifts the batch happened to straddle.
 *
 * A batch is the unit that holds that decision, so this reads the record by
 * batch: what came out of one charge, what it cost in labour and electricity,
 * and in what order the grades were taken. Two batches worked the same way are
 * then comparable in a way that two shifts never were.
 *
 * THE WHOLE LIFE OF THE BATCH, always, whatever window is asked for. A window
 * that cut a batch in half would report the passes inside it against output
 * weighed outside it, which is the error this is meant to end rather than
 * repeat. `from` and `to` choose which batches are listed, by whether the batch
 * worked at all in that period; the figures against each one are its own from
 * charge to last weighing.
 *
 * WHAT IT REFUSES TO RANK. A ranking is a recommendation, and a recommendation
 * built on a defective record sends somebody off to copy a batch that was
 * never worked the way the record says. Three defects make a batch's rate
 * arithmetically wrong rather than merely unflattering, and they are common
 * enough to matter:
 *
 *   A pass with no crew recorded counts as nought labour. Seven passes on the
 *   record, and batch 2920 tops the plant at 281 kg per man-hour on the
 *   strength of three of them - which is not a batch anybody should study.
 *   A pass with impossible hours: 88.2 hours inside a twelve-hour shift is a
 *   slipped decimal, and it puts batch 3018 last on the plant at 11.2.
 *   A pass repeating another's meter readings exactly - the same machine
 *   crossing the same meter twice - is one pass entered twice.
 *
 * Those batches are still returned, with what is wrong with them named, and
 * they are kept out of the comparison rather than out of sight. Two further
 * marks limit what a batch can be compared on without making its rate wrong:
 * a batch mixed with another carries output that was not charged as itself, so
 * its yield means nothing though its labour is sound; and a batch with no
 * charge on record has nothing to yield against at all.
 */
/**
 * Passes entered twice, found by the meters rather than by the figures.
 *
 * Two passes on the same machine can weigh the same and run the same hours -
 * that is a plant working steadily. What they cannot do is start and finish at
 * the same reading on both meters: the electricity meter and the hour meter
 * only ever move forward, so the same span on both is one pass on the record
 * twice, whatever dates were typed against them.
 *
 * Returns the later ones, so the first entry of a pass is the one that counts.
 */
export function enteredTwice(passes) {
  const spans = new Map();
  for (const r of passes) {
    if (r.elec_start == null || r.hour_start == null) continue;
    const key = [
      r.machine_id, r.batch_no ?? '', r.quality ?? '',
      r.elec_start, r.elec_end, r.hour_start, r.hour_end,
    ].join('|');
    spans.set(key, [...(spans.get(key) ?? []), r]);
  }
  const twice = new Set();
  for (const group of spans.values()) {
    for (const r of group.slice(1)) twice.add(r.id);
  }
  return twice;
}

/**
 * What is wrong with a set of passes, in the reader's words rather than a code.
 *
 * Shared by the batch view and the coarse view so that both mean the same thing
 * by a defective record. Each fault names the passes it came from, because "a
 * pass with no crew" is a thing somebody can go and fix and "flagged" is not.
 *
 * These three make a rate arithmetically wrong rather than merely unflattering,
 * which is the line that decides whether a figure may be ranked: a ranking is a
 * recommendation, and a recommendation built on a pass with nobody on it sends
 * somebody off to copy work that was never done the way the record says.
 */
export function faultsIn(passes, twice) {
  const faults = [];
  const s = (n) => (n === 1 ? '' : 'es');

  const noCrew = passes.filter((r) => num(r.workers) == null || num(r.workers) === 0);
  if (noCrew.length) {
    faults.push({
      key: 'no-crew',
      what: `${noCrew.length} pass${s(noCrew.length)} with no crew recorded`,
      why: 'a pass with nobody on it counts as no labour, which lifts the rate for work that was done',
      passes: noCrew.map((r) => r.id),
    });
  }

  const wildHours = passes.filter((r) => {
    const hours = runHours(r);
    return hours == null || hours === 0 || hours > 24;
  });
  if (wildHours.length) {
    faults.push({
      key: 'hours',
      what: `${wildHours.length} pass${s(wildHours.length)} with hours a shift cannot hold`,
      why: 'the hours are missing or a slipped decimal, so the labour here is not what the work cost',
      passes: wildHours.map((r) => r.id),
    });
  }

  const repeats = passes.filter((r) => twice.has(r.id));
  if (repeats.length) {
    faults.push({
      key: 'entered-twice',
      what: `${repeats.length} pass${s(repeats.length)} entered twice`,
      why: 'the same machine crossing the same meters twice is one pass on the record twice, so both its kilograms and its hours are doubled',
      passes: repeats.map((r) => r.id),
    });
  }

  return faults;
}

export function batchUnits(rows) {
  const passes = rows.filter(
    (r) => r.line === 'special' && r.quality && r.kind !== 'autoclave' && r.batch_no,
  );
  const charges = rows.filter((r) => r.kind === 'autoclave' && r.batch_no);

  const twice = enteredTwice(passes);

  /*
   * The order the passes were worked in, which the recipe depends on and which
   * takes two keys to recover.
   *
   * The shift first. Then `started_at` inside it - which is when the record was
   * typed rather than when the machine ran, and is still the right tie-break:
   * a supervisor transcribing a shift sheet works down it in order, so the
   * typing order is the sheet's order even on a batch entered three months
   * late.
   *
   * Without it the passes of one shift come back in whatever order the table
   * hands them over, and that is not a small thing here. Sorted by shift alone
   * the plant appears to work 44 batches Special-then-Fine and 8 the other way
   * about; by the sheet it is 51 and 1. The eight were one recipe cut in two,
   * and a comparison of how the plant works cannot afford to invent a practice
   * out of row order.
   */
  const slot = (r) => `${r.shift_date}|${r.shift === 'Day' ? 0 : 1}`;
  const worked = (a, b) =>
    slot(a).localeCompare(slot(b))
    || String(a.started_at ?? '').localeCompare(String(b.started_at ?? ''));

  const byBatch = new Map();
  for (const r of passes) byBatch.set(r.batch_no, [...(byBatch.get(r.batch_no) ?? []), r]);

  const out = [];
  for (const [batch, group] of byBatch) {
    const sorted = [...group].sort(worked);
    const charge = charges.find((c) => c.batch_no === batch) ?? null;

    const kg = sorted.reduce((sum, r) => sum + (num(r.weight_kg) ?? 0), 0);
    const labour = sorted.reduce((sum, r) => sum + runLabour(r), 0);
    const kwh = sorted.reduce((sum, r) => sum + (runKwh(r) ?? 0), 0);
    const charged = charge ? num(charge.capacity) : null;

    /* The order the grades were taken in - the decision this is here to show. */
    const recipe = [];
    for (const r of sorted) if (!recipe.includes(r.quality)) recipe.push(r.quality);

    const cuts = [];
    for (const quality of recipe) {
      const cut = sorted.filter((r) => r.quality === quality);
      const gKg = cut.reduce((sum, r) => sum + (num(r.weight_kg) ?? 0), 0);
      const gLabour = cut.reduce((sum, r) => sum + runLabour(r), 0);
      const gKwh = cut.reduce((sum, r) => sum + (runKwh(r) ?? 0), 0);
      cuts.push({
        quality,
        out: round(gKg, 0),
        labour: round(gLabour, 2),
        kwh: round(gKwh, 1),
        passes: cut.length,
        pmh: gKg > 0 && gLabour > 0 ? round(gKg / gLabour, 2) : null,
        kwhkg: gKg > 0 && gKwh > 0 ? round(gKwh / gKg, 3) : null,
        /** What share of everything the batch gave up came off as this grade. */
        share: kg > 0 ? round((gKg / kg) * 100, 1) : null,
      });
    }

    const mixedWith = [
      ...new Set(
        sorted.flatMap((r) => [r.src2, r.src3, r.src4])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
      ),
    ];

    /*
     * What is wrong with the record of this batch, in the reader's words rather
     * than a code. Each one names the pass it came from, because "a pass with no
     * crew" is a thing somebody can go and fix and "flagged" is not.
     */
    const faults = faultsIn(sorted, twice);

    /* These two do not make the labour wrong, only the yield unreadable. */
    const limits = [];
    if (!charge) {
      limits.push({
        key: 'no-charge',
        what: 'no autoclave charge on record',
        why: 'there is nothing to measure the output against, so this batch has no yield',
      });
    }
    if (mixedWith.length) {
      limits.push({
        key: 'mixed',
        what: `worked together with ${mixedWith.join(' and ')}`,
        why: 'the output includes material that was not charged as this batch, so its yield reads high and the other batch reads starved - the labour and the electricity are still its own',
      });
    }

    const days = [...new Set(sorted.map((r) => r.shift_date).filter(Boolean))].sort();
    out.push({
      batch,
      formulation: charge?.formulation?.trim() ?? null,
      /*
       * The product, without the charge size: "Special 2200" and "Special 2500"
       * are the same thing made in two vessel sizes and belong in one
       * comparison, and DRC is a different product that does not belong in it
       * at all. It comes off in one pass at the charge weight and reads at 126
       * kg per man-hour, which would sit at the top of any ranking of how to
       * work a Special charge and answer a question nobody asked.
       */
      family: charge?.formulation ? String(charge.formulation).trim().split(/\s+/)[0] : null,
      charged,
      chargedOn: charge?.shift_date ?? null,
      chargedShift: charge?.shift ?? null,
      out: round(kg, 0),
      labour: round(labour, 2),
      kwh: round(kwh, 1),
      pmh: kg > 0 && labour > 0 ? round(kg / labour, 2) : null,
      kwhkg: kg > 0 && kwh > 0 ? round(kwh / kg, 3) : null,
      /** Suppressed rather than computed where it cannot be read - see limits. */
      yieldPct:
        charged && charged > 0 && !mixedWith.length ? round((kg / charged) * 100, 1) : null,
      recipe,
      recipeKey: recipe.join(' › '),
      cuts,
      mixedWith,
      passes: sorted.length,
      machines: [...new Set(sorted.map((r) => r.machine_id).filter(Boolean))].sort(),
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
      shifts: [...new Set(sorted.map((r) => `${r.shift_date} ${r.shift ?? ''}`.trim()))].length,
      faults,
      limits,
      /** Sound enough to rank. Yield may still be absent - see yieldPct. */
      comparable: faults.length === 0,
      parts: sorted.map((r) => ({
        ...runPart(r),
        quality: r.quality,
        day: r.shift_date ?? null,
        shift: r.shift ?? null,
        entered: twice.has(r.id) ? 'twice' : null,
      })),
    });
  }

  return out.sort((a, b) => String(b.lastDay).localeCompare(String(a.lastDay)));
}

/**
 * The same batches gathered by how they were taken.
 *
 * One batch is an anecdote. The plant's question is which way of working a
 * charge pays, and that is a question about the group: forty-two batches taken
 * Special then Fine against fifteen taken as Fine alone.
 *
 * Only sound batches count towards a recipe - see batchUnits - and only batches
 * that were charged and not mixed count towards its yield, because a mixed
 * batch's kilograms are partly another batch's. Recipes worked once are still
 * returned, marked by their count: they are not evidence of anything, and
 * hiding them would hide that somebody tried it.
 */
export function recipeSummary(batches) {
  const byRecipe = new Map();
  for (const b of batches) {
    if (!b.comparable || !(b.out > 0) || b.pmh == null) continue;
    const key = `${b.family ?? 'Unknown'}|${b.recipeKey}`;
    byRecipe.set(key, [...(byRecipe.get(key) ?? []), b]);
  }

  const mean = (list, pick) => {
    const values = list.map(pick).filter((v) => v != null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  return [...byRecipe]
    .map(([key, list]) => ({
      key,
      family: list[0].family ?? null,
      recipeKey: list[0].recipeKey,
      recipe: list[0].recipe,
      batches: list.length,
      refs: list.map((b) => b.batch),
      out: round(mean(list, (b) => b.out), 0),
      pmh: round(mean(list, (b) => b.pmh), 2),
      kwhkg: round(mean(list, (b) => b.kwhkg), 3),
      yieldPct: round(mean(list, (b) => b.yieldPct), 1),
      /** How many of them the yield is an average of, which is not all of them. */
      yieldFrom: list.filter((b) => b.yieldPct != null).length,
      best: list.reduce((a, b) => (b.pmh > a.pmh ? b : a)).batch,
    }))
    .sort((a, b) => (b.pmh ?? 0) - (a.pmh ?? 0));
}

/**
 * The coarse line read one shift at a time, which is the only unit it has.
 *
 * The special line hangs its record on a batch number and this one does not:
 * PR1 and R2 work a continuous flow out of a buffer, and no pass on the line
 * carries a batch at all. So the shift is the unit, which suits the question
 * anyway - the plant wants the most out of a shift, and here a shift is a thing
 * that can be compared with the shift before it.
 *
 * Built on coarseUnits, so a shift already carries the pre-refining that fed it
 * wherever that ran. What is added here is what a comparison needs and a card
 * does not: which machines worked it, what is wrong with the record, and the
 * grouping underneath.
 *
 * NO YIELD PER SHIFT, deliberately, though every coarse charge on the record
 * carries its capacity and it would be a simple division. The line is charged
 * on the night shift and refined on the day - of 103 shifts that weighed
 * anything, 85 are day shifts, and the vessels that fed them were cooking
 * overnight. Divided inside one shift that reads 292% on 17 August and 57% on
 * the 19th, and both are arithmetic about a buffer rather than facts about a
 * crew. Over a window the same division is worth having and it is on the
 * summary, where the buffer averages out: 735,728 kg weighed against 859,900
 * charged over the record as it stands.
 */
export function coarseShifts(rows) {
  const onTheLine = rows.filter((r) => r.line === 'coarse' && r.kind !== 'autoclave');
  const twice = enteredTwice(onTheLine);
  const byId = new Map(onTheLine.map((r) => [r.id, r]));

  /*
   * What this line normally does, from its own record, so that a figure it has
   * never come near can be told from a good shift.
   *
   * Medians rather than means: the whole point is to be unmoved by the outlier
   * being looked for. The line weighs between about three-quarters and one and
   * a half times its median on nearly every shift it has ever worked.
   */
  const middle = (values) => {
    const sorted = values.filter((v) => v != null && v > 0).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const units = coarseUnits(rows);
  /*
   * Both taken over the shifts rather than over the passes, so that the figure
   * a shift is compared with is the same kind of figure. A shift's kWh a
   * kilogram counts PR1's meter as well as R2's over the weight only R2 puts on
   * the scale, and a per-pass median does not - reading one against the other
   * is off by a factor of three, which was enough to let 24 June through.
   */
  const typicalOut = middle(units.map((u) => u.out));
  const typicalKwhKg = middle(units.map((u) => u.kwhkg));

  return units
    .map((u) => {
      const passes = u.parts.map((p) => byId.get(p.runId)).filter(Boolean);
      const machines = [...new Set(u.parts.map((p) => p.machineId).filter(Boolean))].sort();
      const faults = faultsIn(passes, twice);

      /*
       * A weight the meters do not believe.
       *
       * On 24 June a shift is on record at 66,972 kg. The line's largest
       * weighing before or since is 10,487, the vessels were charged with 7,500
       * that day, and the shift's own electricity meter moved 96 kWh - which is
       * what the line burns for about seven tonnes. It is a decimal point, and
       * left alone it is the best shift the plant has ever had by a factor of
       * nine and it sets the top of this table.
       *
       * Two meters have to disagree before it is called: the weight far above
       * what the line does, and the electricity far below what that weight
       * would have cost. A genuinely enormous shift burns power in proportion
       * and is not caught by this; a slipped decimal cannot, because nobody
       * mistyped the meter as well.
       */
      if (
        typicalOut && typicalKwhKg
        && u.out > typicalOut * 3
        && u.kwhkg != null && u.kwhkg < typicalKwhKg / 3
      ) {
        faults.push({
          key: 'weight-and-meter',
          what: `weighed ${round(u.out, 0)} kg on ${round(u.kwh, 0)} kWh`,
          why: `the line normally weighs about ${round(typicalOut, 0)} kg a shift and burns about `
            + `${round(typicalKwhKg, 3)} kWh a kilogram - this weight against this meter reading is a `
            + 'slipped decimal rather than a record shift',
          passes: passes.filter((r) => (num(r.weight_kg) ?? 0) > 0).map((r) => r.id),
        });
      }

      /*
       * And half the line missing from the record. PR1 never weighs anything,
       * so a shift with no pre-refining against it is not a shift that ran R2
       * alone - it is a shift whose other machine nobody logged, and its rate
       * is the output of two machines over the hours of one.
       */
      if (u.out > 0 && !machines.includes('PR1')) {
        faults.push({
          key: 'no-pre-refining',
          what: 'no pre-refining logged for this shift',
          why: 'PR1 feeds R2 and never weighs anything, so a shift with only R2 against it is missing '
            + 'the labour of half the line and reads about twice what it earned',
          passes: [],
        });
      }

      return {
        day: u.day,
        shift: u.shift,
        out: round(u.out, 0),
        labour: round(u.labour, 2),
        hours: round(u.hours, 2),
        kwh: round(u.kwh, 1),
        pmh: u.pmh == null ? null : round(u.pmh, 2),
        kwhkg: u.kwhkg == null ? null : round(u.kwhkg, 3),
        machines,
        passes: u.parts.length,
        faults,
        comparable: faults.length === 0,
        /*
         * Each pass carrying the day and shift it actually ran in, under the
         * same names the batch view uses. coarseUnits calls them ranOn/ranIn
         * because there the shift is the frame and a pass from elsewhere is the
         * exception; here the shift is what is being compared, so a pass says
         * plainly when it happened and the reader compares it with the heading.
         */
        parts: u.parts.map((p) => ({
          ...p,
          day: p.ranOn ?? null,
          shift: p.ranIn ?? null,
          entered: twice.has(p.runId) ? 'twice' : null,
        })),
      };
    })
    .sort((a, b) => `${b.day}|${b.shift}`.localeCompare(`${a.day}|${a.shift}`));
}

/**
 * The coarse shifts gathered by which shift of the day they were.
 *
 * The special line's equivalent question is which grades to take off a charge.
 * This line has no such choice - it is one flow through two machines - so the
 * comparison it can make is the one the plant asked for first: is a night worth
 * as much as a day. It is not quite, and the gap is in the labour rather than
 * in the output.
 */
export function coarseGroups(shifts) {
  const byShift = new Map();
  for (const u of shifts) {
    if (!u.comparable || !(u.out > 0) || u.pmh == null) continue;
    byShift.set(u.shift || 'Unrecorded', [...(byShift.get(u.shift || 'Unrecorded') ?? []), u]);
  }

  const mean = (list, pick) => {
    const values = list.map(pick).filter((v) => v != null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  return [...byShift]
    .map(([shift, list]) => ({
      key: shift,
      shift,
      shifts: list.length,
      out: round(mean(list, (u) => u.out), 0),
      labour: round(mean(list, (u) => u.labour), 1),
      pmh: round(mean(list, (u) => u.pmh), 2),
      kwhkg: round(mean(list, (u) => u.kwhkg), 3),
      best: list.reduce((a, b) => (b.pmh > a.pmh ? b : a)),
    }))
    .sort((a, b) => (b.pmh ?? 0) - (a.pmh ?? 0));
}

export const efficiencyService = {
  notes,

  /** Every shift day and shift that has runs, newest first - fills the picker. */
  async shiftOptions() {
    const rows = await runs.all({}, { sort: 'shift_date' });
    const days = new Map();
    for (const r of rows) {
      if (!r.shift_date) continue;
      const shifts = days.get(r.shift_date) ?? new Set();
      if (r.shift) shifts.add(r.shift);
      days.set(r.shift_date, shifts);
    }
    return [...days]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, shifts]) => ({ date, shifts: [...shifts].sort() }));
  },

  /**
   * One shift's cards, each metric carrying the manager's ideal for it and
   * whether the shift came in short. `calc` spells out the arithmetic so the
   * screen can show its working rather than asking anyone to trust a number.
   */
  /**
   * Every figure that missed its benchmark over a window, and how far along its
   * explanation is.
   *
   * The plant pays an incentive on these figures, and the rule the plant set is
   * that a miss is explained by the shift that worked it and signed off by the
   * office. A rule nobody can see the state of is a wish: a supervisor does not
   * know what they still owe, a manager does not know what is waiting, and the
   * managing director cannot tell whether the process is running at all.
   *
   * So a miss is in exactly one of three states, and this counts them:
   *
   *   unexplained  the shift has not said why yet
   *   waiting      explained, and the office has not signed it off
   *   approved     done
   *
   * Computed off one read of the runs rather than by asking forShift once per
   * shift. A month is around sixty shifts and forShift reads the whole run
   * history each time, so the obvious loop would read it sixty times to answer
   * one question.
   */
  async varianceStatus({ from, to } = {}) {
    const [all, idealSheet, reasonRows, rosterRows] = await Promise.all([
      runs.all({}, { sort: 'shift_date' }),
      rateService.idealValues(),
      reasons.all({}, { sort: 'created_at' }).catch(() => []),
      operatorService.shiftsFor({ from, to }).catch(() => []),
    ]);
    const ideals = idealSheet?.data ?? {};

    /*
     * Who was on each line, read once for the whole window rather than per
     * shift. forShift would have been the obvious call and would have queried
     * once for each of a month's sixty shifts.
     */
    const operatorAt = new Map(
      rosterRows.map((r) => [
        `${String(r.shift_date ?? '').slice(0, 10)}|${r.shift ?? ''}|${r.station}`,
        r.operator ?? null,
      ]),
    );

    const inWindow = (day) => {
      if (!day) return false;
      return (!from || day >= from) && (!to || day <= to);
    };

    /** A benchmarked figure that came in on the wrong side of its target. */
    const misses = [];
    /*
     * `station` is passed in rather than worked back out of the parameter key,
     * because the loop below already knows it and a key is a string somebody
     * would eventually have to parse. Null for a figure that is not a line's -
     * a batch yield belongs to a batch - and a day-scoped figure names nobody
     * either, because two crews worked it and the record cannot say which.
     */
    const consider = (day, shift, key, value, label, station = null) => {
      if (!inWindow(day) || value == null) return;
      const verdict = idealFor(key, value, ideals);
      if (!verdict.offTarget) return;
      misses.push({
        date: day,
        shift: shift || null,
        parameter: key,
        label,
        ideal: verdict.ideal,
        actual: verdict.variance == null ? value : round(value, 3),
        operator:
          station && shift ? (operatorAt.get(`${day}|${shift}|${station}`) ?? null) : undefined,
      });
    };

    for (const u of refinerUnits(all)) {
      consider(u.day, u.shift, idealKey.specialPerManHour(u.quality), u.pmh,
        `Special line ${u.quality} · production per man-hour`, SPECIAL_LINE_KEY);
      consider(u.day, u.shift, idealKey.specialKwhPerKg(u.quality), u.kwhkg,
        `Special line ${u.quality} · electricity`, SPECIAL_LINE_KEY);
    }

    for (const u of grinderUnits(all)) {
      const name = u.machine ?? u.machineId;
      const at = STATION_OF_MACHINE[u.machineId] ?? null;
      consider(u.day, u.shift, idealKey.production(u.machineId), u.out, `${name} · output`, at);
      consider(u.day, u.shift, idealKey.perManHour(u.machineId), u.pmh,
        `${name} · production per man-hour`, at);
      consider(u.day, u.shift, idealKey.kwhPerKg(u.machineId), u.kwhkg,
        `${name} · electricity`, at);
    }

    for (const u of coarseUnits(all)) {
      consider(u.day, u.shift, idealKey.production('COARSE'), u.out, 'Coarse line · output',
        'COARSE');
      consider(u.day, u.shift, idealKey.perManHour('COARSE'), u.pmh,
        'Coarse line · production per man-hour', 'COARSE');
      consider(u.day, u.shift, idealKey.kwhPerKg('COARSE'), u.kwhkg, 'Coarse line · electricity',
        'COARSE');
    }

    /*
     * Charges are counted per day and a batch yield belongs to the shift its
     * output was weighed in - so each is attributed the way its own card is,
     * rather than being forced onto a shift to make this loop tidier.
     */
    for (const u of autoclaveRunsByDay(all)) {
      const vessel = IDEAL_AUTOCLAVES.find((v) => v.key === u.machineId);
      if (!vessel) continue;
      consider(u.day, null, idealKey.autoclaveRuns(vessel.key), u.runs,
        `${vessel.label} · charges a day`);
    }

    for (const y of batchYields(all)) {
      consider(y.outDay, y.outShift, idealKey.batchYield(), y.pct, `Batch ${y.batch} · yield`);
    }

    /*
     * A reason is matched to a miss on the day, the shift and the parameter -
     * the three things that say which figure it is about. Not on the label,
     * which is wording and may be reworded.
     */
    const slot = (m) => `${m.date}|${m.shift ?? ''}|${m.parameter}`;
    const bySlot = new Map();
    for (const r of reasonRows) {
      const key = `${String(r.shift_date ?? '').slice(0, 10)}|${r.shift ?? ''}|${r.parameter}`;
      // The newest wins if a shift wrote twice about the same figure.
      const held = bySlot.get(key);
      if (!held || String(r.created_at ?? '') > String(held.created_at ?? '')) bySlot.set(key, r);
    }

    const items = misses
      .map((m) => {
        const reason = bySlot.get(slot(m)) ?? null;
        return {
          ...m,
          reason: reason?.reason ?? null,
          enteredBy: reason?.entered_by ?? null,
          reasonId: reason?.id ?? null,
          approvedAt: reason?.approved_at ?? null,
          approvedBy: reason?.approved_by ?? null,
          managerNote: reason?.manager_note ?? null,
          state: !reason ? 'unexplained' : reason.approved_at ? 'approved' : 'waiting',
        };
      })
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date))
          || String(a.shift ?? '').localeCompare(String(b.shift ?? ''))
          || String(a.label).localeCompare(String(b.label)),
      );

    const count = (state) => items.filter((i) => i.state === state).length;
    return {
      window: { from: from ?? null, to: to ?? null },
      totals: {
        misses: items.length,
        unexplained: count('unexplained'),
        waiting: count('waiting'),
        approved: count('approved'),
      },
      items,
    };
  },

  /**
   * One line, one grade or one vessel, shift by shift across a window.
   *
   * The shift view answers "how did last night go". This answers the question
   * that follows it and that nothing here could ask: "is that normal". A single
   * shift against a benchmark says hit or miss and nothing about whether the
   * line has been drifting for a fortnight, and the plant pays an incentive on
   * these figures - one bad shift is an argument, ten in a row is a fact.
   *
   * A subject is what is being followed, and each one is measured the way its
   * own card is: the special line per grade, a grinder on its own, the coarse
   * line as one, a vessel per day because a charge crosses the shift change,
   * and a yield per batch because that is what a yield belongs to. Forcing the
   * five onto one span would have made the series tidier and three of them
   * wrong.
   *
   * Every subject is worked out and one is returned. The list of them is what
   * fills the picker, and it has to be the subjects the window actually holds -
   * offering the whole plant and answering half of them with nothing reads as a
   * broken screen rather than as a line that did not run.
   */
  /**
   * The special line by batch, and by how the batch was taken.
   *
   * `from` and `to` choose which batches are listed - a batch is in if it
   * worked at all inside them - and never what is counted against one. A batch
   * is a thing with a start and an end and its rate is a property of the whole
   * of it; cutting it at a window edge would report passes against output
   * weighed on the other side, which is the error the whole view exists to
   * end.
   */
  async batchEfficiency({ from, to } = {}) {
    const all = await runs.all({}, { sort: 'shift_date' });
    const every = batchUnits(all);

    const within = (batch) => {
      if (from && String(batch.lastDay ?? '') < from) return false;
      if (to && String(batch.firstDay ?? '') > to) return false;
      return true;
    };
    const batches = every.filter(within);

    /*
     * And the coarse line, which has no batches to hang a record on - PR1 and
     * R2 work a continuous flow and no pass on the line carries a batch number.
     * So it is read by shift, in the same window and on the same request,
     * because it is the same question asked of the other half of the plant.
     */
    const everyShift = coarseShifts(all);
    const coarse = everyShift.filter((u) => {
      if (from && String(u.day ?? '') < from) return false;
      if (to && String(u.day ?? '') > to) return false;
      return true;
    });
    const charges = all.filter(
      (r) => r.kind === 'autoclave'
        && r.line === 'coarse'
        && (!from || String(r.shift_date ?? '') >= from)
        && (!to || String(r.shift_date ?? '') <= to),
    );
    const coarseOut = coarse.reduce((sum, u) => sum + (u.out ?? 0), 0);
    const coarseLabour = coarse.reduce((sum, u) => sum + (u.labour ?? 0), 0);
    const charged = charges.reduce((sum, r) => sum + (num(r.capacity) ?? 0), 0);

    return {
      window: { from: from ?? null, to: to ?? null },
      batches,
      recipes: recipeSummary(batches),
      coarse: {
        shifts: coarse,
        groups: coarseGroups(coarse),
        summary: {
          shifts: coarse.length,
          comparable: coarse.filter((u) => u.comparable).length,
          out: round(coarseOut, 0),
          labour: round(coarseLabour, 1),
          pmh: coarseOut > 0 && coarseLabour > 0 ? round(coarseOut / coarseLabour, 2) : null,
          /*
           * Over the window rather than per shift - the vessels cook overnight
           * for the day that follows, so inside one shift this division is
           * arithmetic about a buffer rather than a fact about a crew.
           */
          charges: charges.length,
          charged: round(charged, 0),
          yieldPct: charged > 0 ? round((coarseOut / charged) * 100, 1) : null,
        },
      },
      summary: {
        batches: batches.length,
        comparable: batches.filter((b) => b.comparable).length,
        withYield: batches.filter((b) => b.yieldPct != null).length,
        out: round(batches.reduce((sum, b) => sum + (b.out ?? 0), 0), 0),
        /*
         * The plant's own rate over these batches, weighted by weight rather
         * than averaged over batches: a 2,400 kg batch and a 300 kg batch are
         * not two equal opinions about how the line runs.
         */
        pmh: (() => {
          const sound = batches.filter((b) => b.comparable);
          const kg = sound.reduce((sum, b) => sum + (b.out ?? 0), 0);
          const labour = sound.reduce((sum, b) => sum + (b.labour ?? 0), 0);
          return kg > 0 && labour > 0 ? round(kg / labour, 2) : null;
        })(),
      },
    };
  },

  async trend({ from, to, subject } = {}) {
    const [all, idealSheet, rosterRows] = await Promise.all([
      runs.all({}, { sort: 'shift_date' }),
      rateService.idealValues(),
      operatorService.shiftsFor({ from, to }).catch(() => []),
    ]);
    const ideals = idealSheet?.data ?? {};

    const inWindow = (day) => {
      if (!day) return false;
      return (!from || day >= from) && (!to || day <= to);
    };

    const operatorAt = new Map(
      rosterRows.map((r) => [
        `${String(r.shift_date ?? '').slice(0, 10)}|${r.shift ?? ''}|${r.station}`,
        r.operator ?? null,
      ]),
    );

    /**
     * The series, built subject by subject as the figures are walked.
     *
     * Keyed by the subject rather than collected into a list, because a subject
     * is met once per shift and its points arrive interleaved with every other
     * subject's - the alternative is one pass per subject over the same rows.
     */
    const series = new Map();
    const at = (key, label, span) => {
      const held = series.get(key);
      if (held) return held;
      const made = { key, label, span, points: [] };
      series.set(key, made);
      return made;
    };

    /**
     * One figure on one point, measured against whatever the manager set, and
     * carrying the arithmetic behind it.
     *
     * The `calc` is the same thing the shift cards offer when a figure is
     * tapped, and it is here for the same reason: a screen that a wage is
     * argued from has to be able to show its working. Over a period it matters
     * more, not less - the answer to "why was Tuesday night 3.15" is in the
     * hours and the crew that made it, and a table of bare numbers ends every
     * such question with somebody going back to the paper.
     *
     * Built here rather than on the client, so the two screens cannot come to
     * divide the same figures differently.
     */
    const metric = (key, label, value, unit, digits = 2, calc = null) => ({
      key,
      label,
      unit,
      value: round(value, digits),
      ...idealFor(key, value, ideals, digits),
      calc: value == null ? null : calc,
    });

    /**
     * What to call one record on a line of the working.
     *
     * The machine and the batch, because those are what a person recognises a
     * pass by - "R4 on 3140" is a thing somebody remembers doing, and a run id
     * is not.
     */
    const partName = (part) =>
      `${part.machine ?? part.machineId ?? '?'}${part.batch ? ` · ${part.batch}` : ''}`;

    /** The width to pad names to, so the sums under them line up. */
    const padded = (parts) => {
      const width = Math.max(...parts.map((x) => partName(x).length), 0);
      return (part) => partName(part).padEnd(width);
    };

    /**
     * kg ÷ labour-hours, with every pass that made up the labour shown.
     *
     * The total on its own answers "what is the number" and nothing else. A
     * shift on the special line is two to four passes on different machines
     * and sometimes across two batches, and "why was that one low" is answered
     * by which pass ran long - so the working lists them, each one's own crew
     * times its own hours, and then adds them up in front of the reader.
     *
     * Which is also the only way anybody would catch the mistake this figure
     * used to carry. Summed crew times summed hours reads plausibly and was
     * more than twice the labour actually spent; four lines that add to the
     * total do not let that pass unnoticed.
     */
    const pmhCalc = (u, what) => {
      const name = padded(u.parts);
      return {
        title: `${what} · production per man-hour`,
        formula: 'what it weighed out ÷ the labour-hours that made it',
        lines: [
          ...u.parts.map(
            (part) =>
              `${name(part)}  ${part.workers ?? 0} crew × ${round(part.hours, 2)} h = ${round(part.labour, 2)} man-hours`,
          ),
          `labour = ${round(u.labour, 2)} man-hours over ${u.parts.length} record${u.parts.length === 1 ? '' : 's'}`,
          `out = ${round(u.out, 0)} kg`,
          `= ${round(u.out, 0)} ÷ ${round(u.labour, 2)}`,
        ],
        result: `${round(u.out / u.labour, 2)} kg/man-hour`,
        note:
          'Labour-hours are each record\'s own crew times its own hours, added up - '
          + 'not the summed crew times the summed hours, which on a line worked in '
          + 'several passes is more than twice the labour actually spent.',
      };
    };

    /** kWh ÷ kg, with what each pass drew. */
    const kwhCalc = (u, what) => {
      const name = padded(u.parts);
      const metered = u.parts.filter((x) => x.kwh != null);
      return {
        title: `${what} · electricity`,
        formula: 'the energy it drew ÷ what it weighed out',
        lines: [
          ...metered.map((part) => `${name(part)}  ${round(part.kwh, 1)} kWh`),
          `energy = ${round(u.kwh, 1)} kWh`,
          `out = ${round(u.out, 0)} kg`,
          `= ${round(u.kwh, 1)} ÷ ${round(u.out, 0)}`,
        ],
        result: `${round(u.kwh / u.out, 3)} kWh/kg`,
        note: 'Fewer is better here: the same rubber made for less electricity.',
      };
    };

    /**
     * What it weighed, and which passes weighed it.
     *
     * Only the ones that recorded a weight. On the special line the earlier
     * passes are the same material moving on and are not weighed at all, so
     * listing them at nought would read as passes that produced nothing.
     */
    const outCalc = (u, what) => {
      const weighed = u.parts.filter((x) => x.out != null && x.out > 0);
      const name = padded(weighed);
      return {
        title: `${what} · output`,
        formula: 'what the line weighed out over the shift',
        lines: [
          ...weighed.map((part) => `${name(part)}  ${round(part.out, 0)} kg`),
          `= ${round(u.out, 0)} kg`,
          `crew = ${u.workers} over ${round(u.hours, 2)} h, ${round(u.labour, 2)} man-hours`,
        ],
        result: `${round(u.out, 0)} kg`,
        note: 'The weight recorded against the line for this shift, and nothing else.',
      };
    };

    const point = (subjectKey, { date, shift, station, label, context, metrics }) => {
      const held = series.get(subjectKey);
      held.points.push({
        date,
        shift: shift || null,
        label: label ?? null,
        operator:
          station && shift ? (operatorAt.get(`${date}|${shift}|${station}`) ?? null) : undefined,
        ...context,
        // Only the figures that were actually measured. A metric with no value
        // is a shift that did not record it, and a series that carried it as a
        // gap would average nulls into the answer.
        metrics: metrics.filter((m) => m.value != null),
      });
    };

    for (const u of refinerUnits(all)) {
      if (!inWindow(u.day)) continue;
      const key = `special:${u.quality}`;
      at(key, `Special line · ${u.quality}`, 'shift');
      point(key, {
        date: u.day,
        shift: u.shift,
        station: SPECIAL_LINE_KEY,
        context: {
          out: round(u.out, 0),
          workers: u.workers,
          hours: round(u.hours, 2),
          /* Crew x hours per record, added up - see runLabour. */
          labour: round(u.labour, 2),
          /*
           * The records the shift's figure was added up from - see runPart.
           * Sorted by machine so two shifts of the same line read down in the
           * same order, which is what makes them comparable at a glance.
           */
          parts: [...u.parts].sort((x, y) =>
            String(x.machineId ?? '').localeCompare(String(y.machineId ?? '')),
          ),
          kwh: round(u.kwh, 1),
          batches: u.batches,
        },
        metrics: [
          metric(idealKey.specialPerManHour(u.quality), 'Production per man-hour', u.pmh,
            'kg/man-h', 2, pmhCalc(u, `Special line ${u.quality}`)),
          metric(idealKey.specialKwhPerKg(u.quality), 'Electricity', u.kwhkg, 'kWh/kg', 3,
            kwhCalc(u, `Special line ${u.quality}`)),
        ],
      });
    }

    for (const u of grinderUnits(all)) {
      if (!inWindow(u.day)) continue;
      const key = `machine:${u.machineId}`;
      at(key, u.machine ?? u.machineId, 'shift');
      point(key, {
        date: u.day,
        shift: u.shift,
        station: STATION_OF_MACHINE[u.machineId] ?? null,
        context: {
          out: round(u.out, 0),
          workers: u.workers,
          hours: round(u.hours, 2),
          /* Crew x hours per record, added up - see runLabour. */
          labour: round(u.labour, 2),
          /*
           * The records the shift's figure was added up from - see runPart.
           * Sorted by machine so two shifts of the same line read down in the
           * same order, which is what makes them comparable at a glance.
           */
          parts: [...u.parts].sort((x, y) =>
            String(x.machineId ?? '').localeCompare(String(y.machineId ?? '')),
          ),
          kwh: round(u.kwh, 1),
        },
        metrics: [
          metric(idealKey.production(u.machineId), 'Output', u.out, 'kg', 0,
            outCalc(u, u.machine ?? u.machineId)),
          metric(idealKey.perManHour(u.machineId), 'Production per man-hour', u.pmh,
            'kg/man-h', 2, pmhCalc(u, u.machine ?? u.machineId)),
          metric(idealKey.kwhPerKg(u.machineId), 'Electricity', u.kwhkg, 'kWh/kg', 3,
            kwhCalc(u, u.machine ?? u.machineId)),
        ],
      });
    }

    for (const u of coarseUnits(all)) {
      if (!inWindow(u.day)) continue;
      const key = 'coarse';
      at(key, 'Coarse line', 'shift');
      point(key, {
        date: u.day,
        shift: u.shift,
        station: 'COARSE',
        context: {
          out: round(u.out, 0),
          workers: u.workers,
          hours: round(u.hours, 2),
          /* Crew x hours per record, added up - see runLabour. */
          labour: round(u.labour, 2),
          /*
           * The records the shift's figure was added up from - see runPart.
           * Sorted by machine so two shifts of the same line read down in the
           * same order, which is what makes them comparable at a glance.
           */
          parts: [...u.parts].sort((x, y) =>
            String(x.machineId ?? '').localeCompare(String(y.machineId ?? '')),
          ),
          kwh: round(u.kwh, 1),
        },
        metrics: [
          metric(idealKey.production('COARSE'), 'Output', u.out, 'kg', 0,
            outCalc(u, 'Coarse line')),
          metric(idealKey.perManHour('COARSE'), 'Production per man-hour', u.pmh, 'kg/man-h',
            2, pmhCalc(u, 'Coarse line')),
          metric(idealKey.kwhPerKg('COARSE'), 'Electricity', u.kwhkg, 'kWh/kg', 3,
            kwhCalc(u, 'Coarse line')),
        ],
      });
    }

    for (const u of autoclaveRunsByDay(all)) {
      if (!inWindow(u.day)) continue;
      const vessel = IDEAL_AUTOCLAVES.find((v) => v.key === u.machineId);
      if (!vessel) continue;
      const key = `autoclave:${vessel.key}`;
      at(key, vessel.label, 'day');
      point(key, {
        date: u.day,
        shift: null,
        context: {},
        metrics: [
          metric(idealKey.autoclaveRuns(vessel.key), 'Charges a day', u.runs, 'charges', 0, {
            title: `${vessel.label} · charges a day`,
            formula: 'charges logged on this vessel across the whole day',
            lines: [
              `${vessel.label} on ${u.day} = ${u.runs}`,
              'counted per day, not per shift - a charge crosses the handover',
            ],
            result: `${u.runs} charge${u.runs === 1 ? '' : 's'}`,
          }),
        ],
      });
    }

    for (const y of batchYields(all)) {
      if (!inWindow(y.outDay)) continue;
      const key = 'yield';
      at(key, 'Batch yield', 'batch');
      point(key, {
        date: y.outDay,
        shift: y.outShift,
        label: `Batch ${y.batch}`,
        context: { charge: y.charge, out: round(y.out, 0) },
        metrics: [
          metric(idealKey.batchYield(), 'Yield', y.pct, '%', 1, {
            title: `Batch ${y.batch} · yield`,
            formula: 'what came off the charge ÷ what went into it',
            lines: [`out = ${round(y.out, 0)} kg`, `charge = ${y.charge} kg`,
              `= ${round(y.out, 0)} ÷ ${y.charge} × 100`],
            result: `${round(y.pct, 1)}%`,
            note: 'Everything weighed off the batch, on whichever machine finished it.',
          }),
        ],
      });
    }

    const subjects = [...series.values()]
      .map(({ key, label, span, points }) => ({ key, label, span, points: points.length }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const chosen = series.get(subject) ?? null;
    const points = (chosen?.points ?? []).sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date))
        || String(a.shift ?? '').localeCompare(String(b.shift ?? '')),
    );

    /**
     * What the window says about each figure, which is the point of asking for
     * one.
     *
     * Best and worst read off `lowerIsBetter` rather than off the arithmetic:
     * the best kWh per kg is the smallest and the best kg per man-hour is the
     * largest, and a screen that called the highest number the best would
     * congratulate the line on the shift it wasted the most electricity.
     *
     * The average is of the shifts, not weighted by what they made. Those are
     * different questions and this is the one the incentive asks: every shift is
     * held to the same benchmark whatever volume happened to come through it.
     */
    const byMetric = new Map();
    for (const pt of points) {
      for (const m of pt.metrics) {
        const held = byMetric.get(m.key) ?? {
          key: m.key,
          label: m.label,
          unit: m.unit,
          ideal: m.ideal,
          lowerIsBetter: m.lowerIsBetter,
          values: [],
          offTarget: 0,
        };
        held.values.push({ value: m.value, date: pt.date, shift: pt.shift, label: pt.label });
        if (m.offTarget) held.offTarget += 1;
        byMetric.set(m.key, held);
      }
    }

    const summary = [...byMetric.values()].map((m) => {
      const ranked = [...m.values].sort((a, b) =>
        m.lowerIsBetter ? a.value - b.value : b.value - a.value,
      );
      const total = m.values.reduce((sum, v) => sum + v.value, 0);
      const digits = DIGITS_OF[m.unit] ?? 2;
      /*
       * Nothing to be on target against is not the same as being on target.
       *
       * A figure whose benchmark nobody has filled in is off target on no point,
       * so counted the obvious way it comes back as a perfect record - batch
       * yield, which carries no ideal today, would report every batch a hit
       * while being held to nothing at all. Null rather than a number, so a
       * screen has to decide what to say about it instead of printing the
       * flattering answer by default.
       */
      const targeted = m.ideal != null;
      return {
        key: m.key,
        label: m.label,
        unit: m.unit,
        ideal: m.ideal,
        lowerIsBetter: m.lowerIsBetter,
        count: m.values.length,
        offTarget: targeted ? m.offTarget : null,
        onTarget: targeted ? m.values.length - m.offTarget : null,
        average: round(total / m.values.length, digits),
        best: ranked[0] ?? null,
        worst: ranked[ranked.length - 1] ?? null,
      };
    });

    return {
      window: { from: from ?? null, to: to ?? null },
      subjects,
      subject: chosen ? { key: chosen.key, label: chosen.label, span: chosen.span } : null,
      points,
      summary,
    };
  },

  async forShift({ date, shift } = {}) {
    // The benchmarks are one small row and the runs are the whole history, so
    // they are fetched together rather than one after the other.
    const [all, idealSheet] = await Promise.all([
      runs.all({}, { sort: 'shift_date' }),
      rateService.idealValues(),
    ]);
    const ideals = idealSheet?.data ?? {};

    const refAll = refinerUnits(all);
    const grindAll = grinderUnits(all);
    const yieldAll = batchYields(all);

    const here = (u) => u.day === date && (u.shift ?? '') === shift;
    const shiftRows = all.filter((r) => r.shift_date === date && (r.shift ?? '') === shift);

    /**
     * Hours on each machine this shift, counted once for the whole response.
     *
     * Every record on the machine, whatever line it was logged against and
     * whether or not it weighed anything. That last part is why this is not
     * read off grinderUnits, which drops a run with no output on purpose - it
     * exists to work out kg per man-hour, and a run that made nothing would
     * drag that figure down for no reason. But a machine that ran four hours
     * and weighed nothing still ran four hours: dropped from the utilisation
     * figure it reads as a machine that was never switched on, which is the
     * opposite of what happened.
     */
    const hoursByMachine = new Map();
    for (const r of shiftRows) {
      if (!r.machine_id) continue;
      const held = hoursByMachine.get(r.machine_id) ?? { hours: 0, runs: 0 };
      held.hours += runHours(r) ?? 0;
      held.runs += 1;
      hoursByMachine.set(r.machine_id, held);
    }

    const SHIFT_HOURS = SHIFT_MINUTES / 60;

    /**
     * A machine's share of the twelve hours, capped at 150%.
     *
     * The cap catches a mis-keyed hour meter, which would otherwise report
     * 400%. Anything between 100 and 150 is left showing rather than clamped:
     * a vessel whose charge ran past the shift change genuinely occupied more
     * than twelve hours of it, and flattening that to "100%" hides the one
     * case worth looking at.
     */
    const utilisationOf = (machineId) => {
      const hours = hoursByMachine.get(machineId)?.hours ?? 0;
      return hours > 0 ? Math.min(150, (hours / SHIFT_HOURS) * 100) : 0;
    };

    /**
     * Who was on each line this shift.
     *
     * The plant pays an incentive on these figures, so a card that reports one
     * and cannot say whose it was is a card nobody can be paid on. Loaded here,
     * ahead of every card, so the name travels with the figure it belongs to
     * rather than being looked up separately by the screen.
     *
     * Null is the ordinary state on a shift nobody has rostered yet, and the
     * card says so rather than leaving the space blank - an unassigned line is
     * a thing to fix, not a thing to skip past.
     */
    const roster = await operatorService.forShift({ date, shift }).catch(() => []);
    const operatorAt = new Map(roster.map((r) => [r.station, r.operator]));
    const operatorOf = (station) => operatorAt.get(station) ?? null;
    const operatorOfMachine = (machineId) => operatorOf(STATION_OF_MACHINE[machineId]);

    /**
     * The picked day folded up per line, so a shift card can carry its own
     * comparison instead of pointing at a second card underneath.
     *
     * These two benchmarks are still measured over the day, and that has not
     * changed: a night shift that ran four hours on a line the day shift had
     * already warmed up is not a worse crew, and holding each half of a day
     * against a whole-day target would report it as one. What changed is where
     * the answer is shown. There used to be a card up here with the shift's
     * figures and no verdict, and a second card at the foot of the screen with
     * the same two figures for the day and the verdict on them - so the one
     * grade a manager was asking about was in two places, and neither was the
     * whole answer. They are one card now: the day figure, the ideal beside it,
     * and the shift's own figure in the line underneath.
     */
    const dayFold = (units, keyOf) =>
      new Map(
        dailyUnits(units, keyOf)
          .filter((d) => d.day === date)
          .map((d) => [d.key, d]),
      );
    const refDay = dayFold(refAll, (u) => u.quality);
    const grindDay = dayFold(grindAll, (u) => u.machineId);

    /**
     * What a day figure is folded out of, said once per card rather than once
     * per row.
     *
     * It used to be repeated under every metric, and on a card for a grade the
     * other shift worked it also appeared in the corner - the same sentence
     * three times on one card, in 11px grey. Three copies of a thing is how a
     * reader learns to skip it.
     */
    const dayNote = (day) =>
      `${day.shifts} shift${day.shifts === 1 ? '' : 's'} · ${round(day.out, 0)} kg`;

    /*
     * There was a `mine()` helper here, for the sub-line that carried the
     * shift's own figure under a day comparison. Energy and labour are judged on
     * the shift itself now, so the shift's figure is the headline and a sub-line
     * repeating it would be the card saying the same number twice.
     */

    /**
     * A card for each grade or machine worked in the PICKED SHIFT, carrying the
     * day fold it is judged against.
     *
     * The shift decides what is on the screen. This briefly worked the other way
     * round - the day decided, and a grade the other shift had worked appeared
     * anyway, marked "not worked this shift" - on the reasoning that the two
     * benchmarks are day figures and so belong on both views. The plant read that
     * as the screen contradicting the History tab: 20 August shows Special worked
     * on the night shift, and the day shift's Efficiency tab listed Special.
     * A row on a shift's screen is taken to mean that shift did it, and no label
     * undoes that.
     *
     * So a shift shows its own work. The two day-measured figures still fold in
     * the whole day - that is how the ideal is set, and the card says so - but
     * the card only exists where there was a crew.
     */
    const dayCards = (dayMap, shiftUnits, matches) =>
      [...dayMap.values()]
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .map((day) => ({ day, unit: shiftUnits.find((u) => here(u) && matches(u, day)) ?? null }))
        .filter((c) => c.unit);

    const refiners = dayCards(refDay, refAll, (u, d) => u.quality === d.key).map(({ day, unit }) => {
      // Null on a grade that did not run in this shift - every per-shift figure
      // below is written from this, so there is one place that decides.
      const u = unit;
      /**
       * The batches THIS shift worked, not the day's.
       *
       * Gathered across the day while the cards were day-scoped, and it outlived
       * that: the day shift's Fine card listed batch 3123, which is the batch the
       * night shift refined. A batch number on a shift's card is read as "this
       * shift touched this batch", and against the History tab - which has 3123
       * on the night shift, correctly - it made the two screens disagree about a
       * plain fact.
       */
      const batches = u.batches;
      return {
        key: `refiner|${day.key}`,
        quality: day.key,
        operator: operatorOf(SPECIAL_LINE_KEY),
        batches,
        /** Whether this grade was worked in the shift on the picker. */
        out: round(u.out, 0),
        workers: u.workers,
        hours: round(u.hours),
        kwh: round(u.kwh, 1),
        /** The day's own totals, so the card can say what it is comparing. */
        dayOut: round(day.out, 0),
        dayShifts: day.shifts,
        /** What the day figures are folded out of. Said here, not on every row. */
        dayNote: dayNote(day),
        metrics: [
          {
            key: 'pmh',
            label: 'Production / man-hour',
            unit: 'kg/man-hour',
            // The day's figure, because that is what the ideal is set against.
            // The shift's own is on the line underneath - a supervisor works a
            // shift, not a day, and a card that dropped it would be hiding the
            // number the conversation is actually about.
            value: round(u.pmh, 1),
            warn: false,
            ...idealFor(idealKey.specialPerManHour(day.key), u.pmh, ideals, 1),
            span: 'shift',
            calc: u.pmh == null ? null : {
              title: 'Production / man-hour · this shift',
              formula: "this shift's output ÷ this shift's labour-hours",
              lines: [
                `output = ${round(u.out, 0)} kg (R4 weighed)`,
                `labour = ${u.workers} crew × ${round(u.hours, 1)} h = ${round(u.workers * u.hours, 1)} labour-hours`,
                `= ${round(u.out, 0)} ÷ ${round(u.workers * u.hours, 1)}`,
                `the whole day made ${round(day.out, 0)} kg over ${day.shifts} shift${day.shifts === 1 ? '' : 's'}`,
              ],
              result: `${round(u.pmh, 1)} kg/man-hour`,
              note: 'Measured over this shift alone. A shift that weighs out material it did not log the passes for will read impossibly high here - which is the point: the gap shows on the shift that owns it rather than being averaged away.',
            },
          },
          {
            key: 'kwhkg',
            label: 'Electricity (kWh/kg)',
            unit: 'kWh/kg',
            value: round(u.kwhkg, 3),
            warn: false,
            ...idealFor(idealKey.specialKwhPerKg(day.key), u.kwhkg, ideals, 3),
            span: 'shift',
            calc: u.kwhkg == null ? null : {
              title: 'Electricity (kWh / kg) · this shift',
              formula: "this shift's energy ÷ this shift's output",
              lines: [
                `energy = ${round(u.kwh, 1)} kWh (all refiner passes)`,
                `output = ${round(u.out, 0)} kg`,
                `= ${round(u.kwh, 1)} ÷ ${round(u.out, 0)}`,
                `the whole day used ${round(day.kwh, 1)} kWh over ${round(day.out, 0)} kg`,
              ],
              result: `${round(u.kwhkg, 3)} kWh/kg`,
              note: 'Measured over this shift alone. A shift that weighs out material it did not log the passes for will read impossibly high here - which is the point: the gap shows on the shift that owns it rather than being averaged away.',
            },
          },
        ],
      };
    });

    const grinders = dayCards(grindDay, grindAll, (u, d) => u.machineId === d.key).map(({ day, unit }) => {
      const u = unit;
      const name = day.machine ?? day.key;
      /*
       * The machine's own hours, not the unit's.
       *
       * They differ where a run weighed nothing - grinderUnits drops those,
       * for the good reason that they would drag kg per man-hour down, and
       * the effect here was a grinder that ran and recorded no output being
       * reported as a grinder that never turned. The card and the utilisation
       * list are the same figure on one screen and had better agree.
       */
      const ranHours = hoursByMachine.get(day.key)?.hours ?? 0;
      const utilPct = utilisationOf(day.key);
      const downMin = Math.max(0, SHIFT_MINUTES - ranHours * 60);
      return {
        key: `grind|${day.key}`,
        machineId: day.key,
        operator: operatorOfMachine(day.key),
        machine: name,
        out: round(u.out, 0),
        workers: u.workers,
        hours: round(u.hours),
        dayOut: round(day.out, 0),
        dayShifts: day.shifts,
        /** What the day figures are folded out of. Said here, not on every row. */
        dayNote: dayNote(day),
        metrics: [
          {
            key: 'pmh',
            label: 'Production / man-hour',
            unit: 'kg/man-hour',
            value: round(u.pmh, 1),
            warn: false,
            ...idealFor(idealKey.perManHour(day.key), u.pmh, ideals, 1),
            span: 'shift',
            calc: day.pmh == null ? null : {
              title: 'Production / man-hour · whole day',
              formula: "the day's output ÷ the day's labour-hours",
              lines: [
                `output = ${round(day.out, 0)} kg (${day.shifts} shift${day.shifts === 1 ? '' : 's'})`,
                `labour = ${round(day.labourHours, 1)} labour-hours (crew × hours, summed per shift)`,
                `= ${round(day.out, 0)} ÷ ${round(day.labourHours, 1)}`,
                `this ${shift || 'shift'} on its own = ${round(u.out, 0)} ÷ ${round(u.labour, 1)} = ${round(u.pmh, 1)}`,
              ],
              result: `${round(day.pmh, 1)} kg/man-hour`,
              note: `Measured over the whole day, which is how the ideal for ${name} is set - a shift that ran on a machine the other shift had already warmed up is not a worse crew.`,
            },
          },
          {
            key: 'kwhkg',
            label: 'Electricity (kWh/kg)',
            unit: 'kWh/kg',
            value: round(u.kwhkg, 3),
            warn: false,
            ...idealFor(idealKey.kwhPerKg(day.key), u.kwhkg, ideals, 3),
            span: 'shift',
            calc: day.kwhkg == null ? null : {
              title: 'Electricity (kWh / kg) · whole day',
              formula: "the day's energy ÷ the day's output",
              lines: [
                `energy = ${round(day.kwh, 1)} kWh (${day.shifts} shift${day.shifts === 1 ? '' : 's'})`,
                `output = ${round(day.out, 0)} kg`,
                `= ${round(day.kwh, 1)} ÷ ${round(day.out, 0)}`,
                `this ${shift || 'shift'} on its own = ${round(u.kwh, 1)} ÷ ${round(u.out, 0)} = ${round(u.kwhkg, 3)}`,
              ],
              result: `${round(day.kwhkg, 3)} kWh/kg`,
              note: `Measured over the whole day, which is how the ideal for ${name} is set.`,
            },
          },
          // Utilisation and the shift's own output are per-shift figures, so a
          // grinder that did not run in this shift carries neither - a nought
          // against a 12-hour shift it was never rostered for is a flag nobody
          // can answer. The two day comparisons above stay, which is the whole
          // reason the card is on the screen.
          {
            key: 'util',
            label: 'Time · utilisation',
            span: 'shift',
            value: ranHours > 0 ? round(utilPct, 0) : null,
            unit: '%',
            /**
             * The one flag on this screen that is not a manager's benchmark, and
             * the one comparison that survived the medians going: twelve hours is
             * twelve hours whatever the plant has averaged, so this is a fixed
             * standard rather than a bar the plant sets by drifting. It is named
             * on the card as its own kind of flag so nobody reads it as a target
             * off the Ideal values tab.
             */
            context: `of 12 h · downtime ${round(downMin / 60)} h`,
            warn: ranHours > 0 && utilPct < TH.utilisation * 100,
            warnLabel: 'high downtime',
            // Declared null rather than left off, so every metric on the wire
            // answers the same question the same way: this is not a figure the
            // manager sets a target against, so the card must not ask for one.
            parameter: null,
            calc: ranHours === 0 ? null : {
              title: 'Time · utilisation',
              formula: 'run hours ÷ 12 h shift',
              lines: [
                `ran = ${round(ranHours)} h`,
                `= ${round(ranHours)} ÷ 12`,
                `downtime = 12 − ${round(ranHours)} = ${round(downMin / 60)} h`,
              ],
              result: `${round(utilPct, 0)}%`,
              note: `Flagged below ${Math.round(TH.utilisation * 100)}% utilisation (more than ${Math.round((1 - TH.utilisation) * 100)}% downtime).`,
            },
          },
          {
            key: 'out',
            label: 'Output (maximise)',
            span: 'shift',
            value: round(u.out, 0),
            unit: 'kg',
            context: `labour: ${u.workers} crew · ${round(u.hours, 1)} h`,
            warn: false,
            ...idealFor(idealKey.production(day.key), u.out, ideals, 0),
            calc: {
              title: 'Output',
              formula: 'total crumb weighed from this grinder this shift',
              lines: [`over ${round(u.hours)} h with ${u.workers} crew`],
              result: `${round(u.out, 0)} kg`,
              note: '',
            },
          },
        ],
      };
    });

    const yields = yieldAll
      .filter((y) => y.outDay === date && (y.outShift ?? '') === shift)
      .sort((a, b) => (a.batch < b.batch ? -1 : 1))
      .map((y) => ({
        key: `yield|${y.batch}`,
        batch: y.batch,
        charge: y.charge,
        out: round(y.out, 0),
        metrics: [
          {
            key: 'yield',
            label: 'Yield',
            value: round(y.pct, 1),
            unit: '%',
            context: `charge ${y.charge ?? '—'} kg · out ${round(y.out, 0)} kg`,
            warn: false,
            /**
             * Against the manager's figure, not the plant's median yield.
             *
             * This is the one metric on the screen that gained a target rather
             * than only losing a baseline. Yield is how much rubber the plant
             * throws away, and it was the figure most flattered by being judged
             * against its own history - a plant that has quietly yielded 62% for
             * two years has a median saying 62% is normal. One target for the
             * plant: a charge is charged as a charge, not as a grade.
             */
            ...idealFor(idealKey.batchYield(), y.pct, ideals, 1),
            calc: {
              title: 'Yield',
              formula: 'output ÷ autoclave charge × 100',
              lines: [
                `output = ${round(y.out, 0)} kg (all grades weighed)`,
                `charge = ${y.charge} kg`,
                `= ${round(y.out, 0)} ÷ ${y.charge} × 100`,
              ],
              result: `${round(y.pct, 1)} %`,
              note: 'Compared with the batch yield on the Ideal values tab.',
            },
          },
        ],
      }));

    /**
     * The coarse line, which has never had a card here.
     *
     * One card for the line rather than one per machine: PR1 breaks the charge
     * down and R2 works it, and only R2 weighs, so the shift has one output
     * figure and it belongs to the line. Production only - the manager sets no
     * energy or labour benchmark against coarse, so the card shows what the line
     * made against what it was meant to make and leaves it there.
     */
    const coarseAll = coarseUnits(all);
    const coarseDay = dayFold(coarseAll, () => 'COARSE');
    const coarse = coarseAll.filter(here).map((u) => {
      const day = coarseDay.get('COARSE');
      return {
        key: 'coarse|line',
        line: 'coarse',
        operator: operatorOf('COARSE'),
        label: 'Coarse line',
        out: round(u.out, 0),
        workers: u.workers,
        hours: round(u.hours),
        dayOut: round(day.out, 0),
        dayShifts: day.shifts,
        dayNote: dayNote(day),
        metrics: [
          {
            key: 'out',
            label: 'Output',
            span: 'shift',
            value: round(u.out, 0),
            unit: 'kg',
            context: `${u.workers} crew · ${round(u.hours, 1)} h`,
            warn: false,
            ...idealFor(idealKey.production('COARSE'), u.out, ideals, 0),
            calc: {
              title: 'Coarse output',
              formula: 'everything the coarse line weighed this shift',
              lines: [
                `= sum of the line's weighed runs over ${round(u.hours)} h with ${u.workers} crew`,
              ],
              result: `${round(u.out, 0)} kg`,
              note: "Compared with the coarse line's shift production on the Ideal values tab.",
            },
          },
          /*
           * The same two rates the grinders and the special line answer for.
           * The coarse line has always carried the figures they are made of and
           * was benchmarked on neither, so it could burn any amount of power per
           * kg without this screen ever asking - the one weighing line on the
           * plant that could not come in short on anything but tonnage.
           *
           * Measured over the day, like every other kWh/kg and kg/man-hour here,
           * because that is the span the ideal is set at.
           */
          {
            key: 'pmh',
            label: 'Production / man-hour',
            span: 'shift',
            unit: 'kg/man-hour',
            value: round(u.pmh, 1),
            warn: false,
            ...idealFor(idealKey.perManHour('COARSE'), u.pmh, ideals, 1),
            calc: day.pmh == null ? null : {
              title: 'Production / man-hour · whole day',
              formula: "the day's output ÷ the day's labour-hours",
              lines: [
                `output = ${round(day.out, 0)} kg (${day.shifts} shift${day.shifts === 1 ? '' : 's'})`,
                `labour = ${round(day.labourHours, 1)} labour-hours (each pass's own crew × its own hours)`,
                `= ${round(day.out, 0)} ÷ ${round(day.labourHours, 1)}`,
                `this ${shift || 'shift'} on its own = ${round(u.out, 0)} ÷ ${round(u.labour, 1)} = ${round(u.pmh, 1)}`,
                /*
                 * Every pass that made it, named, and the ones that ran in the
                 * other shift said so. The line is two machines and only R2
                 * weighs, so a card showing R2 alone is a card missing half the
                 * labour that made the figure - and the reader has no way to
                 * tell from a single number whether PR1 is in it.
                 */
                ...u.parts.map(
                  (part) =>
                    `   ${part.machine ?? part.machineId}`
                    + `${part.ranIn && part.ranIn !== u.shift ? ` · ran in the ${part.ranIn} shift` : ''}`
                    + ` · ${part.workers ?? '?'} crew × ${round(part.hours ?? 0, 1)} h`
                    + ` = ${round(part.labour ?? 0, 1)} man-hours`
                    + `${(part.out ?? 0) > 0 ? `, weighed ${round(part.out, 0)} kg` : ', weighed nothing'}`,
                ),
              ],
              result: `${round(day.pmh, 1)} kg/man-hour`,
              note: 'PR1 and R2 together - the coarse line is crewed and measured as one line, not per machine.',
            },
          },
          {
            key: 'kwhkg',
            label: 'Electricity (kWh/kg)',
            span: 'shift',
            unit: 'kWh/kg',
            value: round(u.kwhkg, 3),
            warn: false,
            ...idealFor(idealKey.kwhPerKg('COARSE'), u.kwhkg, ideals, 3),
            calc: day.kwhkg == null ? null : {
              title: 'Electricity (kWh / kg) · whole day',
              formula: "the day's energy ÷ the day's output",
              lines: [
                `energy = ${round(day.kwh, 1)} kWh (PR1 and R2, ${day.shifts} shift${day.shifts === 1 ? '' : 's'})`,
                `output = ${round(day.out, 0)} kg (only R2 weighs)`,
                `= ${round(day.kwh, 1)} ÷ ${round(day.out, 0)}`,
                `this ${shift || 'shift'} on its own = ${round(u.kwh, 1)} ÷ ${round(u.out, 0)} = ${round(u.kwhkg, 3)}`,
              ],
              result: `${round(day.kwhkg, 3)} kWh/kg`,
              note: 'Both machines’ meters over the weight R2 put on the scale - PR1 breaks the charge down and only R2 weighs it.',
            },
          },
        ],
      };
    });

    /**
     * The autoclaves, counted per day.
     *
     * The only card on this screen that is not about the shift on the picker: a
     * vessel is charged, cooked and emptied across whatever shift boundary falls
     * in the middle, so a per-shift count reports the same day's work
     * differently depending on when the crew changed over. The card says so
     * rather than leaving the reader to notice.
     */
    const acAll = autoclaveRunsByDay(all);
    const chargesThisShift = autoclaveCharges(shiftRows);

    const autoclaves = IDEAL_AUTOCLAVES.map((vessel) => {
      const today = acAll.find((u) => u.machineId === vessel.key && u.day === date);
      const runsToday = today?.runs ?? 0;

      /*
       * This shift's charges on this vessel, each measured against the time the
       * manager set for one. The metric is the average of them, because a
       * reason is filed against a parameter and a per-charge parameter would
       * collide the moment a vessel took two charges in a shift - but every
       * charge is listed with its own verdict beside it, since "each run should
       * match the ideal" is the rule and an average can hide a charge that
       * doubled while another was quick.
       */
      const mine = chargesThisShift.filter((c) => c.machineId === vessel.key);
      const cycleIdeal = ideals[idealKey.autoclaveCycle(vessel.key)] ?? null;
      const timed = mine.filter((c) => c.hours != null && c.hours > 0);
      const cycle = timed.length
        ? timed.reduce((sum, c) => sum + c.hours, 0) / timed.length
        : null;
      const charges = mine.map((c) => {
        /*
         * Nought hours is not a charge that took no time, it is a charge whose
         * time nobody wrote down - the vessel was loaded and the sheet left
         * blank. Null so the screen says so, and so it is left out of the
         * average the same way.
         */
        const hours = c.hours != null && c.hours > 0 ? round(c.hours, 2) : null;
        return {
          ...c,
          hours,
          overBy: hours == null || cycleIdeal == null ? null : round(hours - Number(cycleIdeal), 2),
          offTarget: hours != null && cycleIdeal != null && hours > Number(cycleIdeal),
        };
      });

      return {
        key: `autoclave|${vessel.key}`,
        line: 'autoclave',
        operator: operatorOf('AUTOCLAVES'),
        machineId: vessel.key,
        label: vessel.label,
        /** Each charge this shift, with its own time and its own verdict. */
        charges,
        metrics: [
          {
            key: 'cycle',
            label: 'Time a charge',
            value: round(cycle, 2),
            unit: 'h',
            span: 'shift',
            context: timed.length
              ? `${timed.length} charge${timed.length === 1 ? '' : 's'} this shift`
              : null,
            warn: false,
            ...idealFor(idealKey.autoclaveCycle(vessel.key), cycle, ideals, 2),
            calc: cycle == null ? null : {
              title: 'Time a charge',
              formula: 'hours logged on each charge, averaged over the shift',
              lines: [
                ...timed.map(
                  (c) => `${c.batch ?? 'charge'} = ${round(c.hours, 2)} h`,
                ),
                `= ${round(timed.reduce((sum, c) => sum + c.hours, 0), 2)} ÷ ${timed.length}`,
              ],
              result: `${round(cycle, 2)} h`,
              note: 'Each charge is held to the time set for this vessel on the Ideal values tab; the average is what a reason is filed against.',
            },
          },
          {
            key: 'runs',
            label: 'Charges today',
            value: runsToday,
            unit: 'runs/day',
            span: 'day',
            context: null,
            warn: false,
            ...idealFor(idealKey.autoclaveRuns(vessel.key), runsToday, ideals, 0),
            calc: {
              title: 'Charges today',
              formula: 'charges logged on this vessel across the whole day',
              lines: [
                `${vessel.label} on ${date ?? '—'} = ${runsToday}`,
                'counted per day, not per shift - a charge crosses the handover',
              ],
              result: `${runsToday} run${runsToday === 1 ? '' : 's'}`,
              note: 'Compared with the charges a day set for this vessel on the Ideal values tab.',
            },
          },
        ],
      };
    });


    /**
     * Every machine the plant runs that has nothing at all against this shift.
     *
     * The plant's rule is that every machine is accounted for on every shift: it
     * ran, or it was down, and either way somebody says so. An absent row says
     * neither. Until now a machine that was never logged simply had no card, and
     * a screen with no card on it looks exactly like a plant with nothing to
     * answer for - which is how the Soorya Grinder went five months without a
     * single run while carrying a 1,800 kg/shift target and nobody was ever
     * asked about it.
     *
     * So the gap is put on the screen as the gap it is, and each one carries any
     * open breakdown already covering it. A machine that is down is not a
     * question - it has been answered - and the manager is chasing the rest.
     */
    const [machineRows, downRows] = await Promise.all([
      machines.all({}, { sort: 'sort_order' }).catch(() => []),
      breakdowns.all({}, { sort: 'down_start' }).catch(() => []),
    ]);


    const workedThisShift = new Set(
      shiftRows.map((r) => r.machine_id).filter(Boolean),
    );
    const endOfDay = date ? Date.parse(date + 'T23:59:59Z') : null;

    /** Open, or closed only after this shift's day - either way it covers it. */
    const coveringBreakdown = (machineId) =>
      downRows.find((b) => {
        if (b.machine_id !== machineId) return false;
        const started = Date.parse(b.down_start ?? b.created_at ?? '');
        if (Number.isFinite(started) && endOfDay != null && started > endOfDay) return false;
        if (!b.repaired_at) return true;
        const fixed = Date.parse(b.repaired_at);
        return Number.isFinite(fixed) && endOfDay != null && fixed >= Date.parse(date + 'T00:00:00Z');
      }) ?? null;

    const unlogged = machineRows
      .filter((m) => m.enabled !== false && !workedThisShift.has(m.id))
      .map((m) => {
        const down = coveringBreakdown(m.id);
        return {
          machineId: m.id,
          machine: m.name ?? m.id,
          group: m.group_name ?? null,
          kind: m.kind ?? null,
          /** The breakdown that answers for it, if somebody has logged one. */
          breakdown: down
            ? {
              id: down.id,
              downStart: down.down_start ?? down.created_at ?? null,
              repairedAt: down.repaired_at ?? null,
              rootCause: down.root_cause ?? null,
              open: !down.repaired_at,
            }
            : null,
          /** Nothing logged and no breakdown against it - this is the ask. */
          needsAnswer: !down,
        };
      });

    /**
     * How much of the twelve hours each machine actually ran.
     *
     * Utilisation was on the grinder cards and nowhere else, so the plant could
     * see that Grinder 1 ran nine hours of twelve and had no way at all to ask
     * the same of a refiner, a vessel or a press. It is the one question on this
     * screen that means the same thing for every machine the plant owns - a
     * shift is twelve hours whatever is bolted to the floor - so it is answered
     * for all of them, in one list, rather than being a line on the four cards
     * that happened to have room for it.
     *
     * Every enabled machine, including the ones that did not run. Nought of
     * twelve is the answer to the question, and it is the answer worth having:
     * a utilisation report that quietly left out the machines nobody switched
     * on would report the plant as busier the less of it was working.
     *
     * Off the same hours the grinder cards read, so the two cannot disagree
     * about a figure they both print on one screen.
     */
    const utilisation = machineRows
      .filter((m) => m.enabled !== false)
      .map((m) => {
        const { hours = 0, runs = 0 } = hoursByMachine.get(m.id) ?? {};
        const pct = utilisationOf(m.id);
        const down = coveringBreakdown(m.id);
        const station = STATION_OF_MACHINE[m.id];
        return {
          machineId: m.id,
          machine: m.name ?? m.id,
          short: m.short ?? null,
          group: m.group_name ?? null,
          kind: m.kind ?? null,
          runs,
          hours: round(hours, 2),
          pct: round(pct, 0),
          /** What is left of the shift. Never negative - see the cap above. */
          idle: round(Math.max(0, SHIFT_HOURS - hours), 2),
          /*
           * Absent, not null, on a machine that is not an operator station -
           * a press belongs to no line on the roster, and telling its reader
           * "no operator set" would invent a gap for them to go and fill. See
           * OperatorChip on the client.
           */
          operator: station ? operatorOf(station) : undefined,
          down: down ? { id: down.id, open: !down.repaired_at } : null,
          /*
           * Flagged only where the machine ran and ran short.
           *
           * A machine that ran nothing is not low utilisation, it is not run -
           * a different question, owned by the Not accounted for list below,
           * which chases it and asks for a breakdown. Flagged here as well, the
           * two presses the plant almost never uses would sit red on every
           * shift of every month, and a flag that fires every time teaches
           * people to read past the flags that mean something.
           *
           * And nothing is flagged where a breakdown already answers for it.
           */
          warn: !down && runs > 0 && pct < TH.utilisation * 100,
        };
      });

    /*
     * The plant-wide figure, as the mean of the machines rather than as total
     * hours over total capacity. They differ, and this is the one that answers
     * "how much of the plant was working": summing hours lets one vessel
     * running a long charge cover for three machines standing idle, which is
     * the opposite of what a utilisation report is read for.
     */
    const utilisationTotals = {
      machines: utilisation.length,
      ran: utilisation.filter((u) => u.runs > 0).length,
      hours: round(utilisation.reduce((sum, u) => sum + u.hours, 0), 1),
      pct: utilisation.length
        ? round(utilisation.reduce((sum, u) => sum + u.pct, 0) / utilisation.length, 0)
        : 0,
      shiftHours: SHIFT_HOURS,
    };

    let kwh = 0;
    let out = 0;
    for (const r of shiftRows) {
      kwh += runKwh(r) ?? 0;
      out += num(r.weight_kg) ?? 0;
    }

    return {
      date: date ?? null,
      shift: shift ?? null,
      totals: { runs: shiftRows.length, outKg: round(out, 0), kwh: round(kwh, 0) },
      /**
       * The refiner and grinder cards carry kWh/kg and kg/man-hour folded up
       * over the whole day, which is the granularity the manager sets those two
       * at, with the shift's own figure beside each as context.
       *
       * There used to be a second set of cards at the foot of the response - the
       * same two figures per grade and per grinder, for the day, and the only
       * place either was compared. It meant one grade appeared twice on the
       * screen: once up here without a verdict and once down there without the
       * shift, and a manager asking "how did Fine do on the day shift" had to
       * read both and hold them together. There is one card each now.
       */
      refiners,
      grinders,
      coarse,
      autoclaves,
      yields,
      /**
       * Machines with nothing against this shift, and the breakdown covering
       * each where there is one. What the manager chases: every machine is
       * meant to be accounted for on every shift, either by work or by a
       * breakdown, and this is the list that is neither.
       */
      unlogged,
      /**
       * How much of the twelve hours each machine ran, every machine on the
       * plant, with the plant-wide mean beside it. The one question on this
       * screen that means the same thing for a grinder, a vessel and a press.
       */
      utilisation,
      utilisationTotals,
      /**
       * Who was on each line this shift, every station whether named or not.
       * The cards carry their own operator; this is the list the supervisor
       * assigns from and the manager reads down.
       */
      roster,
      /**
       * The utilisation cut-off, and now nothing else. It is here so the screen
       * can say what the one non-ideal flag on it means without hard-coding the
       * number in two places. Everything else on this response is measured
       * against the manager's sheet.
       */
      thresholds: TH,
      /**
       * Whether the manager has set any benchmark at all. The screen needs to
       * tell "nothing to compare against yet" from "on target": an empty sheet
       * flags nothing, and a page that quietly showed every line as fine would
       * be reporting a hole as a pass.
       */
      idealsSet: Object.values(ideals).some((v) => v != null),
    };
  },

  /** Reasons already recorded against a shift. */
  async listNotes({ date, shift } = {}) {
    const { rows } = await notes.list(
      { order: 'desc', limit: 200 },
      { shift_date: date, shift: shift || undefined },
    );
    return rows;
  },

  addNote: (payload = {}) =>
    notes.create({
      shift_date: payload.date,
      shift: payload.shift || null,
      line: payload.line,
      metric: payload.metric,
      reason: payload.reason,
      entered_by: payload.enteredBy ?? null,
    }),

  /**
   * Why the actuals missed their ideals in a shift.
   *
   * A project that has not had migration 0014 run against it has no table to
   * read, and a screen that cannot show past reasons is not a screen that should
   * refuse to show the shift - so it answers empty, the same way the labour
   * rates do. Writing one does not swallow the error: a manager typing a reason
   * is owed the truth about whether it was kept.
   */
  async listVarianceReasons({ date, shift } = {}) {
    const { rows } = await reasons
      .list({ order: 'desc', limit: 200 }, { shift_date: date, shift: shift || undefined })
      .catch(() => ({ rows: [] }));
    return rows;
  },

  /**
   * Every reason recorded across a window of days, newest first.
   *
   * The card on the Efficiency tab shows a shift's own reasons, which answers
   * "why did this shift miss" and cannot answer "what has been going wrong this
   * month" - and the second is the question a record like this is kept for. The
   * window is filtered here rather than in the query, which is how every other
   * report in this service windows its rows: the table is one row per explained
   * miss, so there is no page of them to stream.
   */
  async varianceReasonsIn({ from, to } = {}) {
    const rows = await reasons.all({}, { sort: 'created_at' }).catch(() => []);
    return rows
      .filter((r) => {
        const day = String(r.shift_date ?? '').slice(0, 10);
        if (!day) return !from && !to;
        return (!from || day >= from) && (!to || day <= to);
      })
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  },

  /**
   * Corrects a reason that was typed wrong.
   *
   * The reason text only. The date, the shift, the parameter and the two figures
   * are what the record *is* - a reason moved onto a different parameter, or
   * re-pointed at a different day's numbers, is not a correction but a second
   * record wearing the first one's id. Getting those wrong is fixed by writing
   * the right one, which the screen already allows.
   */
  updateVarianceReason: (id, payload = {}) =>
    reasons.update(id, {
      reason: payload.reason,
      entered_by: payload.enteredBy ?? null,
    }),

  /**
   * The office accepting a reason the shift wrote, and adding its own if it has
   * one.
   *
   * The two texts stay in two columns. A manager who edits a supervisor's
   * sentence leaves a record that reads as the supervisor's words and is not,
   * and months later - when the incentive is being argued over, which is the
   * only time anybody reads these back - there is no way to tell what the shift
   * actually said. `manager_note` is beside `reason`, never over it.
   *
   * Approving is not a toggle. There is no un-approve here on purpose: a
   * sign-off that can be quietly withdrawn is not a sign-off, and an acceptance
   * given in error is corrected by the note beside it saying so.
   */
  async approveVarianceReason(id, payload = {}) {
    const row = await reasons.update(id, {
      approved_at: payload.approvedAt ?? new Date().toISOString(),
      approved_by: payload.approvedBy ?? null,
      // Only written when there is something to write, so approving without a
      // note leaves an earlier one where it was rather than clearing it.
      ...(payload.managerNote == null ? {} : { manager_note: payload.managerNote || null }),
    });
    /**
     * Refuse to report a sign-off that was not stored.
     *
     * A write naming a column the project does not have is pruned and goes
     * through - see pruneBody in config/supabase.js - which is right for a
     * tablet running ahead of a migration and wrong here. Approving is the one
     * action on this record that somebody relies on afterwards: a manager who is
     * told "approved", on a shift whose incentive turns on it, and finds nothing
     * stored has been lied to by the screen.
     *
     * So the answer is read back. If the column is absent the approval did not
     * happen and this says so, naming the migration rather than failing as a
     * mystery.
     */
    if (!row || row.approved_at == null) {
      throw ApiError.unavailable(
        'Approvals need supabase/migrations/0017_variance_reason_approval.sql - '
        + 'the sign-off columns are not on this project yet, so nothing was saved.',
      );
    }
    return row;
  },

  /**
   * `ideal` and `actual` are stored as the screen had them, not looked up again
   * here. The point of the record is the two numbers the reason was written
   * about; a benchmark raised next month must not rewrite what a manager was
   * explaining.
   */
  addVarianceReason: (payload = {}) =>
    reasons.create({
      shift_date: payload.date,
      shift: payload.shift || null,
      parameter: payload.parameter,
      label: payload.label ?? idealFieldFor(payload.parameter)?.label ?? null,
      ideal: payload.ideal ?? null,
      actual: payload.actual ?? null,
      reason: payload.reason,
      entered_by: payload.enteredBy ?? null,
    }),
};

export default efficiencyService;
