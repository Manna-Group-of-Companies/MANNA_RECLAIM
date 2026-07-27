import { crud } from './base.service.js';
import { TABLES, FIREWOOD_KG_PER_LOAD } from '../config/constants.js';
import { rateService } from './rate.service.js';

const runs = crud(TABLES.runs, { defaultSort: 'shift_date' });
const batches = crud(TABLES.batches, { defaultSort: 'opened_at' });
const dispatches = crud(TABLES.dispatches, { defaultSort: 'dispatch_date' });

const hours = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 3.6e6 : 0);
const round = (n, d = 2) => +Number(n || 0).toFixed(d);

export const reportService = {
  /** Headline numbers for the admin dashboard and the user Reports tab. */
  async production({ from, to, limit = 500 } = {}) {
    const { rows } = await runs.list({ limit });
    const scoped = rows.filter((r) => (!from || r.shift_date >= from) && (!to || r.shift_date <= to));
    const outKg = scoped.reduce((s, r) => s + Number(r.out_weight || 0), 0);
    const runHours = scoped.reduce((s, r) => s + hours(r.started_at, r.stopped_at), 0);
    return {
      window: { from: from ?? null, to: to ?? null },
      runs: scoped.length,
      outKg: round(outKg),
      runHours: round(runHours, 1),
      kgPerHour: runHours ? round(outKg / runHours) : 0,
    };
  },

  /** Per machine utilisation and output, driving the Efficiency tab. */
  async efficiency({ from, to, limit = 500 } = {}) {
    const { rows } = await runs.list({ limit });
    const byMachine = {};
    for (const r of rows) {
      if (from && r.shift_date < from) continue;
      if (to && r.shift_date > to) continue;
      const m = (byMachine[r.machine_id] ||= {
        machineId: r.machine_id, runs: 0, hours: 0, outKg: 0, workerHours: 0,
      });
      m.runs += 1;
      const h = hours(r.started_at, r.stopped_at);
      m.hours += h;
      m.outKg += Number(r.out_weight || 0);
      m.workerHours += h * Number(r.workers || 0);
    }
    return Object.values(byMachine).map((m) => ({
      ...m,
      hours: round(m.hours, 1),
      outKg: round(m.outKg),
      kgPerHour: m.hours ? round(m.outKg / m.hours) : 0,
      kgPerWorkerHour: m.workerHours ? round(m.outKg / m.workerHours) : 0,
    }));
  },

  /** Costing tab: firewood per autoclave load plus revenue from dispatches. */
  async costing({ from, to } = {}) {
    const [{ rows: batchRows }, { rows: dispatchRows }] = await Promise.all([
      batches.list({ limit: 500 }),
      dispatches.list({ limit: 500 }),
    ]);
    const loads = batchRows.filter(
      (b) => (!from || b.opened_at >= from) && (!to || b.opened_at <= to),
    ).length;

    let revenue = 0;
    for (const d of dispatchRows) {
      if (from && d.dispatch_date < from) continue;
      if (to && d.dispatch_date > to) continue;
      const { rate } = await rateService.rateForAsync(d.customer, d.grade);
      revenue += Number(d.total_kg || 0) * Number(rate || 0);
    }

    return {
      window: { from: from ?? null, to: to ?? null },
      autoclaveLoads: loads,
      firewoodKg: loads * FIREWOOD_KG_PER_LOAD,
      revenue: round(revenue),
    };
  },
};

export default reportService;
