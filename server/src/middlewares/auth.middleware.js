import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';

const bearer = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.accessToken || null;
};

/** Requires a valid access token and puts the claims on `req.user`. */
export function authenticate(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(ApiError.unauthorized('Missing access token'));
  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, role: claims.role, name: claims.name };
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
