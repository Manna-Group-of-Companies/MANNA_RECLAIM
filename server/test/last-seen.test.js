import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { startApi } from './helpers/app.js';
import { SEEN_EVERY_MS } from '../src/services/user.service.js';

/**
 * What the Users page reads to answer "who is on the supervisor app".
 *
 * last_login_at, on its own, could not answer it. The app holds a 30-day
 * session, so a phone that has been on the floor since March signs in once and
 * then refreshes itself in silence: the office asked who was on this shift and
 * got an empty list on a shift with four people working it. last_seen_at is
 * stamped by any authenticated request instead, which is the thing a person
 * holding a phone actually does.
 *
 * Three things matter and are held here:
 *
 *   1. working stamps the account - a request with a token is a sighting, and
 *      no sign-in is needed for one.
 *   2. it is throttled. A tablet with a sheet open calls every few seconds and
 *      writing each one would be a row per tap for a screen that only ever
 *      shows minutes.
 *   3. the office may not write it, and a request with no token stamps nobody.
 *      A column somebody can set by hand is not a record of anything.
 *
 * The throttle is per process and lives in the service, so each test below uses
 * an account of its own - a shared one would carry the previous test's window
 * into this one.
 */

const hash = (pin) => bcrypt.hashSync(pin, 10);

const users = () => [
  { id: 'user-manager', name: 'Anitha', role: 'manager', active: true, pin_hash: hash('2525') },
  { id: 'user-supervisor', name: 'Mathai', role: 'supervisor', active: true, pin_hash: hash('1111') },
];

/** The row as the database holds it, not as a select dressed it up. */
const row = (api, id) => api.tables.users.find((u) => u.id === id);

/**
 * The stamp is fire-and-forget on purpose - the crew's tap is not held up by
 * it - so the write lands just after the response does. One turn of the loop is
 * what separates "not awaited" from "not written".
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('using the app is what marks an account as being on it', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  assert.equal(row(api, 'user-manager').last_seen_at ?? null, null, 'nothing yet');

  const at = Date.now();
  const res = await api.call('/users', { role: 'manager' });
  assert.equal(res.status, 200);
  await settle();

  const seen = row(api, 'user-manager').last_seen_at;
  assert.ok(seen, 'an ordinary authenticated request is a sighting');
  assert.ok(
    Math.abs(new Date(seen).getTime() - at) < 60_000,
    'stamped when it happened, not at some other moment',
  );
  assert.equal(
    row(api, 'user-manager').last_login_at ?? null,
    null,
    'and working is not recorded as signing in - the two columns stay different answers',
  );
});

test('a busy tablet is written down once, not once per tap', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  // A different account from the test above: the throttle is per id and per
  // process, so reusing that one would be measuring its window rather than
  // this one's.
  await api.call('/users/signers', { role: 'supervisor' });
  await settle();
  const first = row(api, 'user-supervisor').last_seen_at;
  assert.ok(first, 'the first call through lands');

  for (let i = 0; i < 5; i += 1) await api.call('/users/signers', { role: 'supervisor' });
  await settle();

  assert.equal(
    row(api, 'user-supervisor').last_seen_at,
    first,
    'the calls inside the window leave the stamp exactly where it was',
  );
  assert.ok(SEEN_EVERY_MS >= 60_000, 'and the window is minutes, not seconds');
});

test('signing in counts as being on the app, without waiting for the next request', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  const res = await api.call('/auth/login', {
    method: 'POST',
    body: { name: 'Mathai', pin: '1111' },
  });
  assert.equal(res.status, 200);

  const after = row(api, 'user-supervisor');
  assert.ok(after.last_login_at, 'the sign-in itself is recorded');
  assert.equal(
    after.last_seen_at,
    after.last_login_at,
    'somebody standing at the phone typing a PIN is as present as anyone gets',
  );
});

/** The refresh token the sign-in put in a cookie, which is what ends a session. */
const refreshCookie = (res) =>
  /refreshToken=([^;]+)/.exec(res.headers.getSetCookie().join(';'))?.[1] ?? null;

test('signing out takes the name off the screen at once', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  const signedIn = await api.call('/auth/login', {
    method: 'POST',
    body: { name: 'Mathai', pin: '1111' },
  });
  assert.equal(signedIn.status, 200);
  const token = refreshCookie(signedIn);
  assert.ok(token, 'the sign-in handed back a session to end');

  const before = row(api, 'user-supervisor');
  assert.ok(before.last_seen_at, 'and put them on the floor');

  const out = await api.call('/auth/logout', { method: 'POST', body: { refreshToken: token } });
  assert.equal(out.status, 200);
  await settle();

  /*
   * The presence rule the screens apply - see client/src/utils/presence.ts. The
   * point of the sign-out stamp is that it wins against a sighting one second
   * old: without it, somebody who has gone home stays on the manager's nav bar
   * for the whole fifteen-minute window.
   */
  const after = row(api, 'user-supervisor');
  assert.ok(after.last_logout_at, 'the sign-out is recorded');
  assert.ok(
    new Date(after.last_logout_at).getTime() >= new Date(after.last_seen_at).getTime(),
    'and it is later than the last sighting, so the name comes off rather than waiting out the window',
  );
});

test('being on the app is the server\'s to write, and an anonymous caller is nobody', async (t) => {
  const api = await startApi({ tables: { users: users() } });
  t.after(() => api.stop());

  const patched = await api.call('/users/user-supervisor', {
    role: 'admin',
    method: 'PATCH',
    body: { name: 'Mathai K', last_seen_at: '2030-01-01T00:00:00.000Z' },
  });
  assert.equal(patched.status, 200, 'the rest of the patch still lands');
  assert.equal(row(api, 'user-supervisor').name, 'Mathai K');
  assert.notEqual(
    row(api, 'user-supervisor').last_seen_at ?? null,
    '2030-01-01T00:00:00.000Z',
    'the stamp is not something a patch can set',
  );

  // A caller with no token is refused, and refusing has to be the whole of it:
  // a stamp written before the gate would put a name on the office's screen
  // for somebody who never got in.
  const before = api.tables.users.map((u) => u.last_seen_at ?? null);
  const anon = await fetch(`${api.base}/users`);
  assert.equal(anon.status, 401);
  await settle();
  assert.deepEqual(
    api.tables.users.map((u) => u.last_seen_at ?? null),
    before,
    'and nobody was marked as being on the app by it',
  );
});
