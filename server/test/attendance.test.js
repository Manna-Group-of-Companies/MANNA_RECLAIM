import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftOfPunch } from '../src/services/attendance.service.js';
import { startApi } from './helpers/app.js';

/**
 * Who came through the gate, and where the supervisor put them.
 *
 * Two things decide whether this screen is worth opening, and both of them are
 * quiet when they are wrong.
 *
 * THE SHIFT A PUNCH BELONGS TO. The night runs half past eight in the evening
 * to half past eight in the morning and the plant files it under the date it
 * began - a night shift on the 16th has runs stamped one in the morning on the
 * 17th. So a punch at ten past midnight belongs to yesterday's night shift, and
 * getting that wrong puts the whole night crew on a shift that has not started
 * yet, on a board that looks perfectly ordinary.
 *
 * WHICH PUNCHES ARE WORKERS. The gate punches the office, the drivers and the
 * managing director exactly as it punches a refiner hand. The supervisor wants
 * his own crew, and the answer is the roster: an operator with a punch code
 * against them is a production worker. Everybody else is listed apart rather
 * than dropped, because a new hand who is silently missing from the board works
 * a shift nobody records.
 */

test('a punch in the working day belongs to that day shift', async () => {
  assert.deepEqual(shiftOfPunch('2026-08-28', '08:30'), { shiftDate: '2026-08-28', shift: 'Day' });
  assert.deepEqual(shiftOfPunch('2026-08-28', '14:05'), { shiftDate: '2026-08-28', shift: 'Day' });
  // 20:29 is still the day. The boundary is the plant's, not a round number.
  assert.deepEqual(shiftOfPunch('2026-08-28', '20:29'), { shiftDate: '2026-08-28', shift: 'Day' });
});

test('a punch in the evening belongs to that night, filed under the day it began', async () => {
  assert.deepEqual(shiftOfPunch('2026-08-28', '20:30'), { shiftDate: '2026-08-28', shift: 'Night' });
  assert.deepEqual(shiftOfPunch('2026-08-28', '23:55'), { shiftDate: '2026-08-28', shift: 'Night' });
});

test('a punch after midnight belongs to the night before', async () => {
  /*
   * The one case that is not the obvious one, and the one that matters: a night
   * crew signs out between five and half past eight in the morning, and every
   * one of those punches is yesterday's shift. Read as today's, the night crew
   * appears twice - once on a shift that has not started - and the shift they
   * actually worked shows nobody signing out.
   */
  assert.deepEqual(shiftOfPunch('2026-08-29', '00:10'), { shiftDate: '2026-08-28', shift: 'Night' });
  assert.deepEqual(shiftOfPunch('2026-08-29', '06:45'), { shiftDate: '2026-08-28', shift: 'Night' });
  assert.deepEqual(shiftOfPunch('2026-08-29', '08:29'), { shiftDate: '2026-08-28', shift: 'Night' });
  // And across a month end, where the arithmetic is not just a subtraction.
  assert.deepEqual(shiftOfPunch('2026-09-01', '02:00'), { shiftDate: '2026-08-31', shift: 'Night' });
  assert.deepEqual(shiftOfPunch('2026-03-01', '02:00'), { shiftDate: '2026-02-28', shift: 'Night' });
});

test('an arrival just before the shift starts is that shift, not the one ending', async () => {
  /*
   * The case the first version of this got wrong, and it was not a corner: on
   * 28 August 2026 the day crew punched in between 08:13 and 08:29 and the
   * night crew punched out between 08:30 and 08:33, all around one boundary.
   * Counted by containment alone, 32 of that day's 49 punches went to the wrong
   * shift - the whole day crew filed on to the night that had just ended.
   *
   * Nobody arrives at exactly half past eight. 79,250 punches off the gate peak
   * in the 08:00 hour and the 20:00 hour, both of them before the shift being
   * come in for.
   */
  assert.deepEqual(shiftOfPunch('2026-08-28', '08:15', 'in'), { shiftDate: '2026-08-28', shift: 'Day' });
  assert.deepEqual(shiftOfPunch('2026-08-28', '08:29', 'in'), { shiftDate: '2026-08-28', shift: 'Day' });
  // The night crew coming in at eight in the evening, before their 20:30 start.
  assert.deepEqual(shiftOfPunch('2026-08-28', '20:05', 'in'), { shiftDate: '2026-08-28', shift: 'Night' });
  // And a genuine early bird - four of them punch in just before six.
  assert.deepEqual(shiftOfPunch('2026-08-28', '05:57', 'in'), { shiftDate: '2026-08-28', shift: 'Day' });
});

