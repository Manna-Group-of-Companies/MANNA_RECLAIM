import http from 'node:http';

/**
 * Just enough PostgREST to run the API against.
 *
 * The server talks to Supabase over HTTP and nothing else - no driver, no pool -
 * so the honest way to test a route end to end is to answer that HTTP. This
 * stands up a real listener, speaks the handful of PostgREST conventions the
 * server's request() actually uses (`col=eq.value`, `select`, `limit`,
 * `Prefer: count=exact` answered in Content-Range, `/rpc/fn`) and serves rows
 * out of memory.
 *
 * It is deliberately not a database. What it is for is proving the layers above
 * one: that a role guard refuses before anything is read, that a response body
 * carries the fields it is supposed to and none it is not, and that the API
 * turns a function's refusal into the right status. The transactional promises -
 * `for update`, the conditional UPDATE, the rollback - belong to Postgres and
 * are asserted against a Postgres that behaves as documented, modelled below.
 */

const json = (res, status, body, extraHeaders = {}) => {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
    ...extraHeaders,
  });
  res.end(text);
};

/** `id=eq.abc` / `dispatch_id=in.("a","b")` -> a predicate over a row. */
function predicateFor(params) {
  const tests = [];
  for (const [field, raw] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(field)) continue;
    const [operator, ...rest] = String(raw).split('.');
    const value = rest.join('.');
    const unquote = (v) => v.replace(/^"|"$/g, '').replace(/\\(["\\])/g, '$1');
    if (operator === 'eq') tests.push((row) => String(row[field]) === unquote(value));
    else if (operator === 'neq') tests.push((row) => String(row[field]) !== unquote(value));
    else if (operator === 'in') {
      const list = value.replace(/^\(|\)$/g, '').split(',').map(unquote);
      tests.push((row) => list.includes(String(row[field])));
    } else if (operator === 'gt') tests.push((row) => Number(row[field]) > Number(value));
    else if (operator === 'gte') tests.push((row) => Number(row[field]) >= Number(value));
    else if (operator === 'lt') tests.push((row) => Number(row[field]) < Number(value));
    else if (operator === 'lte') tests.push((row) => Number(row[field]) <= Number(value));
    /*
     * `is.null` and `not.is.null`.
     *
     * These were missing, and a missing operator here is worse than an
     * unsupported one: the loop simply added no test, so a filter the server
     * relies on came back matching every row. `?ended_at=is.null` - which is how
     * "runs in progress" is asked - answered with every run ever logged, and any
     * test that seeded a finished run and then started another got a spurious
     * "that machine already has a run in progress".
     */
    else if (operator === 'is') tests.push((row) => (row[field] ?? null) === null);
    else if (operator === 'not' && value === 'is.null') {
      tests.push((row) => (row[field] ?? null) !== null);
    } else if (operator === 'ilike') {
      const rx = new RegExp(`^${unquote(value).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
      tests.push((row) => rx.test(String(row[field] ?? '')));
    }
  }
  return (row) => tests.every((test) => test(row));
}

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        resolve(null);
      }
    });
  });

/**
 * Starts the stub and hands back its URL, its tables, and a stop().
 *
 * `tables` is a plain `{ name: [rows] }` bag the test reads and writes directly,
 * so an assertion about "what the database ended up holding" is an assertion
 * about the same array the requests moved.
 */
export async function startPostgrest({ tables = {}, functions = {} } = {}) {
  const store = { ...tables };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    const rpcMatch = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);

    if (rpcMatch) {
      const fn = functions[rpcMatch[1]];
      if (!fn) return json(res, 404, { code: '42883', message: `function ${rpcMatch[1]} does not exist` });
      try {
        return json(res, 200, await fn(await readBody(req), store));
      } catch (err) {
        // What PostgREST puts on the wire when a plpgsql function raises.
        return json(res, err.status ?? 400, { code: err.pgCode ?? 'P0001', message: err.message });
      }
    }

    const tableMatch = /^\/rest\/v1\/([^/?]+)$/.exec(url.pathname);
    if (!tableMatch) return json(res, 404, { message: 'not found' });

    const table = tableMatch[1];
    const rows = (store[table] ||= []);

    if (req.method === 'GET') {
      const matched = rows.filter(predicateFor(url.searchParams));
      const limit = url.searchParams.get('limit');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const page = matched.slice(offset, limit == null ? undefined : offset + Number(limit));
      const wantsCount = String(req.headers.prefer ?? '').includes('count=exact');
      return json(res, 200, page, {
        'Content-Range': `${offset}-${offset + Math.max(page.length - 1, 0)}/${wantsCount ? matched.length : '*'}`,
      });
    }

    const body = await readBody(req);

    if (req.method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body];

      /*
       * `?on_conflict=col` is an upsert, and has to behave like one: the server
       * saves the cost rates as a single row keyed on `id`, so a stub that only
       * ever appended would leave two rows claiming to be the current figures
       * and hand back whichever was written first. A rate that could not be
       * revised would then look exactly like a rate that had been snapshotted.
       */
      const conflict = url.searchParams.get('on_conflict');
      if (conflict) {
        const keys = conflict.split(',').map((column) => column.trim());
        const same = (a, b) => keys.every((column) => String(a[column]) === String(b[column]));
        for (const row of incoming) {
          const existing = rows.find((candidate) => same(candidate, row));
          if (existing) Object.assign(existing, row);
          else rows.push(row);
        }
        return json(res, 201, incoming);
      }

      rows.push(...incoming);
      return json(res, 201, incoming);
    }

    if (req.method === 'PATCH') {
      const matches = rows.filter(predicateFor(url.searchParams));
      for (const row of matches) Object.assign(row, body);
      return json(res, 200, matches);
    }

    if (req.method === 'DELETE') {
      const keep = rows.filter((row) => !predicateFor(url.searchParams)(row));
      store[table] = keep;
      return json(res, 204, []);
    }

    return json(res, 405, { message: 'method not allowed' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    tables: store,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

export default startPostgrest;
