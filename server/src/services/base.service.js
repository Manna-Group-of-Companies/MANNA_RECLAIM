import { randomUUID } from 'node:crypto';
import { request, fetchAll, op, isDbReady } from '../config/supabase.js';
import { keyOf, pickColumns } from '../config/tables.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination } from '../utils/pagination.js';

export { op, isDbReady };

/** Client-generated ids: the tablets work offline and name their own rows. */
export const newId = randomUUID;

/**
 * The repetitive half of a domain service, built over Supabase.
 *
 * Domain files spread the result and add their own behaviour on top:
 *
 *   export const runService = { ...crud(TABLES.runs), start, stop };
 *
 * `select` narrows what comes back; `defaultSort` is the column list() falls
 * back to when the request does not name one.
 */
export function crud(table, { defaultSort = 'created_at', select = '*' } = {}) {
  const key = keyOf(table);
  const notFound = (id) => ApiError.notFound(`${table} ${id} not found`);

  /**
   * Tables keyed on something other than `id` - customers on `name`, the price
   * list on `grade` - still answer with an `id`, because that is what the
   * client models and the REST routes are written against.
   */
  const serialize = (row) => {
    if (!row || key === null || key === 'id') return row ?? null;
    return { id: row[key], ...row };
  };

  /** The mirror image: an incoming `id` addresses whatever the key column is. */
  const toRow = ({ id, ...rest } = {}) => {
    const row = { ...rest };
    if (id !== undefined && key !== null && row[key] === undefined) row[key] = id;
    return pickColumns(table, row);
  };

  /** Nothing may rewrite the key column on a patch. */
  const toPatch = (patch = {}) => {
    const { id: _id, ...rest } = patch;
    const row = pickColumns(table, rest);
    if (key !== null) delete row[key];
    return row;
  };

  const byKey = (id) => {
    if (key === null) {
      throw ApiError.badRequest(`${table} has no single-column key; filter on its columns instead`);
    }
    return { [key]: id };
  };

  return {
    table,
    key,

    async list(query = {}, filters = {}) {
      const { from, sort, ascending, page, limit } = parsePagination(query);
      const { rows, total } = await request(table, {
        select,
        filters,
        order: sort || defaultSort,
        ascending,
        offset: from,
        limit,
        count: true,
      });
      return { rows: rows.map(serialize), total, page, limit };
    },

    /**
     * Every matching row, ignoring page/limit. The reports aggregate over
     * thousands of runs, and going through list() would cap them at the
     * 200-row pagination ceiling - or, straight off request(), at whatever
     * max-rows the PostgREST instance enforces.
     */
    async all(filters = {}, { sort = defaultSort, ascending = false } = {}) {
      const rows = await fetchAll(table, { select, filters, order: sort, ascending });
      return rows.map(serialize);
    },

    async findById(id) {
      const { rows } = await request(table, { select, filters: byKey(id), limit: 1 });
      if (!rows.length) throw notFound(id);
      return serialize(rows[0]);
    },

    /** The first matching row, or null - for the "is there one of these" checks. */
    async findOne(filters = {}, { sort = defaultSort, ascending = false } = {}) {
      const { rows } = await request(table, { select, filters, order: sort, ascending, limit: 1 });
      return rows.length ? serialize(rows[0]) : null;
    },

    async exists(filters = {}) {
      const { total } = await request(table, {
        select: key ?? '*',
        filters,
        limit: 1,
        count: true,
      });
      return total > 0;
    },

    async create(payload) {
      const row = toRow(payload);
      // Postgres would fill a uuid default, but the offline tablets name their
      // own rows, so the id is ours to generate on both paths.
      if (key === 'id' && row.id === undefined) row.id = newId();
      const { rows } = await request(table, { method: 'POST', select, body: row });
      return serialize(rows[0]);
    },

    async update(id, patch) {
      const body = toPatch(patch);
      if (!Object.keys(body).length) return this.findById(id);
      const { rows } = await request(table, {
        method: 'PATCH',
        select,
        filters: byKey(id),
        body,
      });
      if (!rows.length) throw notFound(id);
      return serialize(rows[0]);
    },

    /**
     * Update by filter rather than by key, answering with whatever it touched.
     * An empty `rows` means nothing matched - which is how the callers that
     * guard on a version column detect that someone else wrote first.
     */
    async updateWhere(filters, patch) {
      const body = toPatch(patch);
      if (!Object.keys(body).length) return { rows: [] };
      const { rows } = await request(table, { method: 'PATCH', select, filters, body });
      return { rows: rows.map(serialize) };
    },

    /**
     * Idempotent bulk write used by the offline sync endpoints. `onConflict` is
     * the comma-separated column list the rows are matched on ('id',
     * 'customer,grade'), and it has to carry a unique constraint in Postgres.
     */
    async upsertMany(rows, onConflict = key ?? 'id') {
      if (!rows?.length) return [];
      const body = rows.map((raw) => {
        const row = toRow(raw);
        if (key === 'id' && row.id === undefined) row.id = newId();
        return row;
      });
      const { rows: saved } = await request(table, {
        method: 'POST',
        select,
        body,
        onConflict,
      });
      return saved.map(serialize);
    },

    async remove(id) {
      await request(table, {
        method: 'DELETE',
        filters: byKey(id),
        select: null,
        returning: false,
      });
      return { id };
    },
  };
}

export default crud;