test('a departure just after the next shift starts is the shift being left', async () => {
  // Fifteen people punched out between 08:30 and 08:33 on 28 August. They had
  // just worked the night of the 27th; they had not worked one minute of the
  // day shift they were walking out of.
  assert.deepEqual(shiftOfPunch('2026-08-28', '08:31', 'out'), { shiftDate: '2026-08-27', shift: 'Night' });
  assert.deepEqual(shiftOfPunch('2026-08-28', '08:33', 'out'), { shiftDate: '2026-08-27', shift: 'Night' });
  // The day crew signing out a few minutes after the night crew take over.
  assert.deepEqual(shiftOfPunch('2026-08-28', '20:35', 'out'), { shiftDate: '2026-08-28', shift: 'Day' });
  // A night ending well before the handover is still that night.
  assert.deepEqual(shiftOfPunch('2026-08-28', '06:26', 'out'), { shiftDate: '2026-08-27', shift: 'Night' });
});

test('a departure in the middle of a shift is not dragged to the night before', async () => {
  /*
   * The window after a boundary is ninety minutes, not any length. Somebody
   * leaving at half past twelve went home from the shift they were on - reach
   * further and a half day becomes a night shift nobody worked.
   */
  assert.deepEqual(shiftOfPunch('2026-08-27', '12:30', 'out'), { shiftDate: '2026-08-27', shift: 'Day' });
  assert.deepEqual(shiftOfPunch('2026-08-27', '17:00', 'out'), { shiftDate: '2026-08-27', shift: 'Day' });
});

test('with no direction recorded it falls back to the shift that contains it', async () => {
  // Some readers are not configured to say which way through the gate. It is
  // the best a device that does not say can support, and it is why the sync is
  // asked for the direction whenever the device has one.
  assert.deepEqual(shiftOfPunch('2026-08-29', '00:10'), { shiftDate: '2026-08-28', shift: 'Night' });
  assert.deepEqual(shiftOfPunch('2026-08-28', '14:05'), { shiftDate: '2026-08-28', shift: 'Day' });
});

const punch = (code, time, over = {}) => ({
  code, name: `Person ${code}`, date: '2026-08-28', time, ...over,
});

const TOKEN = 'test-punch-token-1234567890';

const api = async (tables) => {
  const app = await startApi({
    tables: {
      machines: [
        { id: 'GRD_K', name: 'Grinder 1', kind: 'grind', enabled: true, sort_order: 1 },
        { id: 'R4', name: 'Refiner 4', kind: 'refiner', enabled: true, sort_order: 2 },
      ],
      operators: [],
      attendance_punches: [],
      shift_labour: [],
      ...tables,
    },
  });
  const { env } = await import('../src/config/env.js');
  env.sapSyncToken = TOKEN;
  return app;
};

