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

/** Tighter budget for PIN / credential endpoints. */
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json,
});

export default apiLimiter;
