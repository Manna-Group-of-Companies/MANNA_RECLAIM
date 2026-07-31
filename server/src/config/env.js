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
  // CLIENT_URL overrides this entirely; the fallback is what runs when nobody
  // has set it. The deployed client is in the list because an unset CLIENT_URL
  // otherwise refuses the only browser origin the plant actually uses, and the
  // failure surfaces as a CORS error in devtools rather than as a boot error.
  // Neither of these is a secret - both are public URLs of ours.
  corsOrigins: list(process.env.CLIENT_URL, [
    'http://localhost:5173',
    'https://manna-reclaim.odd-wind-70a0.workers.dev',
  ]),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-access-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    // Stamped into every token and demanded back on verify. A token minted for
    // some other service that happens to share a secret will not open this API,
    // and an access token cannot be replayed at the refresh endpoint.
    issuer: process.env.JWT_ISSUER || 'manna-reclaim-api',
    audience: process.env.JWT_AUDIENCE || 'manna-reclaim-app',
    // How long a just-rotated refresh token is still tolerated. Two tabs share
    // one cookie and can refresh at the same moment, and a refresh whose reply
    // was lost gets retried - both would otherwise be refused. See revoke().
    refreshGraceMs: int(process.env.REFRESH_GRACE_MS, 60 * 1000),
  },
  /**
   * The refresh cookie. In development the Vite proxy puts the client and the
   * API on one origin, so 'lax' is enough. Hosted on two different domains the
   * browser will not attach a 'lax' cookie to the cross-site POST /auth/refresh
   * at all, and the session dies at the first token expiry - that deployment
   * needs COOKIE_SAMESITE=none, which the browser only honours over HTTPS.
   */
  cookie: {
    sameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
    // SameSite=None is meaningless without Secure, so it implies it.
    secure:
      bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production') ||
      (process.env.COOKIE_SAMESITE || '').toLowerCase() === 'none',
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    // The whole API shares this budget, and in development the whole plant is
    // one IP - every tab, every ↻ Refresh and every HMR reload spends from it.
    // 300 is a shift's worth of tablets behind a router; a dev with two tabs
    // open burns it in minutes and is then locked out of /auth/login too, since
    // this limiter runs before the auth one. So development gets a loose
    // ceiling, exactly as authMax below does.
    max: int(process.env.RATE_LIMIT_MAX, process.env.NODE_ENV === 'production' ? 300 : 5000),
    // Credential endpoints get their own, tighter budget. Only failed attempts
    // are counted, so a shop floor signing in normally never reaches it; in
    // development the ceiling is loose so restarts and retries don't lock you out.
    authWindowMs: int(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    authMax: int(
      process.env.AUTH_RATE_LIMIT_MAX,
      process.env.NODE_ENV === 'production' ? 20 : 200,
    ),
    // Writes only - see writeLimiter. Sized for a whole shift's logging plus
    // the offline queue emptying itself in one go, not for a single screen.
    writeWindowMs: int(process.env.WRITE_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    writeMax: int(
      process.env.WRITE_RATE_LIMIT_MAX,
      process.env.NODE_ENV === 'production' ? 600 : 5000,
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

/**
 * Fail fast in production when a secret is still the development default.
 *
 * The checks below are the ones that are silent when they are wrong: a short
 * secret still signs tokens, an unset CLIENT_URL still starts a server, and
 * both only show themselves as a breach rather than as an error. Better the
 * plant finds out at deploy time than not at all.
 */
const MIN_SECRET_LENGTH = 32;

export function assertEnv() {
  const missing = [];
  const weak = [];
  if (!env.supabase.url) missing.push('SUPABASE_URL');
  if (!env.supabase.key) missing.push('SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY)');
  if (env.isProd) {
    if (env.jwt.secret.startsWith('dev-')) missing.push('JWT_SECRET');
    if (env.jwt.refreshSecret.startsWith('dev-')) missing.push('JWT_REFRESH_SECRET');
    // Without CLIENT_URL the CORS list falls back to localhost, which no real
    // browser is ever on - the plant's own site would be refused.
    if (!process.env.CLIENT_URL) missing.push('CLIENT_URL');

    if (env.jwt.secret.length < MIN_SECRET_LENGTH) weak.push('JWT_SECRET is under 32 characters');
    if (env.jwt.refreshSecret.length < MIN_SECRET_LENGTH) {
      weak.push('JWT_REFRESH_SECRET is under 32 characters');
    }
    // Shared secrets collapse the two token types into one: an access token
    // would verify at /auth/refresh and mint a fresh 30-day session.
    if (env.jwt.secret === env.jwt.refreshSecret) {
      weak.push('JWT_SECRET and JWT_REFRESH_SECRET must differ');
    }
    if (env.cookie.sameSite === 'none' && !env.cookie.secure) {
      weak.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=1');
    }
  }
  if (missing.length) throw new Error('Missing required env vars: ' + missing.join(', '));
  if (weak.length) throw new Error('Insecure configuration: ' + weak.join('; '));
}

export default env;
