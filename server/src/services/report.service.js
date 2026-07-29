import { crud } from './base.service.js';
import { TABLES, FIREWOOD_KG_PER_LOAD } from '../config/constants.js';
import { rateService } from './rate.service.js';

/**
 * Everything here reads the columns the tablets actually write.
 *
 * Two things are easy to get wrong. A run's output is `weight_kg`, not
 * `out_weight`; and its duration is `runtime_min` / `hours_run`, NOT the gap
 * between `started_at` and `ended_at` - those two are sync timestamps written
 * seconds apart when the tablet flushes the row, so subtracting them yields
 * near-zero for every run in the plant.
 */

const runs = crud(TABLES.runs, { defaultSort: 'shift_date' });
const machineEfficiency = crud(TABLES.machineShiftEfficiency, { defaultSort: 'shift_date' });
const shiftCosting = crud(TABLES.shiftCosting, { defaultSort: 'shift_date' });
const specialBatches = crud(TABLES.specialBatchDetail, { defaultSort: 'shift_date' });
const coarseShifts = crud(TABLES.coarseShiftDetail, { defaultSort: 'shift_date' });
const dispatches = crud(TABLES.dispatches, { defaultSort: 'dispatch_date' });

const round = (n, d = 2) => +Number(n || 0).toFixed(d);
const sum = (rows, field) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);

/** `shift_date` is a 'YYYY-MM-DD' string, so a plain compare is the range test. */
const inWindow = (from, to) => (row) => {
  const d = row.shift_date;
  if (!d) return !from && !to;
  return (!from || d >= from) && (!to || d <= to);
};

/** Run hours, preferring the recorded duration over the sync timestamps. */
const runHoursOf = (r) => {
  if (r.hours_run != null) return Number(r.hours_run) || 0;
  if (r.runtime_min != null) return (Number(r.runtime_min) || 0) / 60;
  return 0;
};

const maintenance = crud(TABLES.maintenance, { defaultSort: 'down_start' });

/** 'YYYY-MM' of an ISO timestamp or a 'YYYY-MM-DD' string. */
const monthOf = (value) => (value ? String(value).slice(0, 7) : '');

