import { ApiError } from '../utils/ApiError.js';
import {
  ADMIN_ROLES,
  DELETE_ROLES,
  ROLES,
  SHIFT_REVIEW_ROLES,
  SUMMARY_ROLES,
} from '../config/constants.js';

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
 * The managing director reads. This is what makes that true.
 *
 * Gating the routes the MD's screens call was not enough, and the gap is worth
 * writing down because it is the kind that looks closed. Correcting a run and
 * deleting one are deliberately open to anyone signed in - the crews find their
 * own mistakes first and were waiting on the office to put them right, see the
 * note in run.routes.js - so an account added later inherits both without
 * anybody choosing to give them away. Hiding the buttons on the screen is not a
 * guard; a request is a request.
 *
 * So the rule is stated once, here, as a property of the role rather than as a
 * list of routes to remember: this account may read, and may sign itself out.
 * Anything else is refused whatever the route in front of it allows, and a route
 * added next year is refused by default rather than by somebody noticing.
 */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const readOnlyRoles = (req, _res, next) => {
  if (!req.user || req.user.role !== ROLES.MD) return next();
  if (READS.has(req.method)) return next();
  // Signing out is a write, and an account that cannot sign out is a worse
  // answer than one that can. Refreshing a session is the same case.
  if (/\/auth\/(logout|refresh)$/.test(req.path)) return next();
  return next(ApiError.forbidden('The managing director account is read-only.'));
};

/**
 * The read side of the back office: the managing director, and the back office
 * itself because a manager reads these screens too.
 *
 * Wider than adminOnly and strictly read-only. It goes on the GETs that answer
 * "how is the plant doing" and on nothing that writes - see SUMMARY_ROLES for
 * why the MD is a list of its own rather than a wider ADMIN_ROLES.
 */
export const summaryOnly = authorize(...SUMMARY_ROLES);

/**
 * How a shift did against its benchmarks, which the crew is entitled to see.
 *
 * Wider than summaryOnly by the two floor roles and read-only like it. The
 * plant pays an incentive on these figures - see SHIFT_REVIEW_ROLES for what
 * this deliberately does not open.
 */
export const shiftReview = authorize(...SHIFT_REVIEW_ROLES);

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
