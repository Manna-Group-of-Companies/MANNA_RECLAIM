import bcrypt from 'bcryptjs';
import { crud, op } from './base.service.js';
import { request } from '../config/supabase.js';
import { TABLES, ROLES, SIGNER_ROLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { DEV_USERS, devSeedActive } from '../config/devSeed.js';

/**
 * `pin_hash` is deliberately outside the default select, so it never rides
 * along on GET /users. The login path asks for it by name through `withPin`.
 */
const base = crud(TABLES.users, {
  defaultSort: 'name',
  select: 'id,name,role,active,last_login_at,last_seen_at,last_logout_at,created_at',
});
const withPin = crud(TABLES.users, { defaultSort: 'name', select: 'id,name,role,active,pin_hash' });

/**
 * How often an account in continuous use is written down as still there.
 * One row per person per five minutes, against a floor of maybe a dozen
 * accounts - and the screen reading it wants "in the last quarter hour", so
 * anything finer is precision nobody looks at.
 */
export const SEEN_EVERY_MS = 5 * 60 * 1000;

/** id -> when it was last stamped, so a busy tablet is not one write per tap. */
const seenAt = new Map();

export const userService = {
  ...base,

  async findByName(name) {
    if (await devSeedActive()) {
      return DEV_USERS.find((u) => u.name.toLowerCase() === String(name).toLowerCase()) ?? null;
    }
    // `ilike` with no wildcard is a case-insensitive exact match: "Mathai" and
    // "mathai" are the same account, which is what the PIN gate always assumed.
    return withPin.findOne({ name: op.ilike(String(name)) });
  },

  async findById(id) {
    if (await devSeedActive()) {
      const user = DEV_USERS.find((u) => u.id === id);
      if (!user) throw ApiError.notFound('User ' + id + ' not found');
      return user;
    }
    return base.findById(id);
  },

  async list(query, filters) {
    if (await devSeedActive()) {
      const rows = DEV_USERS.map(({ pin_hash: _pin, ...u }) => u);
      return { rows, total: rows.length, page: 1, limit: rows.length };
    }
    return base.list(query, filters);
  },

  /**
   * The names the shop floor may sign a record with - see SIGNER_ROLES.
   *
   * Names and nothing else, and the only route under /users the floor can
   * reach: the tablets need to know who may sign, not who exists, what their
   * role is or whether their account is switched off. That is the same amount
   * the hard-coded list already told every tablet, now kept in step with the
   * accounts instead of drifting from them.
   */
  async listSigners() {
    const signing = (u) => u.active !== false && SIGNER_ROLES.includes(u.role);
    if (await devSeedActive()) return DEV_USERS.filter(signing).map((u) => u.name);
    const { rows } = await base.list(
      { limit: 200, sort: 'name', order: 'asc' },
      { role: op.oneOf(SIGNER_ROLES), active: true },
    );
    return rows.map((u) => u.name);
  },

  async create({ name, role = ROLES.SUPERVISOR, pin, active = true }) {
    if (!pin) throw ApiError.badRequest('A PIN is required');
    return base.create({ name, role, active, pin_hash: await bcrypt.hash(String(pin), 10) });
  },

  async setPin(id, pin) {
    return base.update(id, { pin_hash: await bcrypt.hash(String(pin), 10) });
  },

  /**
   * Stamp a sign-in that just succeeded, so the back office can tell an account
   * in daily use from one nobody has touched since the person left.
   *
   * Only the login path calls this - it is deliberately not a field on the
   * patch route, because a column the account holder could write is not a
   * record of anything. The dev seed has no table to write to, so it says so
   * by answering null rather than pretending it wrote.
   */
  async touchLogin(id) {
    if (!id || (await devSeedActive())) return null;
    const now = new Date();
    // Somebody standing at the phone typing a PIN is as present as anyone gets,
    // so the sign-in is a sighting too - written in the same update rather than
    // waiting for the first request after it. Seeding the throttle here is what
    // stops the burst of calls a freshly opened app makes from rewriting it.
    seenAt.set(id, now.getTime());
    return base.update(id, {
      last_login_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    });
  },

  /**
   * Note that this account is using the app right now.
   *
   * touchLogin above answers "has anybody signed in with this account", which
   * turned out not to be the question the office was asking. The supervisor app
   * holds a 30-day session, so a phone in use on every shift signs in once and
   * then refreshes itself in silence for a month: last_login_at stayed empty on
   * a floor full of people working. This is stamped by any authenticated
   * request instead - see the authenticate middleware - so it fills in for
   * whoever is actually holding a phone.
   *
   * Throttled to one write per account per SEEN_EVERY_MS. A tablet makes a
   * request every few seconds while a sheet is open and none of them is worth
   * an update; what the screen needs is the difference between minutes ago and
   * yesterday, and the throttle is well inside that. `seenAt` is marked before
   * the write rather than after, so the requests that arrive while it is in
   * flight are skipped instead of all firing the same update.
   *
   * Written straight through `request` rather than through the crud helper, and
   * with `returning: false`: this is the only write in the server that happens
   * on the way past somebody else's request, so it asks for no row back and
   * names no column in a select. A filter that matches nothing - an id from a
   * token whose account has since been deleted - is then simply a write that
   * touched nothing, rather than the not-found the keyed update would raise
   * into a caller that is only here to note a timestamp.
   */
  async touchSeen(id) {
    if (!id || (await devSeedActive())) return null;
    const now = Date.now();
    if (now - (seenAt.get(id) ?? 0) < SEEN_EVERY_MS) return null;
    seenAt.set(id, now);
    return request(TABLES.users, {
      method: 'PATCH',
      filters: { id },
      body: { last_seen_at: new Date(now).toISOString() },
      returning: false,
    });
  },

  /**
   * Note that this account has signed out, so the screens stop showing it.
   *
   * Without this, presence could only decay: a supervisor who signs out at the
   * end of a shift would sit on the manager's nav bar for the rest of the
   * window, and a name up there for somebody who has gone home is worse than no
   * name at all - it is the one reading of that bar nobody can correct by
   * looking harder.
   *
   * The throttle entry goes with it. It is keyed on the account, so leaving it
   * behind would mean the sign-in a minute later - the same person picking the
   * phone back up, or the next shift on the same handset - found the window
   * still closed and did not stamp.
   */
  async touchLogout(id) {
    if (!id || (await devSeedActive())) return null;
    seenAt.delete(id);
    return request(TABLES.users, {
      method: 'PATCH',
      filters: { id },
      body: { last_logout_at: new Date().toISOString() },
      returning: false,
    });
  },

  verifyPin(user, pin) {
    if (!user?.pin_hash) return false;
    return bcrypt.compareSync(String(pin), user.pin_hash);
  },
};

export default userService;
