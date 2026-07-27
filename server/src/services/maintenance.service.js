import { crud } from './base.service.js';
import { TABLES } from '../config/constants.js';

const base = crud(TABLES.maintenance, { defaultSort: 'logged_at' });
const bearings = crud(TABLES.bearingLogs, { defaultSort: 'ts' });

/** Cracker and grinders are greased every 2h, refiners every 3h. */
const INTERVAL_HOURS = { grind: 2, refiner: 3, prerefiner: 3, coarse: 3 };

export const maintenanceService = {
  ...base,
  bearings,

  listOpen: (query = {}) => base.list(query, { status: 'open' }),

  resolve: (id, { resolvedBy, remarks }) =>
    base.update(id, {
      status: 'closed',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy ?? null,
      remarks: remarks ?? null,
    }),

  logBearing: (payload) =>
    bearings.create({
      machine_id: payload.machineId,
      kind: payload.kind ?? 'bearing',
      positions: payload.positions ?? null,
      by_user: payload.byUser ?? null,
      ts: payload.ts || new Date().toISOString(),
      remarks: payload.remarks ?? null,
    }),

  /** Per machine: last greasing time and whether it is due. */
  async dueList(machines = []) {
    const { rows } = await bearings.list({ limit: 500 });
    const last = new Map();
    for (const log of rows) {
      const at = new Date(log.ts).getTime();
      if (!last.has(log.machine_id) || at > last.get(log.machine_id)) last.set(log.machine_id, at);
    }
    const now = Date.now();
    return machines
      .filter((m) => m.kind !== 'autoclave')
      .map((m) => {
        const intervalH = INTERVAL_HOURS[m.kind] ?? 3;
        const lastAt = last.get(m.id) ?? null;
        const dueInMin = lastAt == null ? 0 : Math.round((lastAt + intervalH * 3.6e6 - now) / 60000);
        return { machineId: m.id, intervalH, lastAt, dueInMin, due: dueInMin <= 0 };
      });
  },
};

export default maintenanceService;
