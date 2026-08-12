import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { startApi } from './helpers/app.js';

/**
 * A project that is behind the code by a column.
 *
 * This is the ordinary state of things for a day or two: a column is added to
 * the server, and supabase/schema.sql is run against the plant's project when
 * someone gets to it. Writes have always survived that gap - a write naming a
 * column that does not exist drops it and saves the rest. Reads did not: one
 * absent column in a select is a 400 from Postgres over the whole query, which
 * took the entire screen down rather than one field on it.
 *
 * That is the wrong failure for this plant. The back office cannot fix a
 * missing column from a page that will not load, and the column it is missing
 * is by definition one with nothing in it yet - so the read drops it too, and
 * the page comes up with that field blank.
 *
 * `last_login_at` is the case this was written for. The stub answers a select
 * naming it exactly as Postgres does, code and wording both.
 */

const USERS = [
  { id: 'u1', name: 'Mathai', role: 'supervisor', active: true, pin_hash: bcrypt.hashSync('1111', 10) },
  { id: 'u2', name: 'Anitha', role: 'manager', active: true, pin_hash: bcrypt.hashSync('2525', 10) },
];

const behind = () => ({
  tables: { users: USERS.map((u) => ({ ...u })) },
  missingColumns: { users: ['last_login_at'] },
});

test('the users list still comes up when the project has no last_login_at', async (t) => {
  const api = await startApi(behind());
  t.after(() => api.stop());

  const res = await api.call('/users', { role: 'manager' });
  assert.equal(res.status, 200, 'the page loads rather than 500ing on a column nobody has yet');

  const body = await res.json();
  assert.deepEqual(
    body.data.map((u) => u.name).sort(),
    ['Anitha', 'Mathai'],
    'and it is the accounts, not an empty list dressed up as success',
  );
  // The field the project has no column for reads as unknown, which is what the
  // page shows as "No sign-in recorded" - not as a time that was made up.
  assert.equal(body.data[0].last_login_at ?? null, null);
});

test('signing in still works, and says so, with the column missing', async (t) => {
  const api = await startApi(behind());
  t.after(() => api.stop());

  const res = await api.call('/auth/login', {
    method: 'POST',
    body: { name: 'Mathai', pin: '1111' },
  });
  assert.equal(res.status, 200, 'a stamp that cannot be written is not a failed sign-in');

  const body = await res.json();
  assert.equal(body.data.user.name, 'Mathai');
  assert.equal(
    api.tables.users.find((u) => u.id === 'u1').last_login_at ?? null,
    null,
    'and nothing was invented in a column that does not exist',
  );
});

test('a column the project does have is still asked for and still comes back', async (t) => {
  const api = await startApi(behind());
  t.after(() => api.stop());

  // The pruning is per column, not per table: `role` and `active` are on the
  // same select as the absent one and have to survive it.
  const res = await api.call('/users', { role: 'manager' });
  const body = await res.json();
  const mathai = body.data.find((u) => u.name === 'Mathai');
  assert.equal(mathai.role, 'supervisor');
  assert.equal(mathai.active, true);
  assert.equal(mathai.id, 'u1');
});
