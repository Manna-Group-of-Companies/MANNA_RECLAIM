import test from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers/app.js';

/**
 * Two vehicles loading the same coarse pool.
 *
 * The pool is where this actually bites. A batch group belongs to one batch and
 * is loaded once; a coarse pool is ten days of the line's output and any number
 * of loads can be drawn off it in the same afternoon. If a dispatch read the
 * availability, decided, and then wrote, two of them reading at once would both
 * see the same 10 sacks and both be allowed to take 8.
 *
 * They cannot, because the deciding does not happen in the API. post_dispatch()
 * takes the group `for update` and then draws it down with an UPDATE that only
 * matches while the sacks are still there - so the second request queues behind
 * the first, finds the stock gone and raises, which rolls its whole document
 * back. The function below models exactly that: a per-group lock held across an
 * await, then a conditional decrement.
 *
 * What is asserted here is the half the server owns - that of two overlapping
 * posts exactly one is created, the other comes back 409 naming the pool the
 * yard reads, and the ledger is left holding one dispatch's worth of stock and
 * not two.
 */

const POOL = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'pool',
  label: '2026-08-H2',
  quality: 'Coarse',
  packed_sacks: 10,
  dispatched_sacks: 0,
  available_sacks: 10,
  qc_status: 'pass',
  period_start: '2026-08-11',
  period_end: '2026-08-20',
  created_at: '2026-08-11T00:00:00Z',
};

const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';

