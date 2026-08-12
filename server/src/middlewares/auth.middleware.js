import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { userService } from '../services/user.service.js';
import { logger } from '../config/logger.js';

const bearer = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.accessToken || null;
};

/**
 * Note the account as still there, without making the request wait for it.
 *
 * Deliberately not awaited: this is the back office's "who is on the app"
 * column, and the crew's tap must not be held up by a write nobody on the floor
 * is waiting for - nor failed by one. The service throttles itself, so most
 * calls through here do nothing at all - see userService.touchSeen.
 *
 * A failure is a debug line rather than a warning. If the database is unwell
 * every request in the plant comes through here, and the ones that matter are
 * already being logged where they happen; a second copy per tap would bury
 * them.
 */
const noteSeen = (id) => {
  userService.touchSeen(id).catch((err) => logger.debug(`last-seen not stamped - ${err.message}`));
};

/** Requires a valid access token and puts the claims on `req.user`. */
export function authenticate(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(ApiError.unauthorized('Missing access token'));
  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, role: claims.role, name: claims.name };
    noteSeen(claims.sub);
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Same as authenticate, but anonymous requests are allowed through. */
export function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next();
  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, role: claims.role, name: claims.name };
  } catch {
    req.user = undefined;
  }
  return next();
}

export default authenticate;
