import { crud, op } from './base.service.js';
import {
  TABLES, SHIFTS, SHIFT_WINDOW, OFF_MACHINE_STATIONS,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Who came through the gate, and where the supervisor put them.
 *
 * Every labour figure in this app rests on a number a supervisor types from
 * memory at the end of a pass: `workers`, usually 3. Kilograms per man-hour, the
 * incentive, the whole batch comparison - all of it is that number times the
 * hours. Nobody has ever been able to check it against who actually walked in,
 * because the punch reader at the gate and this app have never spoken.
 *
 * The reader is an Identix K90+ID on the plant LAN at 192.168.1.40. This API
 * runs on a rack in another country and cannot reach it and never will, so the
 * punches arrive the way the SAP figures do: a script inside the plant reads the
 * device and posts a window of punches through /sync, carrying a shared secret.
 * See sync.routes and PUNCH-SYNC-PROMPT.md.
 *
 * WHICH PUNCHES ARE WORKERS. The gate does not know. It punches the office, the
 * drivers and the managing director exactly as it punches a refiner hand, and
 * what a supervisor needs at the start of a shift is his own crew. So the answer
 * comes from the roster the app already keeps: an `operators` row with a punch
 * code against it is a production worker, and that is the whole definition.
 *
 * Everybody else who punched is returned too, apart and unassigned, under
 * `offRoster`. Not filtered away - filtering would mean the day a new hand
 * starts, he punches in, does a shift, and simply is not on the screen, with
 * nothing anywhere to say why. Listed, he is one tap from being claimed.
 */
const punches = crud(TABLES.attendancePunches, { defaultSort: 'punched_at' });
const labour = crud(TABLES.shiftLabour, { defaultSort: 'created_at' });
const operators = crud(TABLES.operators, { defaultSort: 'name' });
const machines = crud(TABLES.machines, { defaultSort: 'sort_order' });

/** The plant's clock, in minutes past midnight. Day is 08:30 to 20:30. */
const minutesOf = (time) => {
  const [h = '0', m = '0'] = String(time ?? '').split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
};

const dayBefore = (date) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * How early a crew punches in, and how late they punch out.
 *
 * Not guesses. 79,250 punches off the gate say the plant arrives in the 08:00
 * hour and in the 20:00 hour - both of them *before* the shift they are coming
 * for - and leaves in the same two hours. On 28 August the day crew punched in
 * between 08:13 and 08:35 and the night crew punched out between 08:30 and
 * 08:33, all around one boundary.
 *
 * Three hours before covers the four who arrive at six for a shift that starts
 * at half past eight. Ninety minutes after covers a crew signing out late,
 * without reaching a genuine mid-morning departure - somebody leaving at half
 * past twelve went home from the shift they were on, not from the night before.
 */
const EARLY_IN_MIN = 180;
const LATE_OUT_MIN = 90;

/**
 * Which shift a punch belongs to, from the device's own clock and which way
 * through the gate it was.
 *
 * The night runs half past eight in the evening to half past eight in the
 * morning and the plant files it under the date it began, so a punch at ten past
 * midnight belongs to yesterday's night shift.
 *
 * WHICH WAY THROUGH THE GATE IS THE WHOLE THING, and the first version of this
 * did not ask. It put a punch on the shift that contained it, which is wrong for
 * most of the plant most days: nobody arrives exactly at half past eight. On the
 * first day of real data that rule would have filed 32 of 49 punches on the
 * wrong shift - the entire day crew, who punched in between 08:13 and 08:29, on
 * to the night shift that had just ended.
 *
 * So a punch in shortly BEFORE a shift starts belongs to the shift being
 * arrived for, and a punch out shortly AFTER one belongs to the shift being
 * left. Both windows are one-sided on purpose: an arrival is never late for a
 * shift that has not started, and a departure is never early for one that has
 * not ended.
 *
 * With no direction recorded it falls back to plain containment, which is the
 * best a reader that does not say can support.
 */
export function shiftOfPunch(localDate, localTime, direction) {
  const mins = minutesOf(localTime);
  const { dayStart, dayEnd } = SHIFT_WINDOW;
  const way = String(direction ?? '').trim().toLowerCase();

  if (way === 'in') {
    const beforeDay = dayStart - mins;
    if (beforeDay > 0 && beforeDay <= EARLY_IN_MIN) {
      return { shiftDate: localDate, shift: SHIFTS.DAY };
    }
    const beforeNight = dayEnd - mins;
    if (beforeNight > 0 && beforeNight <= EARLY_IN_MIN) {
      return { shiftDate: localDate, shift: SHIFTS.NIGHT };
    }
  }

  if (way === 'out') {
    const afterDayStart = mins - dayStart;
    if (afterDayStart >= 0 && afterDayStart <= LATE_OUT_MIN) {
      return { shiftDate: dayBefore(localDate), shift: SHIFTS.NIGHT };
    }
    const afterNightStart = mins - dayEnd;
    if (afterNightStart >= 0 && afterNightStart <= LATE_OUT_MIN) {
      return { shiftDate: localDate, shift: SHIFTS.DAY };
    }
  }

  // The shift the punch simply falls inside.
  if (mins >= dayStart && mins < dayEnd) return { shiftDate: localDate, shift: SHIFTS.DAY };
  if (mins >= dayEnd) return { shiftDate: localDate, shift: SHIFTS.NIGHT };
  return { shiftDate: dayBefore(localDate), shift: SHIFTS.NIGHT };
}

/**
 * `2026-08-28 08:41:00` as the device's clock reads it, as an instant.
 *
 * The plant is on IST and the server is not, so the offset is stated rather
 * than left to whichever machine parses the string. A bare `new Date('2026-08-28
 * 08:41:00')` on the Render box is half past three in the morning IST, which is
 * a different shift and, for a punch just after midnight, a different day.
 */
const IST = '+05:30';
const instantOf = (localDate, localTime) => {
  const time = String(localTime ?? '').length === 5 ? `${localTime}:00` : localTime;
  return new Date(`${localDate}T${time}${IST}`).toISOString();
};

/** `HH:MM` from whatever shape the device sent. */
const clockOf = (value) => String(value ?? '').slice(0, 5);

export const attendanceService = {
  /**
   * A window of punches from the reader, posted by the plant-side script.
   *
   * Idempotent by (device, code, punched_at) - the script re-sends a window on
   * every run because it has no way of knowing what arrived last time, and a
   * re-send has to be free rather than a doubling. The unique index is what
   * enforces that; this counts what was new so the script's log says something
   * useful.
   */
  async receive({ device, punches: rows = [] } = {}) {
    if (!device) throw ApiError.badRequest('Which reader these came from is missing');

    const seen = new Set();
    const wanted = [];
    for (const row of rows) {
      const localDate = String(row.date ?? '').slice(0, 10);
      const localTime = clockOf(row.time);
      const code = String(row.code ?? '').trim();
      if (!localDate || !localTime || !code) continue;

      const punchedAt = instantOf(localDate, localTime);
      // Two punches of one person on one second are one punch. The reader will
      // send a duplicate if a finger is read twice, and the database would
      // refuse the second - but refusing it here keeps the insert one round
      // trip instead of one failed one per repeat.
      const key = `${code}|${punchedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Which way through the gate, which is what decides the shift a punch
      // belongs to - see shiftOfPunch.
      const direction = row.direction ? String(row.direction).trim().toLowerCase() : null;
      const { shiftDate, shift } = shiftOfPunch(localDate, localTime, direction);
      wanted.push({
        device,
        code,
        name: row.name == null ? null : String(row.name).trim() || null,
        punched_at: punchedAt,
        local_date: localDate,
        local_time: localTime,
        direction,
        shift_date: shiftDate,
        shift,
      });
    }

    if (!wanted.length) return { device, received: rows.length, stored: 0, already: 0 };

    const days = [...new Set(wanted.map((p) => p.local_date))].sort();
    const held = await punches.all({
      device,
      local_date: [op.gte(days[0]), op.lte(days[days.length - 1])],
    });
    const have = new Set(held.map((p) => `${p.code}|${new Date(p.punched_at).toISOString()}`));
    const fresh = wanted.filter((p) => !have.has(`${p.code}|${p.punched_at}`));

    if (fresh.length) await punches.createMany(fresh);
    return {
      device,
      received: rows.length,
      stored: fresh.length,
      already: wanted.length - fresh.length,
      from: days[0],
      to: days[days.length - 1],
    };
  },

  /**
   * One shift: who came in, who is on the floor roster, and where each of them
   * has been put.
   *
   * The stations are every machine the plant runs plus the places a shift is
   * spent that have no machine at all. Packing and cleaning are work, they take
   * hands off the lines, and a deployment screen that could not say so would
   * have the supervisor assigning eleven people to fourteen machines and
   * wondering where the other six went.
   */
  async forShift({ date, shift } = {}) {
    if (!date || !shift) throw ApiError.badRequest('Which shift is missing');

    const [rows, roster, placed, plant] = await Promise.all([
      punches.all({ shift_date: date, shift }, { sort: 'punched_at', ascending: true }),
      operators.all({}, { sort: 'name', ascending: true }),
      labour.all({ shift_date: date, shift }),
      machines.all({ enabled: true }, { sort: 'sort_order', ascending: true }),
    ]);

    const byCode = new Map();
    for (const o of roster) {
      const code = String(o.punch_code ?? '').trim();
      if (code) byCode.set(code, o);
    }
    const station = new Map(placed.map((r) => [r.code, r]));

    /*
     * One row per person, not per punch. A shift is a person coming in and
     * going home, and the reader records both plus whatever happened at the
     * canteen door in between - so the punches are folded into first and last
     * and kept underneath for anyone who disputes them.
     */
    const people = new Map();
    for (const p of rows) {
      const held = people.get(p.code) ?? {
        code: p.code,
        name: p.name ?? null,
        punches: [],
        firstAt: null,
        lastAt: null,
      };
      held.punches.push({
        at: p.local_time,
        direction: p.direction ?? null,
        device: p.device,
      });
      held.firstAt = held.firstAt ?? p.local_time;
      held.lastAt = p.local_time;
      held.name = held.name ?? p.name ?? null;
      people.set(p.code, held);
    }

    const shaped = [...people.values()].map((person) => {
      const known = byCode.get(person.code) ?? null;
      const at = station.get(person.code) ?? null;
      return {
        ...person,
        // The roster's name wins over the device's. The gate holds whatever was
        // typed into it when the finger was enrolled, and this app is where the
        // plant has agreed how a name is spelled.
        name: known?.name ?? person.name ?? person.code,
        deviceName: person.name ?? null,
        operatorId: known?.id ?? null,
        onRoster: Boolean(known),
        active: known ? known.active !== false : null,
        usualStation: known?.station ?? null,
        station: at?.station ?? null,
        assignedBy: at?.assigned_by ?? null,
      };
    });

    const floor = shaped
      .filter((p) => p.onRoster && p.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
    const offRoster = shaped
      .filter((p) => !p.onRoster || p.active === false)
      .sort((a, b) => a.name.localeCompare(b.name));

    const stations = [
      ...plant.map((m) => ({ key: m.id, label: m.name, kind: m.kind, machine: true })),
      ...OFF_MACHINE_STATIONS.map((s) => ({ ...s, machine: false })),
    ].map((s) => ({
      ...s,
      people: floor.filter((p) => p.station === s.key),
    }));

    /*
     * A row placed at a station that is not on the list any more - a machine
     * retired mid-shift, or a station key edited. Surfaced rather than dropped,
     * because dropping it would take somebody off the screen who is standing in
     * the plant right now.
     */
    const known = new Set(stations.map((s) => s.key));
    const stray = floor.filter((p) => p.station && !known.has(p.station));

    return {
      date,
      shift,
      people: floor,
      offRoster,
      stations,
      stray,
      summary: {
        punchedIn: shaped.length,
        onFloor: floor.length,
        assigned: floor.filter((p) => p.station).length,
        unassigned: floor.filter((p) => !p.station).length,
        offRoster: offRoster.length,
      },
    };
  },

  /**
   * Put one person at one station for one shift, or take them off it.
   *
   * An upsert on (shift_date, shift, code), because moving somebody is a change
   * to where they are rather than a second place they also are. A pair of hands
   * counted on the grinders and on packing is a headcount larger than the number
   * of people who came through the gate.
   */
  async assign({ date, shift, code, station, by } = {}) {
    if (!date || !shift || !code) throw ApiError.badRequest('Which shift and who is missing');

    const held = await labour.findOne({ shift_date: date, shift, code });

    if (!station) {
      if (held) await labour.remove(held.id);
      return { date, shift, code, station: null };
    }

    const person = await operators.findOne({ punch_code: code });
    const patch = {
      shift_date: date,
      shift,
      code,
      operator_id: person?.id ?? null,
      operator: person?.name ?? null,
      station,
      assigned_by: by ?? null,
      updated_at: new Date().toISOString(),
    };
    const row = held ? await labour.update(held.id, patch) : await labour.create(patch);
    return row;
  },

  /**
   * Claim a punch the roster has never seen: this is one of ours.
   *
   * The gate meets a new hand before this app does, every time. Rather than
   * making that a trip to the back office - which in practice means the shift is
   * worked and never recorded - the supervisor names them here and the roster
   * grows from the punches that actually happen.
   *
   * It links an existing operator where the name already matches, because the
   * plant has fourteen operators on the roll already and a second Suresh with a
   * punch code against him is exactly the duplicate `operators` exists to
   * prevent.
   */
  async claim({ code, name, station, by } = {}) {
    const punchCode = String(code ?? '').trim();
    const called = String(name ?? '').trim();
    if (!punchCode || !called) throw ApiError.badRequest('A code and a name are needed');

    const taken = await operators.findOne({ punch_code: punchCode });
    if (taken) return taken;

    const named = (await operators.all({})).find(
      (o) => o.name.toLowerCase() === called.toLowerCase(),
    );
    if (named) {
      return operators.update(named.id, {
        punch_code: punchCode,
        active: true,
        updated_at: new Date().toISOString(),
      });
    }

    return operators.create({
      name: called,
      punch_code: punchCode,
      station: station ?? null,
      active: true,
      note: by ? `Added from the gate by ${by}` : 'Added from the gate',
    });
  },
};

export default attendanceService;