/** One `for update` at a time per group, held across the await, as Postgres does. */
function makeLocks() {
  const held = new Map();
  return async function withLock(key, fn) {
    const previous = held.get(key) ?? Promise.resolve();
    let release;
    held.set(key, new Promise((resolve) => {
      release = resolve;
    }));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/**
 * post_dispatch() as Postgres runs it: one transaction, the group locked before
 * it is read, a conditional draw-down, and nothing written at all if any line
 * fails. The `setImmediate` in the middle is what a real statement round trip
 * is - it is there so an implementation that dropped the lock would interleave
 * and be caught, rather than passing because the stub happened to be atomic.
 */
function postDispatchFunction() {
  const withLock = makeLocks();
  return async (args, store) => {
    const groups = (store.stock_groups ||= []);
    const dispatches = (store.dispatches ||= []);
    const lines = (store.dispatch_lines ||= []);

    const written = { header: null, lines: [], drawn: [] };
    const rollback = () => {
      for (const { group, sacks } of written.drawn) {
        group.dispatched_sacks -= sacks;
        group.available_sacks = group.packed_sacks - group.dispatched_sacks;
      }
      if (written.header) dispatches.splice(dispatches.indexOf(written.header), 1);
      for (const line of written.lines) lines.splice(lines.indexOf(line), 1);
    };

    written.header = {
      id: args.p_id,
      customer_id: args.p_customer_id,
      dispatch_date: args.p_dispatch_date,
      transport_provided: args.p_transport_provided,
      transport_charge: args.p_transport_charge,
      remarks: args.p_remarks,
      created_by: args.p_created_by,
      created_at: '2026-08-15T00:00:00Z',
    };
    dispatches.push(written.header);

    try {
      for (const line of args.p_lines) {
        const failure = await withLock(line.stock_group_id, async () => {
          const group = groups.find((g) => g.id === line.stock_group_id);
          if (!group) return { marker: 'STOCK_MISSING', label: line.stock_group_id };
          if (group.qc_status !== 'pass') return { marker: 'STOCK_QC', label: group.label };
          await new Promise((resolve) => setImmediate(resolve));
          if (group.packed_sacks - group.dispatched_sacks < line.sacks) {
            return { marker: 'STOCK_SHORT', label: group.label };
          }
          group.dispatched_sacks += line.sacks;
          group.available_sacks = group.packed_sacks - group.dispatched_sacks;
          written.drawn.push({ group, sacks: line.sacks });
          const row = {
            id: `line-${lines.length + 1}`,
            dispatch_id: args.p_id,
            stock_group_id: group.id,
            quality: line.quality ?? group.quality,
            sacks: line.sacks,
            unit_price: line.unit_price,
            line_total: line.sacks * line.unit_price,
            created_at: '2026-08-15T00:00:00Z',
          };
          lines.push(row);
          written.lines.push(row);
          return null;
        });

        if (failure) {
          const err = new Error(`${failure.marker}:${failure.label}`);
          err.pgCode = 'P0001';
          throw err;
        }
      }
    } catch (err) {
      rollback();
      throw err;
    }

    const goods = args.p_lines.reduce((sum, l) => sum + l.sacks * l.unit_price, 0);
    return {
      id: args.p_id,
      lines: args.p_lines.length,
      goods_total: goods,
      transport_charge: args.p_transport_charge,
      total: goods + args.p_transport_charge,
    };
  };
}

/**
 * The price is on the header, one figure per quality, and the server puts it
 * onto the lines - so a body names the stock and the sacks, and quotes Coarse
 * once however many pools it is drawing from.
 */
const dispatchBody = (sacks) => ({
  customer_id: CUSTOMER_ID,
  dispatch_date: '2026-08-15',
  transport_provided: false,
  transport_charge: 0,
  lines: [{ stock_group_id: POOL.id, sacks }],
  prices: { Coarse: 36 },
});

test('two overlapping dispatches on one pool: one posts, one is refused with 409', async (t) => {
  const api = await startApi({
    tables: { stock_groups: [{ ...POOL }], dispatches: [], dispatch_lines: [] },
    functions: { post_dispatch: postDispatchFunction() },
  });
  t.after(() => api.stop());

  // 8 + 8 against a pool of 10: whichever order they land in, only one fits.
  const [first, second] = await Promise.all([
    api.call('/dispatches', { method: 'POST', body: dispatchBody(8) }),
    api.call('/dispatches', { method: 'POST', body: dispatchBody(8) }),
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409], 'exactly one of the two may be created');

  const refused = first.status === 409 ? first : second;
  const body = await refused.json();
  assert.equal(body.success, false);
  assert.match(body.message, /AUG-H2/, 'the 409 must name the pool the yard reads');
  assert.equal(body.errors?.[0]?.field, 'sacks', 'and point the form at the offending line');

  const group = api.tables.stock_groups[0];
  assert.equal(group.dispatched_sacks, 8, 'only the winning load may have been drawn down');
  assert.equal(group.available_sacks, 2);
  assert.ok(
    group.dispatched_sacks <= group.packed_sacks,
    'the pool must never be dispatched past what was packed into it',
  );

  assert.equal(api.tables.dispatches.length, 1, 'the refused dispatch must leave no header behind');
  assert.equal(api.tables.dispatch_lines.length, 1, 'and no lines');
});

test('a refused line rolls back the lines that already succeeded', async (t) => {
  const other = {
    ...POOL,
    id: '55555555-5555-4555-8555-555555555555',
    label: '2026-08-H1',
    packed_sacks: 50,
    dispatched_sacks: 0,
    available_sacks: 50,
  };
  const api = await startApi({
    tables: { stock_groups: [{ ...other }, { ...POOL }], dispatches: [], dispatch_lines: [] },
    functions: { post_dispatch: postDispatchFunction() },
  });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', {
    method: 'POST',
    body: {
      customer_id: CUSTOMER_ID,
      dispatch_date: '2026-08-15',
      lines: [
        // This one fits...
        { stock_group_id: other.id, sacks: 5 },
        // ...and this one does not, which must undo the first.
        { stock_group_id: POOL.id, sacks: 99 },
      ],
      prices: { Coarse: 36 },
    },
  });

  assert.equal(res.status, 409);
  assert.match((await res.json()).message, /AUG-H2/);

  const [first, second] = api.tables.stock_groups;
  assert.equal(first.dispatched_sacks, 0, 'a partially posted dispatch is no dispatch at all');
  assert.equal(second.dispatched_sacks, 0);
  assert.equal(api.tables.dispatches.length, 0);
  assert.equal(api.tables.dispatch_lines.length, 0);
});

