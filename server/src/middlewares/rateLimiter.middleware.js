import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const json = (_req, res) =>
  res.status(429).json({ success: false, message: 'Too many requests, slow down' });

/** Applied to the whole API. */
export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json,
});

/**
 * Tighter budget for PIN / credential endpoints. The point is to slow down
 * guessing, so a correct sign-in costs nothing — only failures count against
 * the window. Otherwise a supervisor logging in and out through a shift, or a
 * dev restarting the client, burns the budget and locks themselves out.
 */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.authWindowMs,
  max: env.rateLimit.authMax,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json,
});

export default apiLimiter;
