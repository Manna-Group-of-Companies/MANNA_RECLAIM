import { ApiError } from '../utils/ApiError.js';
import { ADMIN_ROLES, DELETE_ROLES } from '../config/constants.js';

/** Gate a route to specific roles: `authorize(ROLES.ADMIN, ROLES.MANAGER)`. */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (roles.length && !roles.includes(req.user.role)) {
    return next(ApiError.forbidden('This action needs one of: ' + roles.join(', ')));
  }
  return next();
};

/** Shortcut for the admin side (back office): manager and admin. */
export const adminOnly = authorize(...ADMIN_ROLES);

/**
 * The deletes that cannot be undone from any screen - a weighing cleared, a
 * stock group cleared, a lab verdict removed.
 *
 * Narrower than adminOnly, and named apart from it on purpose: who counts as the
 * back office and who may destroy a record are two questions, and only one of
 * them is settled by a job title. A manager keeps every write they can take back
 * by doing it again; this is the half no screen puts back. See DELETE_ROLES.
 */
export const strictAdminOnly = authorize(...DELETE_ROLES);

/** Former name for the same gate, kept so older imports keep working. */
export const canDelete = strictAdminOnly;

export default authorize;
