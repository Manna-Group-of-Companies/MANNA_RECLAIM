import { crud, op } from './base.service.js';
import {
  TABLES,
  BEARING_INTERVAL_H,
  BUSH_MACHINE_IDS,
  BEARING_POSITIONS,
} from '../config/constants.js';
import { currentShift, todayISO } from '../utils/shift.js';

const base = crud(TABLES.maintenance, { defaultSort: 'down_start' });
const bearings = crud(TABLES.bearingLogs, { defaultSort: 'ts' });

/**
 * What has to be logged on a machine while it runs. Cracker and grinders are
 * checked every 2h, refiners every 3h; PR1, R1, R2 and Grinder 1 run on bushes
 * rather than bearings. Autoclaves have neither, so they get no spec at all.
 */
export function bearingSpec(machine) {
  if (!machine || machine.kind === 'autoclave') return null;
  const id = machine.id ?? machine._id;
  return {
    type: BUSH_MACHINE_IDS.includes(id) ? 'bush' : 'bearing',
    intervalH: BEARING_INTERVAL_H[machine.kind] ?? 3,
    positions: BEARING_POSITIONS,
  };
}

/**
 * A breakdown row records when the machine went down and when it was repaired,
 * with the cause written up in prose. There is no status/severity column, so
 * both are derived: still open while `repaired_at` is null, and severity comes
 * off how long the machine was out.
 */
const decorate = (row) => {
  if (!row) return row;
  const open = !row.repaired_at;
  const downMin = Number(row.downtime_min || 0);
  return {
    ...row,
    kind: 'breakdown',
    title: row.root_cause || 'Breakdown',
    detail: row.resolution ?? null,
    status: open ? 'open' : 'closed',
    severity: downMin >= 720 ? 'high' : downMin >= 120 ? 'medium' : 'low',
    logged_at: row.down_start ?? row.created_at ?? null,
    resolved_at: row.repaired_at ?? null,
    downtime_hours: downMin ? +(downMin / 60).toFixed(1) : 0,
  };
};

const decorateList = (result) => ({ ...result, rows: result.rows.map(decorate) });

/** Bearing logs are one row per position per reading, with a temperature. */
const decorateBearing = (row) =>
  row && {
    ...row,
    kind: row.bearing_type ?? 'bearing',
    positions: row.position != null ? [String(row.position)] : [],
    by_user: row.supervisor ?? null,
    temp_c: row.temp_c ?? null,
  };

export const maintenanceService = {
  ...base,
  bearingSpec,

  bearings: {
    ...bearings,
    async list(query = {}, filters = {}) {
      const result = await bearings.list({ order: 'desc', ...query }, filters);
      return { ...result, rows: result.rows.map(decorateBearing) };
    },
  },

  async list(query = {}, filters = {}) {
    const { status, ...rest } = filters;
    const criteria = { ...rest };
    if (status === 'open') criteria.repaired_at = op.isNull();
    if (status === 'closed') criteria.repaired_at = op.notNull();
    return decorateList(await base.list(query, criteria));
  },

  listOpen: (query = {}) => maintenanceService.list(query, { status: 'open' }),

  /** Marks a machine down. The write-up follows later, through resolve(). */
  create: (payload = {}) =>
    base
      .create({
        machine_id: payload.machineId ?? payload.machine_id,
        machine: payload.machine ?? null,
        down_start: payload.downStart || new Date().toISOString(),
        repaired_at: null,
        root_cause: payload.rootCause ?? null,
        logged_by: payload.loggedBy ?? null,
        device: payload.device ?? null,
      })
      .then(decorate),

  /**
   * Closes a breakdown and brings the machine back online. Downtime is
   * measured from the two timestamps rather than taken from the client,
   * because it is what the costing report bills against.
   */
  async resolve(id, payload = {}) {
    const row = await base.findById(id);
    const repairedAt = payload.repairedAt || new Date().toISOString();
    const downStart = row.down_start ? new Date(row.down_start).getTime() : null;
    const downtimeMin =
      downStart != null
        ? Math.max(0, Math.round(((new Date(repairedAt).getTime() - downStart) / 60000) * 10) / 10)
        : null;
    return decorate(
      await base.update(id, {
        repaired_at: repairedAt,
        downtime_min: downtimeMin,
        root_cause: payload.rootCause ?? row.root_cause,
        resolution: payload.resolution ?? payload.remarks ?? row.resolution,
        prevention: payload.prevention ?? row.prevention,
        resolved_by: payload.resolvedBy ?? null,
      }),
    );
  },

  /**
   * One reading covers every position on the machine, so this writes a row per
   * position and hands all of them back. The schedule is driven off `ts` - the
   * time the reading was taken - not when it was typed in.
   */
  async logBearings(payload = {}) {
    const ts = payload.ts || new Date().toISOString();
    const created = [];
    for (const reading of payload.readings ?? []) {
      const row = await bearings.create({
        machine_id: payload.machineId,
        machine: payload.machine ?? null,
        bearing_type: payload.kind ?? 'bearing',
        position: String(reading.position),
        temp_c: Number(reading.tempC),
        supervisor: payload.supervisor ?? payload.byUser ?? null,
        ts,
        recorded_at: ts,
        logged_at: new Date().toISOString(),
        shift_date: payload.shiftDate ?? todayISO(),
        shift: payload.shift ?? currentShift(),
        notes: payload.remarks ?? null,
      });
      created.push(decorateBearing(row));
    }
    return created;
  },

  /**
   * Per machine: what it runs on, when it was last logged and whether that is
   * now overdue. A machine that has never been logged counts as due, so it
   * surfaces instead of sitting quietly at the bottom of the list.
   */
  async dueList(machines = []) {
    const rows = await bearings.all({}, { sort: 'ts' });
    const last = new Map();
    for (const log of rows) {
      const at = new Date(log.ts).getTime();
      if (Number.isNaN(at)) continue;
      if (!last.has(log.machine_id) || at > last.get(log.machine_id)) last.set(log.machine_id, at);
    }
    const now = Date.now();
    return machines
      .map((machine) => ({ machine, spec: bearingSpec(machine) }))
      .filter(({ spec }) => spec)
      .map(({ machine, spec }) => {
        const lastAt = last.get(machine.id) ?? null;
        const dueInMin =
          lastAt == null ? 0 : Math.round((lastAt + spec.intervalH * 3.6e6 - now) / 60000);
        return {
          machineId: machine.id,
          machine: machine.name ?? machine.id,
          bearingType: spec.type,
          positions: spec.positions,
          intervalH: spec.intervalH,
          lastAt,
          dueInMin,
          due: dueInMin <= 0,
        };
      });
  },
};

export default maintenanceService;
