import dotenv from 'dotenv';

dotenv.config();

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
// An unset key in .env arrives as '', and Number('') is 0 — which would silently
// mean "port 0" or "allow zero requests". Blank falls back like undefined does.
const int = (v, fallback) =>
  v === undefined || String(v).trim() === '' || !Number.isFinite(Number(v)) ? fallback : Number(v);
const list = (v, fallback = []) =>
  v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : fallback;

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  logLevel: process.env.LOG_LEVEL || 'dev',
  corsOrigins: list(process.env.CLIENT_URL, ['http://localhost:5173']),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-access-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
    // Credential endpoints get their own, tighter budget. Only failed attempts
    // are counted, so a shop floor signing in normally never reaches it; in
    // development the ceiling is loose so restarts and retries don't lock you out.
    authWindowMs: int(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    authMax: int(
      process.env.AUTH_RATE_LIMIT_MAX,
      process.env.NODE_ENV === 'production' ? 20 : 200,
    ),
  },
  /** Supabase is the database. Everything the API reads and writes goes here. */
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    // The service key reads and writes past RLS; the anon key is enough while
    // the project's policies stay open. Never expose either to the browser.
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '',
    pageSize: int(process.env.SUPABASE_PAGE_SIZE, 1000),
    verifySchema: bool(process.env.SUPABASE_VERIFY_SCHEMA, true),
  },
};

/** Fail fast in production when a secret is still the development default. */
export function assertEnv() {
  const missing = [];
  if (!env.supabase.url) missing.push('SUPABASE_URL');
  if (!env.supabase.key) missing.push('SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY)');
  if (env.isProd) {
    if (env.jwt.secret.startsWith('dev-')) missing.push('JWT_SECRET');
    if (env.jwt.refreshSecret.startsWith('dev-')) missing.push('JWT_REFRESH_SECRET');
  }
  if (missing.length) throw new Error('Missing required env vars: ' + missing.join(', '));
}

export default env;
