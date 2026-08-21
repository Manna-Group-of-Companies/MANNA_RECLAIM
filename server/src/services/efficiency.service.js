import { crud } from './base.service.js';
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
} from '../config/constants.js';

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

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const round = (n, d = 2) => (n == null ? null : +Number(n).toFixed(d));

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
  return [...byKey.values()].filter((u) => u.out > 0);
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
  if (value == null || target == null) {
    return { ideal: round(target, digits), variance: null, variancePct: null, offTarget: false };
  }
  const variance = value - target;
  return {
    ideal: round(target, digits),
    variance: round(variance, digits),
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
  const comparison = againstIdeal(value, ideals?.[key], {
    lowerIsBetter: field?.lowerIsBetter ?? false,
    digits,
  });
  return { parameter: key, idealLabel: field?.label ?? null, ...comparison };
}

/**
 * A figure that carries no target of its own, and why.
 *
 * `parameter` is deliberately null rather than a key with nothing behind it. The
 * screen reads a null parameter as "this figure is not one a target is set
 * against" and a set parameter with a null ideal as "a target belongs here and
 * nobody has filled it in" - two different sentences, and the second is the one
 * that should nag a manager. Energy and labour productivity are the case: they
 * are benchmarked over the whole day, so the shift card shows the figure and the
 * day card below carries the comparison.
 */
