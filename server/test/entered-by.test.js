import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Who signed the record, and who keyed it.
 *
 * The sheets sign a run with a name the crew may switch: a tablet is signed in
 * once and whoever is holding it picks themselves off the list, which is right,
 * because the person who loaded the autoclave is not necessarily the account
 * that happens to be open. The cost of that is that `supervisor` cannot be read
 * as evidence - a pick left over from a previous shift signs today's runs to
 * somebody who was not in the plant, and until now nothing on the row could
 * contradict it. The floor found it the way you would expect: three live runs
 * in History under a name whose owner was not on site.
 *
 * `entered_by` is the other half. It comes off the verified access token in the
 * controller and is spread over anything the body sent, so it is not switchable,
 * not typeable, and not a second copy of the pick. History prints the two
 * together and they only differ when the pick was switched - which is exactly
 * the case worth showing.
 *
 * A plant whose database has not had migrations/0013 yet is not tested here:
 * the write is pruned by the same mechanism every other added column goes
 * through, and that is schema-behind-code.test.js's subject. The run starts and
 * the field stays empty.
 */

const CRACKER = {
  id: 'CRK',
  name: 'Cracker',
  short: 'CRK',
  kind: 'grind',
  group_name: 'Grinding line',
  enabled: true,
  sort_order: 1,
};

const bootWith = () => startApi({ tables: { machines: [{ ...CRACKER }], runs: [] } });

/** A start sent by a named account, rather than by the role's own name. */
const startAs = (api, name, body) =>
  fetch(`${api.base}/runs/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${api.tokenFor('supervisor', name)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ machineId: 'CRK', shiftDate: '2026-08-14', shift: 'Day', ...body }),
  });

test('a run records the account that keyed it beside the name it is signed with', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  // Devandan is on the floor and signed in. The tablet's pick still says Rahul.
  const res = await startAs(api, 'Devandan', { supervisor: 'Rahul' });
  assert.equal(res.status, 201);

  const [row] = api.tables.runs;
  assert.equal(row.supervisor, 'Rahul', 'the record is signed with the name the sheet picked');
  assert.equal(row.entered_by, 'Devandan', 'and says who actually keyed it');

  const { data } = await res.json();
  assert.equal(data.entered_by, 'Devandan', 'which the tablet gets back to show in History');
});

test('the tablet cannot send an account of its own', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  // Both spellings, because one is the field the controller sets and the other
  // is the column underneath it. Neither is the client's to name.
  await startAs(api, 'Devandan', { enteredBy: 'Rahul', entered_by: 'Rahul' });

  const [row] = api.tables.runs;
  assert.equal(row.entered_by, 'Devandan', 'the token is what says who keyed it, not the body');
});

test('an unswitched pick leaves the two names the same', async (t) => {
  const api = await bootWith();
  t.after(() => api.stop());

  // No supervisor on the request at all - the ordinary shift, where the account
  // signs its own records.
  await startAs(api, 'Devandan', {});

  const [row] = api.tables.runs;
  assert.equal(row.supervisor, 'Devandan');
  assert.equal(row.entered_by, 'Devandan', 'so History has nothing extra to say about it');
});
