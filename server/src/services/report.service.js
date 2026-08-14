import { crud } from './base.service.js';
import { TABLES, VIEWS, FIREWOOD_KG_PER_LOAD, isMoulding } from '../config/constants.js';
import { rateService } from './rate.service.js';
import { crumbCost, autoclaveCharge } from './crumb.service.js';
import { fromRow as dispatchFromRow } from './dispatch.service.js';
import { batchService } from './batch.service.js';

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
const machineEfficiency = crud(VIEWS.machineShiftEfficiency, { defaultSort: 'shift_date' });
const shiftCosting = crud(VIEWS.shiftCosting, { defaultSort: 'shift_date' });
const specialBatches = crud(VIEWS.specialBatchDetail, { defaultSort: 'shift_date' });
const coarseShifts = crud(VIEWS.coarseShiftDetail, { defaultSort: 'shift_date' });
const dispatches = crud(TABLES.dispatches, { defaultSort: 'dispatched_at' });

/**
 * The count inside a batch number, whatever is written around it.
 *
 * The crews count batches up, so the newest is the highest and that is the end
 * of the picker they want to open on. Reading it with parseFloat got that right
 * only for a bare number: 'H-3077' came back NaN, so every prefixed reference
 * fell into the string branch and the whole set of them was hoisted above the
 * lot. The plant's picker opened on sixteen H- numbers and the batch charged
 * this morning was seventeenth, which reads as the list not having it.
 */
const batchNumberOf = (ref) => {
  const digits = /\d+/.exec(String(ref ?? ''));
  return digits ? Number(digits[0]) : Number.NaN;
};

/**
 * Newest first, with a prefixed number sitting beside the bare one it matches -
 * 'H-3077' belongs next to '3077', not in a block of its own. Anything with no
 * number in it at all goes to the bottom rather than to the top, where it would
 * be the first thing read.
 */
const byBatchNumber = (a, b) => {
  const na = batchNumberOf(a);
  const nb = batchNumberOf(b);
  if (Number.isNaN(na) && Number.isNaN(nb)) return a < b ? -1 : a > b ? 1 : 0;
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  if (na !== nb) return nb - na;
  // Same count, different way of writing it. The bare number first: it is the
  // one the runs are filed under.
  return a < b ? -1 : a > b ? 1 : 0;
};

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
   * Which days, machines and batches the run history actually covers. Both the
   * back office and the shop-floor History tab need it to fill their pickers,
   * and deriving it here means the browser never has to download every run to
   * find out what months exist.
   */
  async runFilters() {
    const [rows, refs] = await Promise.all([
      runs.all({}, { sort: 'shift_date' }),
      // Quietly: the pickers are worth having with one list missing from them,
      // and a blob that would not read is not a reason to refuse the History
      // tab its days, shifts and machines as well.
      batchService.refs().catch(() => []),
    ]);
    const days = new Set();
    const machines = new Map();
    const shifts = new Set();
    const batches = new Set();
    for (const r of rows) {
      if (r.shift_date) days.add(r.shift_date);
      if (r.shift) shifts.add(r.shift);
      if (r.batch_no) batches.add(String(r.batch_no));
      if (r.machine_id && !machines.has(r.machine_id)) {
        machines.set(r.machine_id, r.machine ?? r.machine_id);
      }
    }

    /*
     * The batches the plant has opened, on top of the ones its runs mention.
     *
     * Those two are not the same list, and the gap is exactly the batch
     * somebody goes looking for: a charge opened this morning has no run
     * against it yet, so it was missing from the picker until the first pass
     * was logged - and so was every orphan, which is the case where the whole
     * question is "why is there nothing under this number".
     *
     * Compared case-insensitively, because the plant reads "b-104" and "B-104"
     * as one batch and offering both would be offering the same charge twice.
     */
    const seen = new Set([...batches].map((b) => b.toLowerCase()));
    for (const ref of refs) {
      const key = ref.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      batches.add(ref);
    }
    return {
      days: [...days].sort().reverse(),
      shifts: [...shifts].sort(),
      machines: [...machines].map(([id, name]) => ({ id, name })).sort((a, b) => (a.id < b.id ? -1 : 1)),
      batches: [...batches].sort(byBatchNumber),
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

  /**
   * Headline numbers for the admin dashboard and the user Reports tab.
   *
   * The presses are left out of the output figure. What comes off a press is
   * finished goods moulded from reclaim the plant has already counted as its
   * output, so adding their kilos in would count the same material twice. Press
   * runs are reported on their own terms - pieces, and what they cost in
   * material - in History. Sleeve and loop are moulded the same way and off the
   * same reclaim, so they are left out for the same reason - a kg counted once
   * at the grinder must not be counted again as a finished loop.
   */
  async production({ from, to } = {}) {
    const rows = (await runs.all()).filter(inWindow(from, to));
    const moulded = (r) => r.kind === 'press' || isMoulding(r.kind);
    const outKg = sum(rows.filter((r) => !moulded(r)), 'weight_kg');
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
   *
   * `crumb` is the front of the plant, worked out from the runs rather than off
   * a snapshot: what the grinding line spent making a kg of crumb, picking gang
   * included, and what the autoclave charges in this window therefore cost in
   * crumb. See crumb.service.js - the Costing tab reads both.
   */
  async costing({ from, to } = {}) {
    const window = inWindow(from, to);
    const [costingRows, batchRows, coarseRows, dispatchRows, runRows, costRates] = await Promise.all([
      shiftCosting.all(),
      specialBatches.all(),
      coarseShifts.all(),
      dispatches.all(),
      runs.all(),
      rateService.costRates(),
    ]);

    const shifts = costingRows.filter(window);
    const batches = batchRows.filter(window);
    const coarse = coarseRows.filter(window);
    const runsInWindow = runRows.filter(window);

    let revenue = 0;
    let dispatched = 0;
    for (const raw of dispatchRows) {
      const d = dispatchFromRow(raw);
      const date = d.dispatch_date;
      if (from && date < from) continue;
      if (to && date > to) continue;
      const kgs = Number(d.total_kg ?? 0);
      const { rate } = await rateService.rateForAsync(d.customer, d.grade);
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

    // The grinding line, costed off its own runs: a kg of crumb, and the charge
    // the autoclaves ate. The Costing tab shows this as the material going into
    // the vessels, and takes the works half back out of the conversion line
    // below so the same electricity and the same crew are not charged twice.
    const crumb = crumbCost(runsInWindow, costRates?.data ?? {});

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
      crumb: { ...crumb, autoclave: autoclaveCharge(runsInWindow, crumb.perKg) },
    };
  },
};

export default reportService;