const noTargetHere = (why) => ({
  parameter: null,
  idealLabel: null,
  ideal: null,
  variance: null,
  variancePct: null,
  offTarget: false,
  context: why,
});

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

    const refiners = refAll.filter(here).sort((a, b) => (a.quality < b.quality ? -1 : 1)).map((u) => {
      const dayCard = 'compared on the whole-day card below';
      return {
        key: `refiner|${u.quality}`,
        quality: u.quality,
        batches: u.batches,
        out: round(u.out, 0),
        workers: u.workers,
        hours: round(u.hours),
        kwh: round(u.kwh, 1),
        metrics: [
          {
            key: 'pmh',
            label: 'Production / man-hour',
            unit: 'kg/man-hour',
            value: round(u.pmh),
            warn: false,
            // The manager's benchmark for this figure is set against the day, so
            // the comparison - and the flag - are on the day card below. The
            // shift's own figure stays here because a supervisor works a shift,
            // not a day, and a card that hid it would be hiding the number the
            // conversation is actually about.
            ...noTargetHere(dayCard),
            calc: u.pmh == null ? null : {
              title: 'Production / man-hour',
              formula: 'output ÷ (total crew × total hours)',
              lines: [
                `output = ${round(u.out, 0)} kg (R4 weighed)`,
                `crew = ${u.workers} (summed over the refiner passes)`,
                `hours = ${round(u.hours)} h (summed over the refiner passes)`,
                `= ${round(u.out, 0)} ÷ (${u.workers} × ${round(u.hours)}) = ${round(u.workers * u.hours)}`,
              ],
              result: `${round(u.pmh)}`,
              note: `The ideal for ${u.quality} labour productivity is set per day, so this shift's figure is shown for context and the comparison is made on the whole-day card below.`,
            },
          },
          {
            key: 'kwhkg',
            label: 'Electricity (kWh/kg)',
            unit: 'kWh/kg',
            value: round(u.kwhkg, 3),
            warn: false,
            ...noTargetHere(dayCard),
            calc: u.kwhkg == null ? null : {
              title: 'Electricity (kWh / kg)',
              formula: 'total energy ÷ output',
              lines: [
                `energy = ${round(u.kwh, 1)} kWh (all refiner passes)`,
                `output = ${round(u.out, 0)} kg`,
                `= ${round(u.kwh, 1)} ÷ ${round(u.out, 0)}`,
              ],
              result: `${round(u.kwhkg, 3)} kWh/kg`,
              note: `The ideal for ${u.quality} energy is set per day, so this shift's figure is shown for context and the comparison is made on the whole-day card below.`,
            },
          },
          {
            key: 'out',
            label: 'Output',
            value: round(u.out, 0),
            unit: 'kg',
            warn: false,
            /**
             * Shown, and deliberately not compared with anything.
             *
             * One charge is worked into several grades at once and the split
             * between them is a market decision, so how much Special rather
             * than SuperFine came off R4 this shift is an instruction the line
             * followed, not a result it can be held to. A kg/shift target here
             * would ask a supervisor to explain having made what he was told to
             * make. What the line *is* answerable for - how efficiently it
             * worked, whatever the split - is on the whole-day card below.
             */
            ...noTargetHere(
              `${u.workers} crew · ${round(u.hours, 1)} h · grade split follows demand`,
            ),
            calc: {
              title: 'Output',
              formula: 'total weighed output of this grade in this shift',
              lines: [`= sum of R4 weights over ${round(u.hours)} h with ${u.workers} crew`],
              result: `${round(u.out, 0)} kg`,
              note: '',
            },
          },
        ],
      };
    });

    const grinders = grindAll.filter(here).sort((a, b) => (a.machineId < b.machineId ? -1 : 1)).map((u) => {
      const dayCard = 'compared on the whole-day card below';
      const downMin = Math.max(0, SHIFT_MINUTES - u.hours * 60);
      return {
        key: `grind|${u.machineId}`,
        machineId: u.machineId,
        machine: u.machine,
        out: round(u.out, 0),
        workers: u.workers,
        hours: round(u.hours),
        metrics: [
          {
            key: 'pmh',
            label: 'Production / man-hour',
            unit: 'kg/man-hour',
            value: round(u.pmh, 1),
            warn: false,
            // The benchmark for this one is per day - see the day card below.
            ...noTargetHere(dayCard),
            calc: u.pmh == null ? null : {
              title: 'Production / man-hour',
              formula: 'output ÷ (crew × hours)',
              lines: [
                `output = ${round(u.out, 0)} kg`,
                `crew = ${u.workers}`,
                `hours = ${round(u.hours)} h`,
                `= ${round(u.out, 0)} ÷ (${u.workers} × ${round(u.hours)})`,
              ],
              result: `${round(u.pmh, 1)}`,
              note: `The ideal for ${u.machine} labour productivity is set per day, so this shift's figure is shown for context and the comparison is made on the whole-day card below.`,
            },
          },
          {
            key: 'kwhkg',
            label: 'Electricity (kWh/kg)',
            unit: 'kWh/kg',
            value: round(u.kwhkg, 3),
            warn: false,
            ...noTargetHere(dayCard),
            calc: u.kwhkg == null ? null : {
              title: 'Electricity (kWh / kg)',
              formula: 'energy ÷ output',
              lines: [
                `energy = ${round(u.kwh, 1)} kWh`,
                `output = ${round(u.out, 0)} kg`,
                `= ${round(u.kwh, 1)} ÷ ${round(u.out, 0)}`,
              ],
              result: `${round(u.kwhkg, 3)} kWh/kg`,
              note: `The ideal for ${u.machine} energy is set per day, so this shift's figure is shown for context and the comparison is made on the whole-day card below.`,
            },
          },
          {
            key: 'util',
            label: 'Time · utilisation',
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
            value: round(u.out, 0),
            unit: 'kg',
            context: `labour: ${u.workers} crew · ${round(u.hours, 1)} h`,
            warn: false,
            ...idealFor(idealKey.production(u.machineId), u.out, ideals, 0),
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
    const coarse = coarseAll.filter(here).map((u) => ({
      key: 'coarse|line',
      line: 'coarse',
      label: 'Coarse line',
      out: round(u.out, 0),
      workers: u.workers,
      hours: round(u.hours),
      metrics: [
        {
          key: 'out',
          label: 'Output',
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
      ],
    }));

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
     * The two efficiency benchmarks, against the day.
     *
     * Per day and not per shift because that is what the plant sets them as, and
     * the difference is not academic: a night shift that ran four hours on a line
     * the day shift had already warmed up is not a worse crew, and holding each
     * half of a day against a whole-day target would report it as one. The shift
     * cards above still show both figures for the shift, because that is the
     * span a supervisor works - but they carry no comparison, and this is the
     * only place either figure is flagged.
     *
     * Both lines are folded the same way and rendered from one list, so a grinder
     * and a grade of the special line cannot end up compared by different
     * arithmetic. Every card is keyed on the benchmark it is measured against.
     */
    const dayOf = (units, keyOf, idealKeys, describe) => {
      const daily = dailyUnits(units, keyOf);

      return daily
        .filter((d) => d.day === date)
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .map((d) => {
          const spread = `${d.shifts} shift${d.shifts === 1 ? '' : 's'} · ${round(d.out, 0)} kg · ${round(d.labourHours, 1)} labour-h`;
          return {
            key: `day|${keyOf(d)}`,
            line: 'day',
            label: describe(d),
            out: round(d.out, 0),
            metrics: [
              {
                key: 'kwhkg',
                label: 'Electricity (kWh/kg)',
                unit: 'kWh/kg',
                value: round(d.kwhkg, 3),
                context: spread,
                warn: false,
                ...idealFor(idealKeys.kwh(d), d.kwhkg, ideals, 3),
                calc: d.kwhkg == null ? null : {
                  title: 'Electricity (kWh / kg) · whole day',
                  formula: "the day's energy ÷ the day's output",
                  lines: [
                    `energy = ${round(d.kwh, 1)} kWh over ${d.shifts} shift${d.shifts === 1 ? '' : 's'}`,
                    `output = ${round(d.out, 0)} kg`,
                    `= ${round(d.kwh, 1)} ÷ ${round(d.out, 0)}`,
                  ],
                  result: `${round(d.kwhkg, 3)} kWh/kg`,
                  note: 'Measured over the whole day, which is how the ideal is set.',
                },
              },
              {
                key: 'pmh',
                label: 'Labour productivity',
                unit: 'kg/man-hour',
                value: round(d.pmh, 1),
                context: spread,
                warn: false,
                ...idealFor(idealKeys.pmh(d), d.pmh, ideals, 1),
                calc: d.pmh == null ? null : {
                  title: 'Labour productivity · whole day',
                  formula: "the day's output ÷ the day's labour-hours",
                  lines: [
                    `output = ${round(d.out, 0)} kg`,
                    // Crew × hours is worked out inside each shift and then added.
                    // Summing crew across the day and multiplying would price a
                    // day of 2 hands over 12 h and 3 over 4 h as eighty
                    // labour-hours, where the plant spent thirty-six.
                    `labour = ${round(d.labourHours, 1)} labour-hours (crew × hours, summed per shift)`,
                    `= ${round(d.out, 0)} ÷ ${round(d.labourHours, 1)}`,
                  ],
                  result: `${round(d.pmh, 1)} kg/man-hour`,
                  note: 'Measured over the whole day, which is how the ideal is set.',
                },
              },
            ],
          };
        });
    };

    const days = [
      ...dayOf(
        grindAll,
        (u) => u.machineId,
        { kwh: (d) => idealKey.kwhPerKg(d.key), pmh: (d) => idealKey.perManHour(d.key) },
        (d) => d.machine ?? d.key,
      ),
      ...dayOf(
        refAll,
        (u) => u.quality,
        {
          kwh: (d) => idealKey.specialKwhPerKg(d.key),
          pmh: (d) => idealKey.specialPerManHour(d.key),
        },
        (d) => `Special line · ${d.key}`,
      ),
    ];

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
      refiners,
      grinders,
      coarse,
      autoclaves,
      /**
       * kWh/kg and kg/man-hour for the whole day, per grinder and per grade of
       * the special line - the granularity the manager sets those two at, and so
       * the only place they are compared with a target.
       */
      days,
      yields,
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
