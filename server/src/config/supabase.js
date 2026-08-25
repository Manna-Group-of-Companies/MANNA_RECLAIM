import { env } from './env.js';
import { logger } from './logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * The database layer: Supabase, reached over PostgREST.
 *
 * There is no socket to open and no pool to size - PostgREST is HTTP - so
 * "ready" means nothing more than "the URL and a key are configured". Every
 * read and write in the app funnels through request(), which is the one place
 * that knows about retries, the Postgres-error-to-ApiError mapping and the
 * Content-Range header the row counts come out of.
 */

const MAX_ATTEMPTS = 3;
/** How many missing columns one write may drop before it is given up on. */
const MAX_REPAIRS = 20;
/** Worth a second go: rate limiting and the gateway losing a connection. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
/** How many Storage entries one `list` asks for - it pages like everything else. */
const STORAGE_PAGE = 100;

export const isDbReady = () => Boolean(env.supabase.url && env.supabase.key);

/** What /health reports - the project host, never the key. */
export const dbInfo = () => ({
  driver: 'supabase',
  host: env.supabase.url ? env.supabase.url.replace(/^https?:\/\//, '') : null,
  ready: isDbReady(),
});

const headers = (extra) => ({
  apikey: env.supabase.key,
  Authorization: `Bearer ${env.supabase.key}`,
  Accept: 'application/json',
  ...extra,
});

/**
 * A filter reads `column=operator.value`. Values carrying a comma, a dot, a
 * bracket or whitespace have to be double-quoted or PostgREST parses them as
 * syntax rather than data; the empty string has to be quoted to exist at all.
 */
const encodeValue = (value) => {
  if (value === null || value === undefined) return 'null';
  const raw = String(value);
  if (raw === '' || /[,.()"\\\s]/.test(raw)) return `"${raw.replace(/(["\\])/g, '\\$1')}"`;
  return raw;
};

const encodeList = (values) => `(${values.map(encodeValue).join(',')})`;

/** The operator vocabulary the services filter with. */
export const op = {
  eq: (value) => ({ op: 'eq', value }),
  neq: (value) => ({ op: 'neq', value }),
  gt: (value) => ({ op: 'gt', value }),
  gte: (value) => ({ op: 'gte', value }),
  lt: (value) => ({ op: 'lt', value }),
  lte: (value) => ({ op: 'lte', value }),
  like: (value) => ({ op: 'like', value }),
  ilike: (value) => ({ op: 'ilike', value }),
  oneOf: (values) => ({ op: 'in', value: values }),
  notOneOf: (values) => ({ op: 'not.in', value: values }),
  isNull: () => ({ op: 'is', value: null }),
  notNull: () => ({ op: 'not.is', value: null }),
};

const clause = ({ op: operator, value }) =>
  `${operator}.${operator.endsWith('in') ? encodeList(value) : encodeValue(value)}`;

/**
 * Turns a `{ column: value }` bag into PostgREST query params.
 *
 * Blank values are dropped so `?shift=` behaves as "no filter" - which is what
 * every controller relies on when it forwards an unset query param. To match
 * on null, or on anything the shorthand cannot express, hand in an operator
 * object from `op` above: `{ ended_at: op.isNull() }`.
 */
function applyFilters(params, filters = {}) {
  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (field === 'or') {
      // Already-built clause strings: ['quality.not.is.null', 'line.eq.coarse']
      params.append('or', `(${value.join(',')})`);
      continue;
    }
    if (Array.isArray(value)) {
      /*
       * Two clauses on one column, which is how a range is asked for:
       * `{ shift_date: [op.gte(from), op.lte(to)] }`. PostgREST ands repeated
       * parameters, so both are appended rather than combined here.
       *
       * A plain array is still an IN list - `{ machine_id: ['R1', 'R4'] }` - so
       * the two are told apart by what is in the array, not by a second
       * argument somewhere. Mixing the two would be asking for a list of
       * operators as a set of values, which is not a thing anyone means.
       */
      if (value.every((v) => v && typeof v === 'object' && 'op' in v)) {
        for (const each of value) params.append(field, clause(each));
      } else params.append(field, `in.${encodeList(value)}`);
    } else if (typeof value === 'object') params.append(field, clause(value));
    else params.append(field, `eq.${encodeValue(value)}`);
  }
}

/** `Content-Range: 0-49/1451` -> 1451. A star instead of a number means no count was asked for. */
const totalFrom = (header, fallback) => {
  const total = String(header ?? '').split('/')[1];
  return total && total !== '*' ? Number(total) : fallback;
};

/**
 * Postgres and PostgREST both answer with a code; map the ones that mean the
 * caller got it wrong, so they surface as 4xx rather than a blanket 500.
 */
function toApiError(status, payload, table) {
  const code = payload?.code ?? '';
  const message = payload?.message ?? `Database error (HTTP ${status})`;
  const detail = payload?.details ?? payload?.hint ?? undefined;

  if (code === '23505') return ApiError.conflict('A record with that value already exists', detail);
  if (code === '23503') return ApiError.conflict('That record is still referenced elsewhere', detail);
  if (code === '23502') return ApiError.unprocessable('A required field is missing', detail);
  if (code === '22P02' || code === '22007') return ApiError.badRequest(message, detail);
  // The table or column the server expects is not in the project yet.
  if (code === 'PGRST204' || code === 'PGRST205') {
    return ApiError.unavailable(`${table}: ${message} - run supabase/schema.sql`);
  }
  if (code === 'PGRST116') return ApiError.notFound(message);
  if (status === 401 || status === 403) {
    return ApiError.unavailable('Supabase rejected the API key for ' + table);
  }
  if (status >= 400 && status < 500) return ApiError.badRequest(message, detail);
  return new ApiError(500, message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Columns the project does not actually have, per table.
 *
 * The plant's database predates this server: `runs` came from the tablets, and
 * the handful of columns the API added on top of it live in supabase/schema.sql
 * rather than in the project until someone runs that file. Refusing every write
 * until then would stop the shop floor recording anything at all, so a write
 * naming a column that does not exist leaves that column out and goes through
 * with the rest - loudly, once per column, so it still reads as something to
 * fix rather than as normal.
 *
 * Filled by verifySchema() at boot, and by the first write that trips over a
 * column the check did not cover.
 */
const absentColumns = new Map();

/**
 * How long the server keeps believing a column is missing before it tries once
 * more.
 *
 * Being missing is a temporary state by definition - it is the gap between the
 * code wanting a column and someone running the SQL - and the marking used to
 * outlive the fix. Add the column to the project and the running API went on
 * pruning it from every query until it was restarted, so the migration looked
 * like it had done nothing. On the plant's deployment that means an SSH and a
 * bounce, and until then a screen with a blank field and no clue why.
 *
 * Half a minute costs one failed query per column per interval in the state
 * that is meant to be temporary anyway, and buys a migration that takes effect
 * on its own. Nothing forgets a column that really is absent for long - it is
 * simply re-learned.
 */
const ABSENT_TTL_MS = 30_000;

function markAbsent(table, column, announce = true) {
  let absent = absentColumns.get(table);
  if (!absent) absentColumns.set(table, (absent = new Map()));
  const known = absent.has(column);
  absent.set(column, Date.now());
  if (known) return;
  // The boot check prints its own summary line, so it marks these quietly.
  if (announce) {
    logger.warn(
      `Supabase: ${table}.${column} does not exist - writes will leave it out. Run supabase/schema.sql to keep it.`,
    );
  }
}

/**
 * The columns this table is currently being treated as not having.
 *
 * Anything marked longer ago than the TTL is dropped here rather than on a
 * timer: the next query is the only moment the answer is wanted, and it is also
 * the moment that finds out whether the column has since been added.
 */
function absentIn(table) {
  const absent = absentColumns.get(table);
  if (!absent?.size) return null;
  const stale = Date.now() - ABSENT_TTL_MS;
  for (const [column, at] of absent) if (at < stale) absent.delete(column);
  return absent.size ? absent : null;
}

/** What the server has given up on writing, for /health and the tests. */
export const absentSchema = () =>
  Object.fromEntries([...absentColumns].map(([table, cols]) => [table, [...cols.keys()]]));

const carriesColumn = (body, column) =>
  Array.isArray(body)
    ? body.some((row) => row && typeof row === 'object' && column in row)
    : Boolean(body) && typeof body === 'object' && column in body;

/** A write body with the project's missing columns taken out of it. */
function pruneBody(table, body) {
  const absent = absentIn(table);
  if (!absent || !body || typeof body !== 'object') return body;
  const strip = (row) => {
    if (!row || typeof row !== 'object') return row;
    const kept = Object.entries(row).filter(([column]) => !absent.has(column));
    return kept.length === Object.keys(row).length ? row : Object.fromEntries(kept);
  };
  return Array.isArray(body) ? body.map(strip) : strip(body);
}

/**
 * The same treatment for what a read asks *for*.
 *
 * A write that names a missing column is pruned and goes through; a read that
 * names one used to take the whole screen down with it, which is the wrong way
 * round - the back office cannot record anything on a page that will not load,
 * and the column it is missing is by definition one with nothing in it yet. So
 * the select drops it too, and the page comes up with that field blank.
 *
 * Only a plain column list is touched. A select carrying an embedded resource
 * or an alias - `runs(id,name)`, `total:count` - is handed over untouched
 * rather than half understood, and `*` never names a column to begin with.
 */
function pruneSelect(table, select) {
  const absent = absentIn(table);
  if (!absent || !select || select === '*' || /[(:*]/.test(select)) return select;
  const kept = select.split(',').filter((column) => !absent.has(column.trim()));
  if (kept.length === select.split(',').length) return select;
  // Everything it asked for is missing. `*` is the honest answer - the row as
  // the project actually has it - and an empty select is not a request at all.
  return kept.length ? kept.join(',') : '*';
}

/** `Could not find the 'needs_weigh' column of 'runs' ...` -> needs_weigh */
const missingColumnFrom = (message) => /'([^']+)' column/.exec(String(message ?? ''))?.[1] ?? null;

/**
 * `column users.last_login_at does not exist` -> last_login_at
 *
 * Postgres's own wording rather than PostgREST's, because a column named in a
 * select reaches the database and comes back as 42703 - a different code and a
 * different sentence from the PGRST204 a write gets.
 */
const missingSelectFrom = (message) =>
  /column\s+(?:[\w$]+\.)?"?([\w$]+)"?\s+does not exist/i.exec(String(message ?? ''))?.[1] ?? null;

/** Whether a select asks for a column by name - `*` asks for none of them. */
const selectCarries = (select, column) =>
  Boolean(select) &&
  select !== '*' &&
  select.split(',').some((part) => part.trim() === column);

/**
 * One PostgREST call.
 *
 * Returns `{ rows, total }` - `total` is the full match count when `count` is
 * asked for, and the length of the page otherwise.
 */
export async function request(
  table,
  {
    method = 'GET',
    select = '*',
    filters = {},
    order,
    ascending = false,
    limit,
    offset,
    count = false,
    body,
    onConflict,
    returning = true,
  } = {},
) {
  if (!isDbReady()) throw ApiError.unavailable('Supabase is not configured');

  /*
   * Built per attempt rather than once, so a select repaired below is what the
   * retry actually sends. verifySchema() is unaffected by the pruning here: it
   * runs at boot with nothing yet marked absent, which is what lets its probe
   * still fail and report the column instead of quietly dropping it.
   */
  /*
   * What the select had been narrowed to on the attempt that is in flight. The
   * repair below is judged against this rather than against a fresh pruning,
   * because between building the URL and reading the answer another request may
   * have marked the very column this one is about to be told about - see there.
   */
  let sentSelect = select;

  const buildUrl = () => {
    const params = new URLSearchParams();
    const wanted = pruneSelect(table, select);
    sentSelect = wanted;
    if (wanted) params.set('select', wanted);
    applyFilters(params, filters);
    if (order) {
      // Rows with no value sort last either way; otherwise a null shift_date
      // would head up a "newest first" list.
      params.set('order', `${order}.${ascending ? 'asc' : 'desc'}.nullslast`);
    }
    if (limit != null) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (onConflict) params.set('on_conflict', onConflict);
    return `${env.supabase.url}/rest/v1/${table}?${params}`;
  };

  const prefer = [];
  if (count) prefer.push('count=exact');
  if (method !== 'GET') prefer.push(returning ? 'return=representation' : 'return=minimal');
  if (onConflict) prefer.push('resolution=merge-duplicates');

  // Written columns the project is known to be without are dropped up front;
  // anything that only shows up as a PGRST204 below is dropped and retried.
  let sending = pruneBody(table, body);

  // Every column this update meant to write is one the project does not have,
  // so there is nothing left to send. PostgREST treats a `{}` patch as touching
  // no rows, which the services read as "the row is gone" - answer with the row
  // as it stands instead, unchanged.
  if (method === 'PATCH' && sending && !Array.isArray(sending) && !Object.keys(sending).length) {
    logger.warn(`Supabase: ${table} update dropped every column it meant to write - nothing saved`);
    return request(table, { select, filters, order, ascending, limit });
  }

  const buildInit = () => ({
    method,
    headers: headers({
      ...(prefer.length ? { Prefer: prefer.join(',') } : {}),
      ...(sending !== undefined ? { 'Content-Type': 'application/json' } : {}),
    }),
    ...(sending !== undefined ? { body: JSON.stringify(sending) } : {}),
  });

  let lastError;
  let repairs = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let res;
    try {
      res = await fetch(buildUrl(), buildInit());
    } catch (err) {
      // Network-level failure: DNS, TLS, the connection dropped mid-flight.
      lastError = new ApiError(503, `Supabase unreachable: ${err.message}`);
      if (attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(attempt * 300);
      continue;
    }

    if (res.ok || res.status === 206) {
      const text = await res.text();
      const parsed = text ? JSON.parse(text) : [];
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return { rows, total: totalFrom(res.headers.get('content-range'), rows.length) };
    }

    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { message: text.slice(0, 300) };
    }

    // A write naming a column the project does not have: drop that column and
    // send the rest. Retrying this way is not one of the three attempts, but it
    // is bounded, so a table the server and the project disagree about wholly
    // still fails rather than spinning.
    if (method !== 'GET' && payload?.code === 'PGRST204' && repairs < MAX_REPAIRS) {
      const column = missingColumnFrom(payload.message);
      if (column && carriesColumn(sending, column)) {
        markAbsent(table, column);
        sending = pruneBody(table, sending);
        repairs += 1;
        attempt -= 1;
        continue;
      }
    }

    /*
     * The read half of the same repair: a column named in the select that the
     * project does not have. Marked and asked for again without it, so the page
     * comes up with that field blank rather than not at all.
     *
     * The boot check normally marks these first and this never fires. It is
     * what covers a project running with SUPABASE_VERIFY_SCHEMA off, and the
     * window between a column being added to the code and being added to the
     * database - which is exactly when a screen would otherwise go dark.
     */
    if (payload?.code === '42703' && repairs < MAX_REPAIRS) {
      const column = missingSelectFrom(payload.message);
      /*
       * Against the select this attempt actually sent, not against a fresh
       * pruning of the original.
       *
       * The two differ exactly when a second request discovered the same
       * missing column while this one was in flight - two screens opened
       * together on the morning a column is added, or, more reliably, the
       * last-seen stamp that now rides along with every authenticated read. A
       * fresh pruning would already have the column removed, so this request
       * would decide the error was not about anything it asked for and hand the
       * caller a 400 - the page going dark for the one reason the repair exists
       * to prevent, and only ever under concurrency.
       *
       * It still cannot spin: the next build prunes against a set that now
       * holds the column, so it goes out without it and cannot come back.
       */
      if (column && selectCarries(sentSelect, column)) {
        markAbsent(table, column);
        repairs += 1;
        attempt -= 1;
        continue;
      }
    }

    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
      lastError = toApiError(res.status, payload, table);
      await sleep(attempt * 300);
      continue;
    }
    throw toApiError(res.status, payload, table);
  }
  throw lastError;
}

/**
 * Calls a Postgres function and answers with whatever it returned.
 *
 * The one thing PostgREST cannot do over tables is a transaction: each request
 * is its own, so a header written by one call and lines written by the next can
 * be left half-posted by anything that goes wrong in between. A function is one
 * request and therefore one transaction, which is why posting a dispatch is a
 * function rather than four writes from here - see post_dispatch() in
 * supabase/migrations/0001_stock_and_dispatch.sql.
 *
 * Errors are deliberately left alone rather than mapped: a function raises
 * messages the caller is going to read (which group was short, which failed QC)
 * and toApiError's generic 400 would throw the label away. Callers catch and
 * translate their own.
 */
export async function rpc(fn, args = {}) {
  if (!isDbReady()) throw ApiError.unavailable('Supabase is not configured');

  const url = `${env.supabase.url}/rest/v1/rpc/${fn}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(args),
    });
  } catch (err) {
    throw new ApiError(503, `Supabase unreachable: ${err.message}`);
  }

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text.slice(0, 300) };
  }

  if (!res.ok) {
    const error = new ApiError(res.status < 500 ? 400 : 502, payload?.message ?? `RPC ${fn} failed`);
    // What the function raised, kept intact so the caller can read the marker
    // and the label out of it.
    error.pgCode = payload?.code ?? null;
    error.pgMessage = payload?.message ?? null;
    error.pgDetails = payload?.details ?? payload?.hint ?? null;
    throw error;
  }
  return payload;
}

/**
 * Every matching row, however many there are.
 *
 * PostgREST caps a single response at its own max-rows - 1000 on a default
 * project - and says nothing about having done so. The reports aggregate over
 * the plant's whole run history, so a silent cap there would quietly under-
 * report production, cost and efficiency. The exact count comes back in
 * Content-Range on the first page, and this walks the rest.
 */
export async function fetchAll(table, options = {}) {
  const size = Math.max(1, env.supabase.pageSize);
  const first = await request(table, { ...options, offset: 0, limit: size, count: true });

  const rows = first.rows;
  const total = first.total;
  // A page shorter than asked for is the last one, whatever the count claims.
  if (rows.length >= total || rows.length < size) return rows;

  for (let offset = rows.length; offset < total; ) {
    const page = await request(table, { ...options, offset, limit: size });
    if (!page.rows.length) break; // rows deleted under us - stop rather than spin
    rows.push(...page.rows);
    offset += page.rows.length;
  }
  return rows;
}

/**
 * Puts a file in Supabase Storage and answers with its public URL.
 *
 * Storage is a different service from PostgREST but the same project and the
 * same key, so it rides on the headers above. The bucket has to exist and be
 * public - the lab's reports live in `qc-reports`.
 */
export async function uploadObject(bucket, path, { body, contentType } = {}) {
  if (!isDbReady()) throw ApiError.unavailable('Supabase is not configured');

  const url = `${env.supabase.url}/storage/v1/object/${bucket}/${encodeURI(path)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: headers({
        'Content-Type': contentType || 'application/octet-stream',
        // Re-filing a verdict overwrites the report rather than piling copies up.
        'x-upsert': 'true',
      }),
      body,
    });
  } catch (err) {
    throw new ApiError(503, `Supabase storage unreachable: ${err.message}`);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    if (res.status === 404) {
      throw ApiError.unavailable(`Storage bucket "${bucket}" does not exist - create it in Supabase`);
    }
    if (res.status === 401 || res.status === 403) {
      throw ApiError.unavailable(`Supabase rejected the API key for bucket "${bucket}"`);
    }
    throw new ApiError(res.status < 500 ? 400 : 502, `Upload failed: ${detail}`);
  }
  return `${env.supabase.url}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

/**
 * Takes every file under one prefix back out of Storage.
 *
 * The counterpart to uploadObject(), and a prefix rather than a path on
 * purpose: the lab's reports are filed under the test's own id, so `qc-reports`
 * holds `<test id>/sheet.pdf` and - where somebody re-attached under a
 * different filename - whatever the earlier upload was called as well. Deleting
 * only the one URL the row happens to be carrying would leave those behind,
 * readable at a public URL, belonging to a test that no longer exists. The
 * whole folder goes.
 *
 * A prefix with nothing under it is not an error: a test that never had a
 * report attached is the ordinary case, and this answers 0 for it.
 */
export async function removeObjects(bucket, prefix) {
  if (!isDbReady()) throw ApiError.unavailable('Supabase is not configured');
  const folder = String(prefix ?? '').replace(/^\/+|\/+$/g, '');
  if (!folder) throw ApiError.badRequest('A storage prefix is required');

  const storage = async (path, { method = 'POST', body } = {}) => {
    let res;
    try {
      res = await fetch(`${env.supabase.url}/storage/v1/${path}`, {
        method,
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError(503, `Supabase storage unreachable: ${err.message}`);
    }
    if (!res.ok) {
      // A bucket nobody ever created holds nothing to delete, so a delete
      // against it has already achieved what it was asked for.
      if (res.status === 404) return null;
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 401 || res.status === 403) {
        throw ApiError.unavailable(`Supabase rejected the API key for bucket "${bucket}"`);
      }
      throw new ApiError(res.status < 500 ? 400 : 502, `Storage delete failed: ${detail}`);
    }
    return res.json().catch(() => null);
  };

  // `list` names the entries in one folder rather than their full paths, and it
  // pages - so the walk is the shape fetchAll() uses on the tables.
  const paths = [];
  for (let offset = 0; ; ) {
    const page = await storage(`object/list/${bucket}`, {
      body: { prefix: folder, limit: STORAGE_PAGE, offset },
    });
    const entries = Array.isArray(page) ? page : [];
    // `id: null` is a nested folder rather than a file - nothing this project
    // writes, and not something to hand a delete as though it were an object.
    for (const entry of entries) {
      if (entry?.name && entry.id !== null) paths.push(`${folder}/${entry.name}`);
    }
    if (entries.length < STORAGE_PAGE) break;
    offset += entries.length;
  }

  if (!paths.length) return 0;
  await storage(`object/${bucket}`, { method: 'DELETE', body: { prefixes: paths } });
  return paths.length;
}

/**
 * Confirms at boot that the project actually has the tables and columns the
 * server writes to. An empty table gives nothing away on a `select=*`, but
 * naming a column PostgREST does not know is a 400 - so one request per table
 * answers it, and only a failing table pays for the per-column bisect that
 * says which one is missing.
 */
export async function verifySchema(registry) {
  const problems = [];

  await Promise.all(
    Object.entries(registry).map(async ([table, spec]) => {
      const columns = spec.columns ?? [];
      if (!columns.length) return;
      try {
        await request(table, { select: columns.join(','), limit: 0 });
      } catch {
        try {
          await request(table, { select: '*', limit: 0 });
        } catch {
          problems.push({ table, missing: null });
          return;
        }
        const missing = [];
        for (const column of columns) {
          try {
            await request(table, { select: column, limit: 0 });
          } catch {
            missing.push(column);
          }
        }
        if (missing.length) problems.push({ table, missing });
      }
    }),
  );

  for (const { table, missing } of problems) {
    if (missing === null) {
      logger.warn(`Supabase: table "${table}" is missing`);
      continue;
    }
    logger.warn(`Supabase: ${table} is missing column(s) ${missing.join(', ')}`);
    // Writes leave these out from here on rather than failing on them.
    for (const column of missing) markAbsent(table, column, false);
  }
  if (problems.length) logger.warn('Run supabase/schema.sql in the Supabase SQL editor to fix.');

  return problems;
}

export default {
  request, rpc, op, isDbReady, dbInfo, verifySchema, absentSchema, uploadObject, removeObjects,
};
