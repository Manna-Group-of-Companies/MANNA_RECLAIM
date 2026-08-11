import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * The one route under /users the shop floor can reach.
 *
 * The Supervisor pick on the sheets used to read three names compiled into the
 * web client and copied again into the Flutter app, so an account renamed or
 * added in the back office never reached either. It now asks the server, which
 * means a route that a supervisor's own token gets past - and the whole point
 * of asserting it here is that opening that door opened it exactly this far:
 * the names that may sign a record, and nothing else about the accounts.
 *
 * A PIN hash is the sharp edge. It is outside the default select in
 * user.service, so it cannot ride along by accident - but "cannot ride along by
 * accident" is worth an assertion rather than a comment, because the select
 * that keeps it out is one edit away from including it.
 */

const USERS = [
  { id: 'u1', name: 'Mathai', role: 'supervisor', active: true, pin_hash: '$2a$10$hashone' },
  { id: 'u2', name: 'Anitha', role: 'manager', active: true, pin_hash: '$2a$10$hashtwo' },
  { id: 'u3', name: 'Rahul', role: 'supervisor', active: false, pin_hash: '$2a$10$hashthree' },
  { id: 'u4', name: 'Lab', role: 'lab', active: true, pin_hash: '$2a$10$hashfour' },
  { id: 'u5', name: 'Biju', role: 'worker', active: true, pin_hash: '$2a$10$hashfive' },
];

test('the shop floor reads who may sign, and nothing else about the accounts', async (t) => {
  const api = await startApi({ tables: { users: USERS.map((u) => ({ ...u })) } });
  t.after(() => api.stop());

  const res = await api.call('/users/signers', { role: 'supervisor' });
  assert.equal(res.status, 200, 'a supervisor has to know which names may sign');

  const body = await res.json();
  assert.deepEqual(
    [...body.data].sort(),
    ['Anitha', 'Mathai'],
    'active supervisors and the office, not the lab, a worker, or a disabled account',
  );

  // Names, as strings. Not rows with a role, an id and an `active` flag on them.
  assert.equal(
    body.data.every((name) => typeof name === 'string'),
    true,
  );
  const raw = JSON.stringify(body);
  for (const leak of ['pin_hash', '$2a$10$', 'supervisor', 'u1']) {
    assert.equal(raw.includes(leak), false, `the pick must not carry ${leak}`);
  }
});

test('the rest of /users stays the back office\'s', async (t) => {
  const api = await startApi({ tables: { users: USERS.map((u) => ({ ...u })) } });
  t.after(() => api.stop());

  for (const [path, method] of [
    ['/users', 'GET'],
    ['/users', 'POST'],
    ['/users/u1', 'GET'],
    ['/users/u1', 'PATCH'],
    ['/users/u1/pin', 'PATCH'],
    ['/users/u1', 'DELETE'],
  ]) {
    for (const role of ['supervisor', 'worker', 'lab']) {
      const res = await api.call(path, { role, method, body: method === 'GET' ? undefined : { pin: '1234' } });
      assert.equal(res.status, 403, `${method} ${path} must refuse a ${role}`);
      assert.equal(
        JSON.stringify(await res.json()).includes('hash'),
        false,
        `${method} ${path} must not echo an account back in its refusal`,
      );
    }
  }

  // And those 403s are the role gate rather than the routes having moved.
  const office = await api.call('/users', { role: 'manager' });
  assert.equal(office.status, 200);
});