test('a group that has not passed QC is refused, naming the group', async (t) => {
  const held = { ...POOL, qc_status: 'pending' };
  const api = await startApi({
    tables: { stock_groups: [held], dispatches: [], dispatch_lines: [] },
    functions: { post_dispatch: postDispatchFunction() },
  });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', { method: 'POST', body: dispatchBody(1) });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.message, /AUG-H2/);
  assert.match(body.message, /QC/);
  assert.equal(held.dispatched_sacks, 0);
});

/**
 * Nothing goes out unpriced.
 *
 * The rule is per quality rather than per line: the manager quotes a figure for
 * Coarse and every sack of Coarse on the document goes at it. So the ways to
 * get this wrong are a price that is not a price, and a quality on the document
 * that was never given one - and neither may reach the database, because
 * post_dispatch() writing a header and then refusing a line is a delivery note
 * for goods that never left.
 */
test('a quality left unpriced never reaches the database', async (t) => {
  const api = await startApi({
    tables: { stock_groups: [{ ...POOL }], dispatches: [], dispatch_lines: [] },
    functions: {
      post_dispatch: async () => {
        throw new Error('post_dispatch must not be called for an invalid body');
      },
    },
  });
  t.after(() => api.stop());

  const post = (prices) =>
    api.call('/dispatches', {
      method: 'POST',
      body: {
        customer_id: CUSTOMER_ID,
        dispatch_date: '2026-08-15',
        lines: [{ stock_group_id: POOL.id, sacks: 2 }],
        prices,
      },
    });

  for (const price of [0, -5, null, 'free']) {
    const res = await post({ Coarse: price });
    assert.equal(res.status, 422, `a price of ${price} must be refused before the write`);
  }

  // An empty price list, and one that prices a grade the document does not
  // carry while leaving the one it does carry out. The second is the realistic
  // mistake - the manager priced the wrong row - and it is the one a per-line
  // schema check would miss entirely, because every line is well-formed.
  assert.equal((await post({})).status, 422, 'a document with no prices at all is refused');

  const wrongGrade = await post({ Fine: 43 });
  assert.equal(wrongGrade.status, 422, 'a quality on the document with no price is refused');
  const body = await wrongGrade.json();
  assert.match(body.message, /Coarse/, 'and the refusal names the quality that was missed');

  const noLines = await api.call('/dispatches', {
    method: 'POST',
    body: {
      customer_id: CUSTOMER_ID,
      dispatch_date: '2026-08-15',
      lines: [],
      prices: { Coarse: 36 },
    },
  });
  assert.equal(noLines.status, 422);

  assert.equal(api.tables.dispatches.length, 0, 'nothing may have been written by any of them');
  assert.equal(api.tables.dispatch_lines.length, 0);
});

/**
 * One price per quality, however many lines carry it.
 *
 * Two pallets of Coarse off two different pools go out at the same rate,
 * because that is what the customer was quoted. A per-line price makes two
 * figures for one agreement possible, which nobody ever intends and nobody
 * notices until the invoice.
 */
test('one quoted price lands on every line of that quality', async (t) => {
  const other = {
    ...POOL,
    id: '66666666-6666-4666-8666-666666666666',
    label: '2026-08-H1',
    packed_sacks: 20,
    dispatched_sacks: 0,
    available_sacks: 20,
  };
  const api = await startApi({
    tables: { stock_groups: [{ ...other }, { ...POOL }], dispatches: [], dispatch_lines: [] },
    functions: { post_dispatch: postDispatchFunction() },
  });
  t.after(() => api.stop());

  const res = await api.call('/dispatches', {
    method: 'POST',
    body: {
      customer_id: CUSTOMER_ID,
      dispatch_date: '2026-08-15',
      lines: [
        { stock_group_id: other.id, sacks: 4 },
        { stock_group_id: POOL.id, sacks: 3 },
      ],
      prices: { Coarse: 36 },
    },
  });
  assert.equal(res.status, 201, await res.text());

  const written = api.tables.dispatch_lines;
  assert.equal(written.length, 2);
  for (const line of written) {
    assert.equal(line.unit_price, 36, 'both lines go out at the one quoted figure');
  }

  // And the grade priced against is the group's own, never the client's word
  // for it - a line cannot re-label itself into a cheaper bracket.
  assert.deepEqual([...new Set(written.map((line) => line.quality))], ['Coarse']);
});