/** The reader has no session, only a shared secret - so `fetch` directly. */
const post = (app, body) =>
  fetch(`${app.base}/sync/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });

test('the reader posts a window and the board reads it back by shift', async (t) => {
  const app = await api({
    operators: [
      { id: 'o-1', name: 'Suresh', punch_code: '104', active: true, station: 'GRD_K' },
      { id: 'o-2', name: 'Mathai', punch_code: '108', active: true },
    ],
  });
  t.after(() => app.stop());

  const sent = await post(app, {
    device: 'K90 192.168.1.40',
    punches: [
      punch('104', '08:41'),
      punch('104', '20:12'),
      punch('108', '08:44'),
      // Somebody from the office, who the roster has never heard of.
      punch('900', '09:30', { name: 'Accounts' }),
    ],
  });
  const receipt = await sent.json();
  assert.equal(sent.status, 201, JSON.stringify(receipt));
  assert.equal(receipt.data.stored, 4);

  const res = await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'supervisor' });
  assert.equal(res.status, 200);
  const board = (await res.json()).data;

  assert.equal(board.summary.punchedIn, 3, 'three people, not four punches');
  assert.equal(board.summary.onFloor, 2);
  assert.equal(board.summary.offRoster, 1);
  assert.equal(board.offRoster[0].code, '900');

  // A shift is a person coming in and going home, so the two punches fold into
  // one row with both ends on it.
  const suresh = board.people.find((p) => p.code === '104');
  assert.equal(suresh.name, 'Suresh', 'the roster spells the name, not the device');
  assert.equal(suresh.firstAt, '08:41');
  assert.equal(suresh.lastAt, '20:12');
  assert.equal(suresh.punches.length, 2);
  assert.equal(suresh.station, null, 'nobody is deployed until somebody deploys them');
});

test('the same window posted twice stores nothing the second time', async (t) => {
  const app = await api({});
  t.after(() => app.stop());

  const send = () => post(app, {
    device: 'K90',
    punches: [punch('104', '08:41'), punch('108', '08:44')],
  });

  assert.equal((await (await send()).json()).data.stored, 2);
  /*
   * The script re-sends a window on every run - it has no way of knowing what
   * arrived last time. A re-send has to be free rather than a doubling, or the
   * headcount grows every fifteen minutes all day.
   */
  const again = (await (await send()).json()).data;
  assert.equal(again.stored, 0);
  assert.equal(again.already, 2);
});

test('the supervisor puts somebody on a machine, and moves them', async (t) => {
  const app = await api({
    operators: [{ id: 'o-1', name: 'Suresh', punch_code: '104', active: true }],
    attendance_punches: [{
      id: 'p-1', device: 'K90', code: '104', name: 'Suresh',
      punched_at: '2026-08-28T03:11:00.000Z', local_date: '2026-08-28', local_time: '08:41',
      shift_date: '2026-08-28', shift: 'Day',
    }],
  });
  t.after(() => app.stop());

  const put = (station) => app.call('/attendance/assign', {
    method: 'POST',
    role: 'supervisor',
    body: { date: '2026-08-28', shift: 'Day', code: '104', station },
  });

  assert.equal((await put('GRD_K')).status, 200);
  const first = (await (await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'supervisor' })).json()).data;
  assert.equal(first.stations.find((s) => s.key === 'GRD_K').people.length, 1);
  assert.equal(first.summary.assigned, 1);
  assert.equal(first.summary.unassigned, 0);

  /*
   * Moving somebody is a change to where they are, not a second place they also
   * are. A pair of hands counted on the grinder and on packing is a headcount
   * bigger than the number of people who came through the gate.
   */
  assert.equal((await put('PACKING')).status, 200);
  const moved = (await (await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'supervisor' })).json()).data;
  assert.equal(moved.stations.find((s) => s.key === 'GRD_K').people.length, 0);
  assert.equal(moved.stations.find((s) => s.key === 'PACKING').people.length, 1);
  assert.equal(moved.summary.assigned, 1);

  // And taking them off a station leaves them on the floor, unassigned.
  assert.equal((await put(null)).status, 200);
  const off = (await (await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'supervisor' })).json()).data;
  assert.equal(off.summary.assigned, 0);
  assert.equal(off.summary.onFloor, 1);
});

test('packing and cleaning are stations though no machine stands at either', async (t) => {
  const app = await api({});
  t.after(() => app.stop());

  const res = await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'supervisor' });
  const { stations } = (await res.json()).data;

  // Every machine the plant runs, and the two places a shift is spent that have
  // no machine at all. Without them a supervisor deploys eleven people to
  // fourteen machines and wonders where the other six went.
  assert.deepEqual(stations.map((s) => s.key), ['GRD_K', 'R4', 'PACKING', 'CLEANING']);
  assert.equal(stations.find((s) => s.key === 'PACKING').machine, false);
  assert.equal(stations.find((s) => s.key === 'GRD_K').machine, true);
});

test('a punch nobody has claimed can be claimed, and joins the floor', async (t) => {
  const app = await api({
    attendance_punches: [{
      id: 'p-1', device: 'K90', code: '311', name: 'New Hand',
      punched_at: '2026-08-28T03:11:00.000Z', local_date: '2026-08-28', local_time: '08:41',
      shift_date: '2026-08-28', shift: 'Day',
    }],
  });
  t.after(() => app.stop());

  const before = (await (await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'supervisor' })).json()).data;
  assert.equal(before.summary.onFloor, 0);
  assert.equal(before.summary.offRoster, 1);

  const claimed = await app.call('/attendance/claim', {
    method: 'POST',
    role: 'supervisor',
    body: { code: '311', name: 'Rajan' },
  });
  assert.equal(claimed.status, 201);

  const after = (await (await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'supervisor' })).json()).data;
  assert.equal(after.summary.onFloor, 1);
  assert.equal(after.summary.offRoster, 0);
  assert.equal(after.people[0].name, 'Rajan');
});

test('a worker may read the board and may not deploy anybody', async (t) => {
  const app = await api({});
  t.after(() => app.stop());

  // The crew is paid an incentive on figures built out of a crew count, and who
  // was counted is not a secret from the people being counted.
  assert.equal(
    (await app.call('/attendance/shift?date=2026-08-28&shift=Day', { role: 'worker' })).status,
    200,
  );
  // Deploying is the supervisor's job on a shift.
  assert.equal(
    (await app.call('/attendance/assign', {
      method: 'POST',
      role: 'worker',
      body: { date: '2026-08-28', shift: 'Day', code: '104', station: 'GRD_K' },
    })).status,
    403,
  );
});
