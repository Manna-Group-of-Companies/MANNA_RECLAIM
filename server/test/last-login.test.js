import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { startApi } from './helpers/app.js';

/**
 * What the back office's Users page reads to tell a supervisor who is on every
 * shift from an account nobody has touched since the person left.
 *
 * Three things are worth holding still here, and none of them is the column
 * existing:
 *
 *   1. a sign-in that succeeded is stamped, and a wrong PIN is not - a guess at
 *      someone's PIN must not read on that screen as that person signing in.
 *   2. the office's list carries the stamp, beside the role and the switch that
 *      the same row shows.
 *   3. nothing but the login path may write it. A last-signed-in an account
 *      holder can set is a record of nothing, so the patch route drops it.
 *
 * What is deliberately not asserted here is that `pin_hash` stays out of the
 * list: the stub ignores `select` and answers with whole rows, so an assertion
 * on it would be watching the stub rather than the service. The hash is kept
 * out by the select in user.service.js, and signer-names.test.js holds the one
 * route where the stub can actually witness it.
 */

const hash = (pin) => bcrypt.hashSync(pin, 10);

const users = () => [
  { id: 'u1', name: 'Mathai', role: 'supervisor', active: true, pin_hash: hash('1111') },
  { id: 'u2', name: 'Anitha', role: 'manager', active: true, pin_hash: hash('2525') },
];

const login = (api, name, pin) =>
  api.call('/auth/login', { method: 'POST', body: { name, pin } });

test('a sign-in is stamped on the account, and a wrong PIN is not', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  const before = api.tables.users.find((u) => u.id === 'u1');
  assert.equal(before.last_login_at ?? null, null, 'nothing has signed in yet');

  const at = Date.now();
  const ok = await login(api, 'Mathai', '1111');
  assert.equal(ok.status, 200);

  const stamped = api.tables.users.find((u) => u.id === 'u1').last_login_at;
  assert.ok(stamped, 'the sign-in that just succeeded is on the account');
  assert.ok(
    Math.abs(new Date(stamped).getTime() - at) < 60_000,
    'and it is the time it happened, not some other moment',
  );

  // A guess at Anitha's PIN must leave her account reading as untouched.
  const wrong = await login(api, 'Anitha', '9999');
  assert.equal(wrong.status, 401);
  assert.equal(
    api.tables.users.find((u) => u.id === 'u2').last_login_at ?? null,
    null,
    'a refused sign-in is not a sign-in',
  );
});

test('the office reads the last sign-in beside the role and the switch', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  assert.equal((await login(api, 'Mathai', '1111')).status, 200);

  const res = await api.call('/users', { role: 'manager' });
  assert.equal(res.status, 200);
  const body = await res.json();

  const mathai = body.data.find((u) => u.name === 'Mathai');
  assert.ok(mathai.last_login_at, 'the list carries the sign-in the page shows');
  // The name, the role and whether the account is switched on are the rest of
  // that row - the page shows all three beside the time.
  assert.equal(mathai.role, 'supervisor');
  assert.equal(mathai.active, true);

  const anitha = body.data.find((u) => u.name === 'Anitha');
  assert.equal(anitha.last_login_at ?? null, null, 'an unused account says so rather than guessing');
});

test('the last sign-in is the server\'s to write, not an admin\'s', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  const res = await api.call('/users/u1', {
    role: 'admin',
    method: 'PATCH',
    body: { name: 'Mathai K', last_login_at: '2030-01-01T00:00:00.000Z' },
  });
  assert.equal(res.status, 200, 'the rest of the patch still lands');

  const row = api.tables.users.find((u) => u.id === 'u1');
  assert.equal(row.name, 'Mathai K');
  assert.equal(row.last_login_at ?? null, null, 'the stamp is not something a patch can set');
});
