import { crud, op } from './base.service.js';
import { ApiError } from '../utils/ApiError.js';
import { TABLES, OPERATOR_STATIONS, OPERATOR_STATION_KEYS } from '../config/constants.js';

/**
 * Who runs the lines, and who ran them on a given shift.
 *
 * The plant pays an incentive on how a line did against its benchmarks, and a
 * figure nobody's name is against cannot be paid on. A run carries the
 * supervisor who signed it and a crew count - "3 workers" - so the record could
 * say a shift made 30 kg per man-hour and could not say whose 30 it was.
 */

const operators = crud(TABLES.operators, { defaultSort: 'name' });
const assignments = crud(TABLES.shiftOperators, { defaultSort: 'station' });

const clean = (v) => String(v ?? '').trim();

export const operatorService = {
  stations: () => OPERATOR_STATIONS,

  /** Everyone on the roster, the ones who still work here first. */
  async list({ includeInactive = false } = {}) {
    const rows = await operators.all({}, { sort: 'name' }).catch(() => []);
    return rows
      .filter((r) => includeInactive || r.active !== false)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },

  async create({ name, station = null, note = null }) {
    const trimmed = clean(name);
    if (!trimmed) throw ApiError.badRequest('An operator needs a name.');
    /*
     * Checked here as well as by the unique index, so a duplicate comes back as
     * a sentence rather than as a constraint violation. The index is what makes
     * it true; this is what makes it readable.
     */
    const existing = await operators.all({ name: op.ilike(trimmed) }).catch(() => []);
    if (existing.length) throw ApiError.conflict(`${trimmed} is already on the operator list.`);

    return operators.create({
      name: trimmed,
      station: station || null,
      note: clean(note) || null,
      active: true,
    });
  },

  /**
   * Renaming, moving or standing someone down.
   *
   * Deactivating rather than deleting, for the same reason the machine list
   * works that way: the shifts already recorded against them are part of the
   * plant's record, and a name that vanishes takes its own history with it.
   */
  update: (id, patch = {}) =>
    operators.update(id, {
      ...(patch.name === undefined ? {} : { name: clean(patch.name) }),
      ...(patch.station === undefined ? {} : { station: patch.station || null }),
      ...(patch.note === undefined ? {} : { note: clean(patch.note) || null }),
      ...(patch.active === undefined ? {} : { active: Boolean(patch.active) }),
      updated_at: new Date().toISOString(),
    }),

  /** Who was on each station for one shift, as a station -> row map. */
  async forShift({ date, shift } = {}) {
    const rows = await assignments
      .all({ shift_date: date, shift: shift || undefined }, { sort: 'station' })
      .catch(() => []);
    const by = new Map(rows.map((r) => [r.station, r]));
    return OPERATOR_STATIONS.map((s) => {
      const row = by.get(s.key) ?? null;
      return {
        station: s.key,
        label: s.label,
        operatorId: row?.operator_id ?? null,
        operator: row?.operator ?? null,
        assignedBy: row?.assigned_by ?? null,
        assignedAt: row?.updated_at ?? row?.created_at ?? null,
      };
    });
  },

  /**
   * Put somebody on a station for a shift, or take them off it.
   *
   * One row per station per shift - re-assigning updates it rather than adding a
   * second, because two people on one line for one shift is not a thing the
   * plant does and an incentive that found two would have to guess.
   *
   * The name is copied onto the row beside the id. An operator renamed next year
   * must not silently rewrite who the plant paid last March, and a row whose
   * operator has since been deleted still says who it was.
   */
  async assign({ date, shift, station, operatorId, assignedBy = null } = {}) {
    if (!OPERATOR_STATION_KEYS.includes(station)) {
      throw ApiError.badRequest(`${station} is not a station an operator is assigned to.`);
    }

    let person = null;
    if (operatorId) {
      person = await operators.findById(operatorId).catch(() => null);
      if (!person) throw ApiError.notFound('That operator is not on the list.');
      if (person.active === false) {
        throw ApiError.badRequest(`${person.name} has been stood down from the operator list.`);
      }
    }

    const existing = await assignments.all({ shift_date: date, shift, station }).catch(() => []);

    const body = {
      shift_date: date,
      shift,
      station,
      operator_id: person?.id ?? null,
      operator: person?.name ?? null,
      assigned_by: assignedBy,
      updated_at: new Date().toISOString(),
    };

    if (existing[0]) return assignments.update(existing[0].id, body);
    return assignments.create(body);
  },

  /**
   * Every shift an operator was on, over a window.
   *
   * The incentive's own question, and the reason the assignment is a row rather
   * than a note: it has to be summable per person, not readable per shift.
   */
  async shiftsFor({ from, to, operatorId } = {}) {
    const rows = await assignments.all({}, { sort: 'shift_date' }).catch(() => []);
    return rows
      .filter((r) => {
        if (operatorId && r.operator_id !== operatorId) return false;
        const day = String(r.shift_date ?? '').slice(0, 10);
        if (!day) return !from && !to;
        return (!from || day >= from) && (!to || day <= to);
      })
      .sort((a, b) => String(b.shift_date ?? '').localeCompare(String(a.shift_date ?? '')));
  },
};

export default operatorService;
