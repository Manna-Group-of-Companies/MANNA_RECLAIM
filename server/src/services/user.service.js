import bcrypt from 'bcryptjs';
import { crud, op } from './base.service.js';
import { TABLES, ROLES, SIGNER_ROLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { DEV_USERS, devSeedActive } from '../config/devSeed.js';

/**
 * `pin_hash` is deliberately outside the default select, so it never rides
 * along on GET /users. The login path asks for it by name through `withPin`.
 */
const base = crud(TABLES.users, {
  defaultSort: 'name',
  select: 'id,name,role,active,last_login_at,created_at',
});
const withPin = crud(TABLES.users, { defaultSort: 'name', select: 'id,name,role,active,pin_hash' });

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
    return base.update(id, { last_login_at: new Date().toISOString() });
  },

  verifyPin(user, pin) {
    if (!user?.pin_hash) return false;
    return bcrypt.compareSync(String(pin), user.pin_hash);
  },
};

export default userService;
