import bcrypt from 'bcryptjs';
import { crud, op } from './base.service.js';
import { TABLES, ROLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { DEV_USERS, devSeedActive } from '../config/devSeed.js';

/**
 * `pin_hash` is deliberately outside the default select, so it never rides
 * along on GET /users. The login path asks for it by name through `withPin`.
 */
const base = crud(TABLES.users, { defaultSort: 'name', select: 'id,name,role,active,created_at' });
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

  async create({ name, role = ROLES.SUPERVISOR, pin, active = true }) {
    if (!pin) throw ApiError.badRequest('A PIN is required');
    return base.create({ name, role, active, pin_hash: await bcrypt.hash(String(pin), 10) });
  },

  async setPin(id, pin) {
    return base.update(id, { pin_hash: await bcrypt.hash(String(pin), 10) });
  },

  verifyPin(user, pin) {
    if (!user?.pin_hash) return false;
    return bcrypt.compareSync(String(pin), user.pin_hash);
  },
};

export default userService;
