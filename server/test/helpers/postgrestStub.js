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
 * It answers Supabase Storage on the same listener, for the same reason:
 * attaching a lab report and deleting one are HTTP calls to a second service,
 * and a delete that has to reach into that service is only proved by something
 * being on the other end of it.
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
    }
    /*
     * Ordered comparisons, on numbers or on text.
     *
     * Numerically where both sides are numbers and lexicographically otherwise,
     * which is what Postgres does and what a date range needs: these used to
     * coerce with Number(), and Number('2026-08-01') is NaN, so every
     * comparison against a date came back false and a windowed query answered
     * with nothing at all. An ISO date sorts correctly as text, which is the
     * reason the plant stores them that way.
     */
    else if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
      const wanted = unquote(value);
      const cmp = (row) => {
        const held = row[field];
        if (held == null) return null;
        const a = Number(held);
        const b = Number(wanted);
        if (Number.isFinite(a) && Number.isFinite(b)) return a === b ? 0 : a < b ? -1 : 1;
        const x = String(held);
        return x === wanted ? 0 : x < wanted ? -1 : 1;
      };
      const passes = {
        gt: (c) => c > 0,
        gte: (c) => c >= 0,
        lt: (c) => c < 0,
        lte: (c) => c <= 0,
      }[operator];
      tests.push((row) => {
        const c = cmp(row);
        return c != null && passes(c);
      });
    }
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
 * The three Storage calls this project makes: put one object, list a folder,
 * and delete a set of paths.
 *
 * A bucket the bag does not name answers 404, the way Supabase does for one
 * that was never created. That is a case the server has to read as "there is
 * nothing here to delete" rather than as a failure, so it is worth being able
 * to seed.
 */
async function storageRoute(req, res, buckets, rest) {
  const listMatch = /^list\/([^/]+)$/.exec(rest);
  if (listMatch && req.method === 'POST') {
    const paths = buckets[listMatch[1]];
    if (!paths) return json(res, 404, { message: 'Bucket not found' });
    const { prefix = '', limit = 100, offset = 0 } = (await readBody(req)) ?? {};
    const folder = prefix ? `${prefix}/` : '';
    const under = paths
      .filter((path) => path.startsWith(folder))
      // Storage names the entries in the folder, not their full paths.
      .map((path) => ({ id: `object-${path}`, name: path.slice(folder.length) }));
    return json(res, 200, under.slice(offset, offset + limit));
  }

  const bucketMatch = /^([^/]+)$/.exec(rest);
  if (bucketMatch && req.method === 'DELETE') {
    const paths = buckets[bucketMatch[1]];
    if (!paths) return json(res, 404, { message: 'Bucket not found' });
    const { prefixes = [] } = (await readBody(req)) ?? {};
    buckets[bucketMatch[1]] = paths.filter((path) => !prefixes.includes(path));
    return json(res, 200, prefixes.map((name) => ({ name })));
  }

  const objectMatch = /^([^/]+)\/(.+)$/.exec(rest);
  if (objectMatch && req.method === 'POST') {
    const [, bucket, path] = objectMatch;
    const paths = buckets[bucket];
    if (!paths) return json(res, 404, { message: 'Bucket not found' });
    // Every upload the server makes carries x-upsert, so a repeat is one file.
    if (!paths.includes(path)) paths.push(path);
    return json(res, 200, { Key: `${bucket}/${path}` });
  }

  return json(res, 405, { message: 'method not allowed' });
}

/**
 * Starts the stub and hands back its URL, its tables, its buckets and a stop().
 *
 * `tables` is a plain `{ name: [rows] }` bag the test reads and writes directly,
 * so an assertion about "what the database ended up holding" is an assertion
 * about the same array the requests moved. `storage` is the same idea one
 * service over: `{ bucket: [paths] }`, which is what makes "the file went with
 * the row" something a test can actually watch happen.
 */
export async function startPostgrest({
  tables = {},
  functions = {},
  missingColumns = {},
  storage = {},
} = {}) {
  const store = { ...tables };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');

    // Storage is a different service on the same project, so it is a different
    // path prefix here rather than a different listener.
    const storageMatch = /^\/storage\/v1\/object\/(.+)$/.exec(url.pathname);
    if (storageMatch) return storageRoute(req, res, storage, decodeURI(storageMatch[1]));

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

    /*
     * A column the project does not have, named in a select.
     *
     * Opt-in per test, because the stub otherwise ignores `select` entirely and
     * answers with whole rows. What it models is the one case that matters: the
     * database is behind the code, and Postgres refuses the whole read rather
     * than returning the rest of the columns. Wording and code are Postgres's
     * own - the server matches on both.
     */
    const absent = missingColumns[table] ?? [];
    if (absent.length) {
      const asked = (url.searchParams.get('select') ?? '').split(',').map((c) => c.trim());
      const bad = absent.find((column) => asked.includes(column));
      if (bad) {
        return json(res, 400, {
          code: '42703',
          message: `column ${table}.${bad} does not exist`,
        });
      }
    }

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
    storage,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

export default startPostgrest;
