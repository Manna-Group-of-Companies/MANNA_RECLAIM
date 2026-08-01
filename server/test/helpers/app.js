/**
 * Boots the real app against a stub PostgREST.
 *
 * `config/env.js` reads process.env once, as the module loads, so everything
 * here has to be set before the first import of anything that reaches it -
 * hence the dynamic imports. dotenv does not overwrite a variable that is
 * already set, so a developer's own server/.env cannot point a test at the
 * plant's real project.
 */

export async function startApi({ tables = {}, functions = {} } = {}) {
  const { startPostgrest } = await import('./postgrestStub.js');
  const db = await startPostgrest({ tables, functions });

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
  const base = `http://127.0.0.1:${server.address().port}${env.apiPrefix}`;

  /** A signed-in account of the given role, as a bearer header. */
  const tokenFor = (role, name = role) =>
    signAccessToken({ id: `user-${role}`, role, name });

  const call = (path, { role = 'manager', method = 'GET', body } = {}) =>
    fetch(base + path, {
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
    tables: db.tables,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await db.stop();
    },
  };
}

export default startApi;
