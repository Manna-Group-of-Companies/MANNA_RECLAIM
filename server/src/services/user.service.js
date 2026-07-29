import bcrypt from 'bcryptjs';
import { crud, model, serialize, wrapError } from './base.service.js';
import { TABLES, ROLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { DEV_USERS, devSeedActive } from '../config/devSeed.js';

const base = crud(TABLES.users, { defaultSort: 'name', select: 'id,name,role,active,created_at' });

export const userService = {
  ...base,

  async findByName(name) {
    if (devSeedActive()) {
      return DEV_USERS.find((u) => u.name.toLowerCase() === String(name).toLowerCase()) ?? null;
    }
    try {
      // Collation strength 2 makes this a case-insensitive exact match, which
      // is what the old ilike lookup did.
      const row = await model(TABLES.users)
        // `+pin_hash` opts back into the field the schema hides by default.
        .findOne({ name: String(name) }, 'name role active +pin_hash')
        .collation({ locale: 'en', strength: 2 })
        .lean();
      return row ? serialize(row) : null;
    } catch (err) {
      throw wrapError(err);
    }
  },

  async findById(id) {
    if (devSeedActive()) {
      const user = DEV_USERS.find((u) => u.id === id);
      if (!user) throw ApiError.notFound('User ' + id + ' not found');
      return user;
    }
    return base.findById(id);
  },

  async list(query, filters) {
    if (devSeedActive()) {
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
