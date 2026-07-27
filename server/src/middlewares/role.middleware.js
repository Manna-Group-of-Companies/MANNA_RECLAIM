import { ApiError } from '../utils/ApiError.js';
import { ADMIN_ROLES } from '../config/constants.js';

/** Gate a route to specific roles: `authorize(ROLES.ADMIN, ROLES.MANAGER)`. */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (roles.length && !roles.includes(req.user.role)) {
    return next(ApiError.forbidden('This action needs one of: ' + roles.join(', ')));
  }
  return next();
};

/** Shortcut for the admin side (back office). */
export const adminOnly = authorize(...ADMIN_ROLES);

export default authorize;
