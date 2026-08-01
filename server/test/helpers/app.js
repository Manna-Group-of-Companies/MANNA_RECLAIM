/**
 * Boots the real app against a stub PostgREST.
 *
 * `config/env.js` reads process.env once, as the module loads, so everything
 * has to be set before the first import of anything that reaches it - hence the
 * dynamic imports below. dotenv does not overwrite a variable that is already
 * set, so a developer's own server/.env cannot point a test at the plant's real
 * project.
 *
 * For the same reason there is one API per process rather than one per test:
 * the second boot would import a cached env still pointing at the first stub.
 * Node's test runner gives each file its own process, so a file gets its own
 * server, and each test inside it re-seeds the same store.
 */

let started = null;

async function boot() {
  const { startPostgrest } = await import('./postgrestStub.js');
  const functions = {};
  const db = await startPostgrest({ tables: {}, functions });

  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = db.url;
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  process.env.JWT_SECRET = 'test-access-secret-that-is-long-enough-32';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough';

  const { createApp } = await import('../../src/app.js');
  const { signAccessToken } = await import('../../src/utils/jwt.js');
  const { env } = await import('../../src/config/env.js');

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  // Unreferenced so the runner is free to exit once the tests are done rather
  // than waiting on a listener nothing is going to call again.
  server.unref();
  const base = `http://127.0.0.1:${server.address().port}${env.apiPrefix}`;

  return { db, functions, server, base, signAccessToken };
}

/**
 * The API, with the database holding exactly the rows this test asked for.
 * Re-seeds rather than restarts, so every test in a file starts from a known
 * store without paying for another listener.
 */
export async function startApi({ tables = {}, functions = {} } = {}) {
  started ??= await boot();
  const api = started;

  for (const key of Object.keys(api.db.tables)) delete api.db.tables[key];
  Object.assign(api.db.tables, tables);
  for (const key of Object.keys(api.functions)) delete api.functions[key];
  Object.assign(api.functions, functions);

  /** A signed-in account of the given role, as a bearer token. */
  const tokenFor = (role, name = role) => api.signAccessToken({ id: `user-${role}`, role, name });

  const call = (path, { role = 'manager', method = 'GET', body } = {}) =>
    fetch(api.base + path, {
      method,
      headers: {
        Authorization: `Bearer ${tokenFor(role)}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  return {
    call,
    tokenFor,
    tables: api.db.tables,
    /** The listener outlives the test; the process ending is what closes it. */
    stop: async () => {},
  };
}

export default startApi;
