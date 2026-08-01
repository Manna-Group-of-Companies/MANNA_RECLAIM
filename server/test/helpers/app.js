/**
 * Boots the real app against a stub PostgREST.
 *
 * `config/env.js` calls dotenv and reads process.env once, as the module loads,
 * so setting a variable here would only take if nothing had imported it yet -
 * and a test file that imports a service for a unit assertion has already
 * imported it. The database URL is therefore pointed at the stub by writing to
 * the loaded `env` object, which `request()` reads on every call. Doing it this
 * way rather than through process.env is what guarantees a developer's own
 * server/.env can never aim a test at the plant's real Supabase project,
 * whatever order the file's imports happen to be in.
 *
 * There is one API per process rather than one per test, because a second boot
 * would get the same cached modules anyway. Node's test runner gives each file
 * its own process, so a file gets its own server and each test re-seeds the
 * same store.
 */

let started = null;

async function boot() {
  const { startPostgrest } = await import('./postgrestStub.js');
  const functions = {};
  const db = await startPostgrest({ tables: {}, functions });

  const { createApp } = await import('../../src/app.js');
  const { signAccessToken } = await import('../../src/utils/jwt.js');
  const { env } = await import('../../src/config/env.js');

  env.supabase.url = db.url;
  env.supabase.key = 'test-service-key';
  env.supabase.verifySchema = false;

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
