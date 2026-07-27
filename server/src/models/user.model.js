import { defineModel } from './base.model.js';
import { ROLES } from '../config/constants.js';

/** Name + PIN accounts. `pin_hash` is bcrypt and never leaves the service layer. */
export const User = defineModel(
  'User',
  'users',
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.SUPERVISOR, index: true },
    active: { type: Boolean, default: true },
    pin_hash: { type: String, required: true, select: true },
  },
  (schema) => {
    // Case-insensitive uniqueness: "Mathai" and "mathai" are the same account,
    // which is what the ilike-based login lookup always assumed.
    schema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  },
);

export default User;