export const reportService = {
  /**
   * Which days and machines the run history actually covers. The back office
   * needs it to fill its pickers, and deriving it here means the browser never
   * has to download every run to find out what months exist.
   */
  async runFilters() {
    const rows = await runs.all({}, { sort: 'shift_date' });
    const days = new Set();
    const machines = new Map();
    const shifts = new Set();
    for (const r of rows) {
      if (r.shift_date) days.add(r.shift_date);
      if (r.shift) shifts.add(r.shift);
      if (r.machine_id && !machines.has(r.machine_id)) {
        machines.set(r.machine_id, r.machine ?? r.machine_id);
      }
    }
    return {
      days: [...days].sort().reverse(),
      shifts: [...shifts].sort(),
      machines: [...machines].map(([id, name]) => ({ id, name })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
  },

  /**
   * Downtime for one month, split by machine. `month` is 'YYYY-MM'; with none
   * given it answers for the most recent month that has a breakdown, so the
   * tab opens on real data instead of an empty current month.
   */
  async downtime({ month } = {}) {
    const rows = await maintenance.all({}, { sort: 'down_start' });
    const months = [...new Set(rows.map((r) => monthOf(r.down_start)).filter(Boolean))].sort().reverse();
    const target = month || months[0] || '';

    const inMonth = rows.filter((r) => monthOf(r.down_start) === target);
    const byMachine = new Map();
    for (const r of inMonth) {
      const id = r.machine_id ?? '?';
      const m = byMachine.get(id) ?? { machineId: id, machine: r.machine ?? id, minutes: 0, events: 0 };
      m.minutes += Number(r.downtime_min || 0);
      m.events += 1;
      byMachine.set(id, m);
    }

    return {
      month: target,
      months,
      totalMinutes: round(inMonth.reduce((s, r) => s + Number(r.downtime_min || 0), 0), 1),
      events: inMonth.length,
      byMachine: [...byMachine.values()]
        .map((m) => ({ ...m, minutes: round(m.minutes, 1), hours: round(m.minutes / 60, 2) }))
        .sort((a, b) => b.minutes - a.minutes),
    };
  },

  /** Every breakdown on one machine in one month, newest first. */
  async downtimeDetail({ month, machineId } = {}) {
    const rows = await maintenance.all({}, { sort: 'down_start' });
    return rows
      .filter((r) => r.machine_id === machineId && (!month || monthOf(r.down_start) === month))
      .sort((a, b) => ((a.down_start ?? '') < (b.down_start ?? '') ? 1 : -1));
  },

  /** Headline numbers for the admin dashboard and the user Reports tab. */
  async production({ from, to } = {}) {
    const rows = (await runs.all()).filter(inWindow(from, to));
    const outKg = sum(rows, 'weight_kg');
    const runHours = rows.reduce((s, r) => s + runHoursOf(r), 0);
    return {
      window: { from: from ?? null, to: to ?? null },
      runs: rows.length,
      outKg: round(outKg),
      runHours: round(runHours, 1),
      kgPerHour: runHours ? round(outKg / runHours) : 0,
      kwh: round(sum(rows, 'kwh'), 0),
      firewoodKg: round(sum(rows, 'firewood_kg'), 0),
      packedSacks: round(sum(rows, 'packed_sacks'), 0),
    };
  },

  /**
   * Per machine utilisation and output. `machine_shift_efficiency` already
   * holds this per machine-shift, so the window is just a filter and a sum;
   * raw runs are the fallback if that snapshot was never copied over.
   */
  async efficiency({ from, to } = {}) {
    const snapshot = (await machineEfficiency.all()).filter(inWindow(from, to));

    const byMachine = {};
    if (snapshot.length) {
      for (const r of snapshot) {
        const m = (byMachine[r.machine_id] ||= {
          machineId: r.machine_id,
          machine: r.machine ?? r.machine_id,
          runs: 0, hours: 0, outKg: 0, workerHours: 0, downtimeHours: 0,
        });
        m.runs += 1;
        m.hours += Number(r.machine_hours || 0);
        m.outKg += Number(r.production_kg || 0);
        m.workerHours += Number(r.worker_hours || 0);
        m.downtimeHours += Number(r.downtime_hours || 0);
      }
    } else {
      for (const r of (await runs.all()).filter(inWindow(from, to))) {
        const m = (byMachine[r.machine_id] ||= {
          machineId: r.machine_id,
          machine: r.machine ?? r.machine_id,
          runs: 0, hours: 0, outKg: 0, workerHours: 0, downtimeHours: 0,
        });
        const h = runHoursOf(r);
        m.runs += 1;
        m.hours += h;
        m.outKg += Number(r.weight_kg || 0);
        m.workerHours += h * Number(r.workers || 0);
      }
    }

    return Object.values(byMachine)
      .map((m) => ({
        ...m,
        hours: round(m.hours, 1),
        outKg: round(m.outKg),
        downtimeHours: round(m.downtimeHours, 1),
        kgPerHour: m.hours ? round(m.outKg / m.hours) : 0,
        kgPerWorkerHour: m.workerHours ? round(m.outKg / m.workerHours) : 0,
      }))
      .sort((a, b) => b.outKg - a.outKg);
  },

  /**
   * Conversion cost from the shift/batch costing snapshots, plus revenue.
   * Dispatch rows price through the rate card; where the plant has not
   * recorded any dispatches, the batches' own `sale_value` stands in.
   */
  async costing({ from, to } = {}) {
    const window = inWindow(from, to);
    const [costingRows, batchRows, coarseRows, dispatchRows, runRows] = await Promise.all([
      shiftCosting.all(),
      specialBatches.all(),
      coarseShifts.all(),
      dispatches.all(),
      runs.all(),
    ]);

    const shifts = costingRows.filter(window);
    const batches = batchRows.filter(window);
    const coarse = coarseRows.filter(window);
    const runsInWindow = runRows.filter(window);

    let revenue = 0;
    let dispatched = 0;
    for (const d of dispatchRows) {
      const date = d.dispatch_date ?? d.dispatched_at?.slice(0, 10);
      if (from && date < from) continue;
      if (to && date > to) continue;
      const kgs = Number(d.total_kg ?? d.weight_kg ?? 0);
      const { rate } = await rateService.rateForAsync(d.customer, d.grade ?? d.quality);
      revenue += kgs * Number(rate || 0);
      dispatched += kgs;
    }
    if (!dispatchRows.length) revenue = sum(batches, 'sale_value');

    const conversionCost = sum(shifts, 'total_conversion_cost');
    const batchCost = sum(batches, 'total_cost') + sum(coarse, 'total_cost');
    const outputKg = sum(batches, 'output_kg');
    // Firewood is logged per run; fall back to the nominal load figure for
    // windows where the autoclave crews left the field blank.
    const loggedFirewood = sum(runsInWindow, 'firewood_kg');

    return {
      window: { from: from ?? null, to: to ?? null },
      autoclaveLoads: batches.length,
      firewoodKg: round(loggedFirewood || batches.length * FIREWOOD_KG_PER_LOAD, 0),
      revenue: round(revenue),
      dispatchedKg: round(dispatched),
      electricityCost: round(sum(shifts, 'electricity_cost')),
      labourCost: round(sum(shifts, 'labour_cost')),
      conversionCost: round(conversionCost),
      batchCost: round(batchCost),
      outputKg: round(outputKg),
      costPerKg: outputKg ? round(batchCost / outputKg) : 0,
    };
  },
};

export default reportService;
