import { crud } from './base.service.js';
import {
  TABLES,
  REFINER_IDS,
  GRINDER_IDS,
  SHIFT_MINUTES,
  EFFICIENCY_THRESHOLDS as TH,
} from '../config/constants.js';

/**
 * The back office's efficiency view, computed here rather than in the browser.
 *
 * The point of this screen is comparison: is *this* shift worse than the plant
 * usually manages? "Usual" is the median of the same figure across every shift
 * on record, so answering it needs the whole run history - which is exactly
 * what should not be shipped to a phone. The client gets one shift's cards
 * with the baselines already attached.
 *
 * Medians, not means: one catastrophic shift (a burst pipe, a 10-hour power
 * cut) would drag a mean down for months and quietly stop flagging anything.
 */

const runs = crud(TABLES.runs, { defaultSort: 'shift_date' });
const notes = crud(TABLES.efficiencyNotes, { defaultSort: 'created_at' });

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const round = (n, d = 2) => (n == null ? null : +Number(n).toFixed(d));

function median(values) {
  const a = values.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

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
function refinerUnits(rows) {
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
function grinderUnits(rows) {
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

const baselineBy = (units, keyOf, valueOf) => {
  const buckets = new Map();
  for (const u of units) {
    const v = valueOf(u);
    if (v == null) continue;
    const key = keyOf(u);
    buckets.set(key, [...(buckets.get(key) ?? []), v]);
  }
  return Object.fromEntries([...buckets].map(([k, vs]) => [k, median(vs)]));
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
   * One shift's cards, each metric carrying the plant's usual value and
   * whether this shift is below it. `calc` spells out the arithmetic so the
   * screen can show its working rather than asking anyone to trust a number.
   */
  async forShift({ date, shift } = {}) {
    const all = await runs.all({}, { sort: 'shift_date' });

    const refAll = refinerUnits(all);
    const grindAll = grinderUnits(all);
    const yieldAll = batchYields(all);

    const basePmh = baselineBy(refAll, (u) => u.quality, (u) => u.pmh);
    const baseKwh = baselineBy(refAll, (u) => u.quality, (u) => u.kwhkg);
    const baseGrindPmh = baselineBy(grindAll, (u) => u.machineId, (u) => u.pmh);
    const baseGrindKwh = baselineBy(grindAll, (u) => u.machineId, (u) => u.kwhkg);
    const baseYield = median(yieldAll.map((u) => u.pct));

    const here = (u) => u.day === date && (u.shift ?? '') === shift;
    const shiftRows = all.filter((r) => r.shift_date === date && (r.shift ?? '') === shift);

    const refiners = refAll.filter(here).sort((a, b) => (a.quality < b.quality ? -1 : 1)).map((u) => {
      const bp = basePmh[u.quality] ?? null;
      const be = baseKwh[u.quality] ?? null;
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
            value: round(u.pmh),
            baseline: round(bp),
            warn: u.pmh != null && bp != null && u.pmh < bp * TH.labour,
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
              note: `Usual = median across every ${u.quality} shift so far = ${round(bp) ?? '—'}. Flagged below ${Math.round(TH.labour * 100)}% of usual (${round(bp == null ? null : bp * TH.labour) ?? '—'}).`,
            },
          },
          {
            key: 'kwhkg',
            label: 'Electricity (kWh/kg)',
            value: round(u.kwhkg, 3),
            baseline: round(be, 3),
            warn: u.kwhkg != null && be != null && u.kwhkg > be * TH.energy,
            calc: u.kwhkg == null ? null : {
              title: 'Electricity (kWh / kg)',
              formula: 'total energy ÷ output',
              lines: [
                `energy = ${round(u.kwh, 1)} kWh (all refiner passes)`,
                `output = ${round(u.out, 0)} kg`,
                `= ${round(u.kwh, 1)} ÷ ${round(u.out, 0)}`,
              ],
              result: `${round(u.kwhkg, 3)} kWh/kg`,
              note: `Usual = median across every ${u.quality} shift = ${round(be, 3) ?? '—'}. Flagged above ${Math.round(TH.energy * 100)}% of usual (${round(be == null ? null : be * TH.energy, 3) ?? '—'}).`,
            },
          },
          {
            key: 'out',
            label: 'Output (maximise)',
            value: round(u.out, 0),
            unit: 'kg',
            baseline: null,
            baselineLabel: `labour: ${u.workers} crew · ${round(u.hours, 1)} h`,
            warn: false,
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
      const bp = baseGrindPmh[u.machineId] ?? null;
      const be = baseGrindKwh[u.machineId] ?? null;
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
            value: round(u.pmh, 1),
            baseline: round(bp, 1),
            warn: u.pmh != null && bp != null && u.pmh < bp * TH.labour,
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
              note: `Usual for ${u.machine} = ${round(bp, 1) ?? '—'} (median). Flagged below ${Math.round(TH.labour * 100)}% of usual.`,
            },
          },
          {
            key: 'kwhkg',
            label: 'Electricity (kWh/kg)',
            value: round(u.kwhkg, 3),
            baseline: round(be, 3),
            warn: u.kwhkg != null && be != null && u.kwhkg > be * TH.energy,
            calc: u.kwhkg == null ? null : {
              title: 'Electricity (kWh / kg)',
              formula: 'energy ÷ output',
              lines: [
                `energy = ${round(u.kwh, 1)} kWh${u.machineId === 'GRD_O' ? ' (TOD meter × 3)' : ''}`,
                `output = ${round(u.out, 0)} kg`,
                `= ${round(u.kwh, 1)} ÷ ${round(u.out, 0)}`,
              ],
              result: `${round(u.kwhkg, 3)} kWh/kg`,
              note: `Usual for ${u.machine} = ${round(be, 3) ?? '—'}. Flagged above ${Math.round(TH.energy * 100)}% of usual.`,
            },
          },
          {
            key: 'util',
            label: 'Time · utilisation',
            value: u.util == null ? null : round(u.util * 100, 0),
            unit: '%',
            baseline: null,
            baselineLabel: `of 12 h · downtime ${round(downMin / 60)} h`,
            warn: u.util != null && u.util < TH.utilisation,
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
            baseline: null,
            baselineLabel: `labour: ${u.workers} crew · ${round(u.hours, 1)} h`,
            warn: false,
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
            baseline: round(baseYield, 1),
            baselineLabel: `usual ${round(baseYield, 1) ?? '—'}% · out ${round(y.out, 0)} kg`,
            warn: y.pct != null && baseYield != null && y.pct < baseYield * TH.yield,
            calc: {
              title: 'Yield',
              formula: 'output ÷ autoclave charge × 100',
              lines: [
                `output = ${round(y.out, 0)} kg (all grades weighed)`,
                `charge = ${y.charge} kg`,
                `= ${round(y.out, 0)} ÷ ${y.charge} × 100`,
              ],
              result: `${round(y.pct, 1)} %`,
              note: `Usual = median yield across all batches = ${round(baseYield, 1) ?? '—'}%. Flagged below ${Math.round(TH.yield * 100)}% of usual.`,
            },
          },
        ],
      }));

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
      yields,
      thresholds: TH,
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
};

export default efficiencyService;
