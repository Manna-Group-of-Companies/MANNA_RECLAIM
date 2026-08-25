import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

/**
 * The gate for a machine rather than a person.
 *
 * Everything else on this API is opened by a signed-in account: a name, a PIN,
 * a session that expires and refreshes. The stock sync is a scheduled Python
 * script on a computer in the plant office. It has no password to rotate, no
 * session to refresh and no screen to be shown a login on, so it carries a
 * shared secret instead - see SAP_SYNC_TOKEN in config/env.
 *
 * Kept narrow deliberately. This opens one route, that route only writes stock,
 * and nothing behind it can read a rate, a wage or a customer. A token that
 * leaked would let somebody file a wrong stock figure, which the office would
 * see on the screen the next morning; it would not let them read the plant's
 * commercial record or take anything out of it.
 *
 * Compared with timingSafeEqual rather than `===`. A string comparison returns
 * as soon as two characters differ, and the time it took is a measurement of
 * how much of the token was right - which over enough requests is the token.
 * That is a remote attack on a route reachable from the internet, so it is
 * worth the four lines even though nobody is likely to bother.
 */
const matches = (given, expected) => {
  const a = Buffer.from(String(given ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length - so a wrong-length token is compared against itself and refused.
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
};

/**
 * `Authorization: Bearer <token>`, against one secret.
 *
 * The three refusals say three different things, and that is the point:
 *
 *   503  nobody has set a token on this API, so the route is not on. Said
 *        plainly, because a script answered 401 here sends somebody hunting for
 *        a typo in a token that was never the problem.
 *   401  no token was sent at all.
 *   403  a token was sent and it is not the one.
 */
export const machineToken = (req, _res, next) => {
  const expected = env.sapSyncToken;
  if (!expected) {
    return next(
      ApiError.unavailable(
        'This endpoint is switched off: SAP_SYNC_TOKEN is not set on the API. '
        + 'Set it in the API environment and restart, then send the same value as a bearer token.',
      ),
    );
  }

  const header = String(req.headers.authorization ?? '');
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!given) return next(ApiError.unauthorized('Send the sync token as: Authorization: Bearer <token>'));
  if (!matches(given, expected)) return next(ApiError.forbidden('That sync token is not the one.'));

  return next();
};

export default machineToken;
