import { crud } from './base.service.js';
import { ApiError } from '../utils/ApiError.js';
import { rateService } from './rate.service.js';
import {
  TABLES,
  REFINER_IDS,
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
export function runKwh(r) {
  if (num(r.kwh) != null) return num(r.kwh);
  if (num(r.elec_end) != null && num(r.elec_start) != null) {
    return Math.max(0, num(r.elec_end) - num(r.elec_start));
  }
  return null;
}

/** One unit per shift + grade, summed across the refiner passes it went through. */
export function refinerUnits(rows) {
  const byKey = new Map();
  for (const r of rows) {
    if (r.line !== 'special' || !r.quality || !REFINER_IDS.includes(r.machine_id)) continue;
    const key = `${r.shift_date}|${r.shift ?? ''}|${r.quality}`;
    const u = byKey.get(key) ?? {
      day: r.shift_date, shift: r.shift ?? '', quality: r.quality,
      out: 0, workers: 0, hours: 0, kwh: 0, batches: new Set(),
    };
    u.workers += num(r.workers) ?? 0;
    u.hours += runHours(r) ?? 0;
    u.kwh += runKwh(r) ?? 0;
    if (r.batch_no) u.batches.add(r.batch_no);
    // Only R4 is weighed - the earlier passes are the same material moving on,
    // so counting their weights too would double-count the shift's output.
    if (r.machine_id === 'R4') {
      const w = num(r.weight_kg);
      if (w != null) u.out += w;
    }
    byKey.set(key, u);
  }
  return [...byKey.values()].map((u) => ({
    ...u,
    batches: [...u.batches],
    pmh: u.out > 0 && u.workers > 0 && u.hours > 0 ? u.out / (u.workers * u.hours) : null,
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
      day: r.shift_date, shift: r.shift ?? '', out: 0, workers: 0, hours: 0, kwh: 0,
    };
    u.out += w;
    u.workers += num(r.workers) ?? 0;
    u.hours += runHours(r) ?? 0;
    u.kwh += runKwh(r) ?? 0;
    byKey.set(key, u);
  }
  return [...byKey.values()].map((u) => ({
    ...u,
    pmh: u.out > 0 && u.workers > 0 && u.hours > 0 ? u.out / (u.workers * u.hours) : null,
    kwhkg: u.out > 0 && u.kwh > 0 ? u.kwh / u.out : null,
    // Capped at 1.5 so a mis-keyed hour meter cannot report 400% utilisation.
    util: u.hours > 0 ? Math.min(1.5, u.hours / (SHIFT_MINUTES / 60)) : null,
  }));
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
    d.labourHours += (u.workers ?? 0) * (u.hours ?? 0);
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
    if (r.machine_id === 'R4') {
      const w = num(r.weight_kg);
      if (w != null) {
        u.out += w;
        if (r.shift_date) {
          u.outDay = r.shift_date;
          u.outShift = r.shift ?? '';
        }
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
function coarseUnits(rows) {
  const byKey = new Map();
  for (const r of rows) {
    if (r.line !== 'coarse') continue;
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
    if (r.kind === 'autoclave') continue;
    const key = `${r.shift_date}|${r.shift ?? ''}`;
    const u = byKey.get(key) ?? {
      day: r.shift_date, shift: r.shift ?? '', out: 0, workers: 0, hours: 0, kwh: 0,
    };
    u.out += num(r.weight_kg) ?? 0;
    u.workers += num(r.workers) ?? 0;
    u.hours += runHours(r) ?? 0;
    u.kwh += runKwh(r) ?? 0;
    byKey.set(key, u);
  }
  // The same two rates every other line is judged on. The line has always
  // carried the figures they are made of - crew, hours and the meter - and only
  // ever reported what it weighed, so a shift could miss on energy or on labour
  // and the screen had nothing to say about it.
  return [...byKey.values()]
    .filter((u) => u.out > 0)
    .map((u) => ({
      ...u,
      pmh: u.out > 0 && u.workers > 0 && u.hours > 0 ? u.out / (u.workers * u.hours) : null,
      kwhkg: u.out > 0 && u.kwh > 0 ? u.kwh / u.out : null,
    }));
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
      machineId: r.machine_id, machine: r.machine ?? r.machine_id, day: r.shift_date, runs: 0,
    };
    u.runs += 1;
    byKey.set(key, u);
  }
  return [...byKey.values()];
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

    /** One figure on one point, measured against whatever the manager set. */
    const metric = (key, label, value, unit, digits = 2) => ({
      key,
      label,
      unit,
      value: round(value, digits),
      ...idealFor(key, value, ideals, digits),
    });

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
          kwh: round(u.kwh, 1),
          batches: u.batches,
        },
        metrics: [
          metric(idealKey.specialPerManHour(u.quality), 'Production per man-hour', u.pmh, 'kg/man-h'),
          metric(idealKey.specialKwhPerKg(u.quality), 'Electricity', u.kwhkg, 'kWh/kg', 3),
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
          kwh: round(u.kwh, 1),
        },
        metrics: [
          metric(idealKey.production(u.machineId), 'Output', u.out, 'kg', 0),
          metric(idealKey.perManHour(u.machineId), 'Production per man-hour', u.pmh, 'kg/man-h'),
          metric(idealKey.kwhPerKg(u.machineId), 'Electricity', u.kwhkg, 'kWh/kg', 3),
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
          kwh: round(u.kwh, 1),
        },
        metrics: [
          metric(idealKey.production('COARSE'), 'Output', u.out, 'kg', 0),
          metric(idealKey.perManHour('COARSE'), 'Production per man-hour', u.pmh, 'kg/man-h'),
          metric(idealKey.kwhPerKg('COARSE'), 'Electricity', u.kwhkg, 'kWh/kg', 3),
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
        metrics: [metric(idealKey.autoclaveRuns(vessel.key), 'Charges a day', u.runs, 'charges', 0)],
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
        metrics: [metric(idealKey.batchYield(), 'Yield', y.pct, '%', 1)],
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
      const downMin = Math.max(0, SHIFT_MINUTES - u.hours * 60);
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
                `this ${shift || 'shift'} on its own = ${round(u.out, 0)} ÷ (${u.workers} × ${round(u.hours)}) = ${round(u.pmh, 1)}`,
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
            value: u.util == null ? null : round(u.util * 100, 0),
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
            warn: u.util != null && u.util < TH.utilisation,
            warnLabel: 'high downtime',
            // Declared null rather than left off, so every metric on the wire
            // answers the same question the same way: this is not a figure the
            // manager sets a target against, so the card must not ask for one.
            parameter: null,
            calc: u.util == null ? null : {
              title: 'Time · utilisation',
              formula: 'run hours ÷ 12 h shift',
              lines: [
                `ran = ${round(u.hours)} h`,
                `= ${round(u.hours)} ÷ 12`,
                `downtime = 12 − ${round(u.hours)} = ${round(downMin / 60)} h`,
              ],
              result: `${round(u.util * 100, 0)}%`,
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
                `labour = ${round(day.labourHours, 1)} labour-hours (crew × hours, summed per shift)`,
                `= ${round(day.out, 0)} ÷ ${round(day.labourHours, 1)}`,
                `this ${shift || 'shift'} on its own = ${round(u.out, 0)} ÷ (${u.workers} × ${round(u.hours)}) = ${round(u.pmh, 1)}`,
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
    const autoclaves = IDEAL_AUTOCLAVES.map((vessel) => {
      const today = acAll.find((u) => u.machineId === vessel.key && u.day === date);
      const runsToday = today?.runs ?? 0;
      return {
        key: `autoclave|${vessel.key}`,
        line: 'autoclave',
        operator: operatorOf('AUTOCLAVES'),
        machineId: vessel.key,
        label: vessel.label,
        metrics: [
          {
            key: 'runs',
            label: 'Charges today',
            value: runsToday,
            unit: 'runs/day',
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
