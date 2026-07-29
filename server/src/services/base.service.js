import { modelFor } from '../models/index.js';
import { newId } from '../models/base.model.js';
import { isDbReady } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination } from '../utils/pagination.js';

/** Resolves a collection name to its model, refusing early when Mongo is down. */
export function model(collection) {
  if (!isDbReady()) throw ApiError.unavailable('Database is not configured');
  return modelFor(collection);
}

/** Mongo stores `_id`; the API has always spoken `id`. */
export const serialize = (row) => {
  if (!row) return row;
  const { _id, ...rest } = row;
  return _id === undefined ? rest : { id: _id, ...rest };
};

const toDoc = ({ id, _id, ...rest } = {}) => {
  const key = id ?? _id;
  return key === undefined || key === null ? rest : { _id: key, ...rest };
};

/** Patches must never rewrite the immutable _id. */
const toPatch = ({ id: _id0, _id: _id1, ...rest } = {}) => rest;

const fieldList = (select) =>
  !select || select === '*'
    ? null
    : String(select).split(',').map((s) => s.trim()).filter(Boolean);

/** `select: 'id,name,role'` -> a mongoose projection. */
const projectionFor = (select) => {
  const fields = fieldList(select);
  return fields ? fields.map((f) => (f === 'id' ? '_id' : f)).join(' ') : undefined;
};

/** Same restriction applied to an already-serialized row (create/update paths). */
const pick = (row, select) => {
  const fields = fieldList(select);
  if (!fields || !row) return row;
  const keep = new Set(fields);
  return Object.fromEntries(Object.entries(row).filter(([k]) => keep.has(k)));
};

/**
 * Turns a plain `{ field: value }` filter bag into a Mongo query.
 *
 * Blank values are dropped so `?shift=` behaves as "no filter". To match on
 * null (an open run has `ended_at: null`) or on anything else the shorthand
 * cannot express, hand in an operator object - `{ ended_at: { $eq: null } }` -
 * or a top-level `$and` / `$or`, both of which pass straight through.
 */
const where = (filters = {}) => {
  const query = {};
  for (const [field, value] of Object.entries(filters)) {
    if (field.startsWith('$')) {
      query[field] = value;
      continue;
    }
    if (value === undefined || value === null || value === '') continue;
    const key = field === 'id' ? '_id' : field;
    if (Array.isArray(value)) query[key] = { $in: value };
    else if (typeof value === 'object') query[key] = value;
    else query[key] = value;
  }
  return query;
};

/** Turns driver/validation failures into the ApiError shape the handler expects. */
export function wrapError(err) {
  if (err instanceof ApiError) return err;
  if (err?.code === 11000 || err?.code === 11001) {
    return ApiError.conflict('A record with that value already exists', err.keyValue);
  }
  if (err?.name === 'ValidationError') {
    const details = Object.values(err.errors ?? {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.unprocessable('Validation failed', details);
  }
  if (err?.name === 'CastError') {
    return ApiError.badRequest('Invalid value for ' + err.path, { value: err.value });
  }
  return new ApiError(500, err?.message || 'Database error');
}

/**
 * Builds the repetitive half of a domain service. Domain files spread the
 * result and add their own behaviour on top.
 *
 *   export const batchService = { ...crud(TABLES.batches), close };
 */
export function crud(collection, { defaultSort = 'created_at', select = '*' } = {}) {
  const projection = projectionFor(select);
  const notFound = (id) => ApiError.notFound(collection + ' ' + id + ' not found');

  return {
    table: collection,
    model: () => model(collection),

    async list(query = {}, filters = {}) {
      const { from, sort, ascending, page, limit } = parsePagination(query);
      const Model = model(collection);
      const criteria = where(filters);
      try {
        const [rows, total] = await Promise.all([
          Model.find(criteria, projection)
            .sort({ [sort || defaultSort]: ascending ? 1 : -1 })
            .skip(from)
            .limit(limit)
            .lean(),
          Model.countDocuments(criteria),
        ]);
        return { rows: rows.map(serialize), total, page, limit };
      } catch (err) {
        throw wrapError(err);
      }
    },

    /**
     * Every matching row, ignoring page/limit. The reports aggregate over
     * thousands of runs, and going through list() would silently cap them at
     * the 200-row pagination ceiling.
     */
    async all(filters = {}, { sort = defaultSort, ascending = false } = {}) {
      try {
        const rows = await model(collection)
          .find(where(filters), projection)
          .sort({ [sort]: ascending ? 1 : -1 })
          .lean();
        return rows.map(serialize);
      } catch (err) {
        throw wrapError(err);
      }
    },

    async findById(id) {
      let row;
      try {
        row = await model(collection).findById(id, projection).lean();
      } catch (err) {
        throw wrapError(err);
      }
      if (!row) throw notFound(id);
      return serialize(row);
    },

    async create(payload) {
      try {
        const doc = await model(collection).create(toDoc(payload));
        return pick(serialize(doc.toObject()), select);
      } catch (err) {
        throw wrapError(err);
      }
    },

    async update(id, patch) {
      let row;
      try {
        row = await model(collection)
          .findByIdAndUpdate(id, { $set: toPatch(patch) }, {
            new: true,
            runValidators: true,
            projection,
          })
          .lean();
      } catch (err) {
        throw wrapError(err);
      }
      if (!row) throw notFound(id);
      return serialize(row);
    },

    /**
     * Idempotent bulk write used by the offline sync endpoints. `onConflict` is
     * the comma-separated key the rows are matched on ('id', 'customer,grade').
     */
    async upsertMany(rows, onConflict = 'id') {
      if (!rows?.length) return [];
      const Model = model(collection);
      const keys = String(onConflict).split(',').map((s) => s.trim()).filter(Boolean);
      const filters = [];

      const ops = rows.map((raw) => {
        const { _id, ...doc } = toDoc(raw);
        const filter = {};
        for (const key of keys) {
          const path = key === 'id' ? '_id' : key;
          const value = path === '_id' ? _id : doc[path];
          if (value !== undefined && value !== null) filter[path] = value;
        }
        // Nothing to match on - fall back to a brand new row.
        if (!Object.keys(filter).length) filter._id = _id ?? newId();
        filters.push(filter);

        const update = { $set: doc };
        if (filter._id === undefined) update.$setOnInsert = { _id: _id ?? newId() };
        return { updateOne: { filter, update, upsert: true } };
      });

      try {
        await Model.bulkWrite(ops, { ordered: false });
        const saved = await Model.find({ $or: filters }, projection).lean();
        return saved.map(serialize);
      } catch (err) {
        throw wrapError(err);
      }
    },

    async remove(id) {
      try {
        await model(collection).findByIdAndDelete(id).lean();
      } catch (err) {
        throw wrapError(err);
      }
      return { id };
    },
  };
}

export default crud;
