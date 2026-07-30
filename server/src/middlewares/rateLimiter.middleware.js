import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../utils/jwt.js';

const json = (_req, res) =>
  res.status(429).json({ success: false, message: 'Too many requests, slow down' });

/**
 * A single IPv6 address is not a single client - a host is usually handed a
 * whole /64 and may pick any address inside it at will, so counting per address
 * counts the same caller afresh on every request. The prefix is the unit that
 * means something. IPv4 is already one address per client.
 */
const ipKey = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!ip.includes(':')) return 'ip:' + ip;
  return 'ip6:' + ip.split(':').slice(0, 4).join(':');
};

/**
 * Who to count this request against.
 *
 * The whole plant sits behind one router, so counting purely by address means
 * one busy tablet can spend the budget every other tablet needs. A signed-in
 * request is counted against the account instead, which is both fairer and
 * tighter. The token is *verified* here rather than merely decoded - a forged
 * or expired one falls back to the address, so nobody earns a fresh budget by
 * inventing a `sub`.
 */
const clientKey = (req) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : req.cookies?.accessToken;
  if (token) {
    try {
      return 'user:' + verifyAccessToken(token).sub;
    } catch {
      // Not a valid session - fall through to the address.
    }
  }
  return ipKey(req);
};

/** Applied to the whole API. */
export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json,
});

/**
 * A second, much tighter budget on the requests that change the record.
 *
 * Reads are cheap and the floor makes a great many of them - every screen
 * refreshes. Writes are the ones worth bounding: a run logged, a batch closed,
 * a dispatch loaded. A crew at work writes a few dozen rows a shift, so this
 * ceiling sits far above normal use and still well below what a script would
 * get through with a stolen token before anyone noticed.
 */
export const writeLimiter = rateLimit({
  windowMs: env.rateLimit.writeWindowMs,
  max: env.rateLimit.writeMax,
  keyGenerator: clientKey,
  // Reads never spend from this budget.
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  handler: json,
});

/**
 * Tighter budget for PIN / credential endpoints. The point is to slow down
 * guessing, so a correct sign-in costs nothing — only failures count against
 * the window. Otherwise a supervisor logging in and out through a shift, or a
 * dev restarting the client, burns the budget and locks themselves out.
 *
 * Counted per address, deliberately: the account being guessed at is not the
 * one making the request, and a login call carries no token worth trusting.
 */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.authWindowMs,
  max: env.rateLimit.authMax,
  keyGenerator: ipKey,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json,
});

export default apiLimiter;
