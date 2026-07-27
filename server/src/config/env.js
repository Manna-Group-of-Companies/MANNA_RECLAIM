import dotenv from 'dotenv';

dotenv.config();

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const int = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
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
  mongo: {
    uri: process.env.MONGODB_URI || '',
    dbName: process.env.MONGODB_DB || '',
    maxPoolSize: int(process.env.MONGODB_POOL_SIZE, 10),
    serverSelectionTimeoutMS: int(process.env.MONGODB_TIMEOUT_MS, 10000),
    autoIndex: bool(process.env.MONGODB_AUTO_INDEX, true),
  },
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
  },
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    // service key reads past RLS; the anon key is enough while the views stay unrestricted
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '',
    pageSize: int(process.env.SUPABASE_PAGE_SIZE, 1000),
  },
};

/** Fail fast in production when a secret is still the development default. */
export function assertEnv() {
  const missing = [];
  if (env.isProd) {
    if (env.jwt.secret.startsWith('dev-')) missing.push('JWT_SECRET');
    if (env.jwt.refreshSecret.startsWith('dev-')) missing.push('JWT_REFRESH_SECRET');
    if (!env.mongo.uri) missing.push('MONGODB_URI');
  }
  if (missing.length) throw new Error('Missing required env vars: ' + missing.join(', '));
}

export default env;
