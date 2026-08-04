import { crud } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { DEV_PRODUCTS } from '../config/devSeed.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * What the moulding presses mould.
 *
 * The curing settings belong here rather than on the machine: the same press
 * moulds Loop today and Sleve tomorrow, and neither the temperature nor the
 * cycle time is the press's to change. A press run copies all four figures as it
 * starts, which is also what keeps a run costed at the rate that applied when it
 * was moulded - see run.service's pressFields().
 *
 * Every figure may be null. Nobody has measured them into this system yet, and a
 * placeholder compound rate would quietly cost every press run wrong, so the
 * press sheets read "not set" until the back office fills them in.
 */
const base = crud(TABLES.products, { defaultSort: 'sort_order' });

/**
 * Whether this project has a `products` table at all - probed once, then
 * remembered. A project that ran an earlier supabase/schema.sql has the machines
 * but not this, and refusing to open the press sheet until someone runs the new
 * SQL would leave the presses unusable; the seeded pair stands in until then.
 */
let tablePresent = null;

async function usingFallback() {
  if (tablePresent !== null) return !tablePresent;
  try {
    await base.list({ limit: 1 });
    tablePresent = true;
  } catch {
    tablePresent = false;
    logger.warn(
      'Supabase: no `products` table - serving the seeded press products read-only. ' +
        'Run supabase/fix-missing-columns.sql to keep them.',
    );
  }
  return !tablePresent;
}

const fallbackRows = () => DEV_PRODUCTS.map((row) => ({ ...row }));

/**
 * The screens send the field names the API is written in; the table keeps the
 * columns. Only what was actually sent is mapped, so a patch that names one
 * field leaves the rest of the product alone - and an explicit null clears a
 * figure rather than being read as "not sent".
 */
const FIELD_COLUMNS = {
  name: 'name',
  cureTempC: 'cure_temp_c',
  cyclicMin: 'cyclic_min',
  cavities: 'cavities',
  compoundRate: 'compound_rate',
  note: 'note',
  active: 'active',
  sortOrder: 'sort_order',
  // What it is ordered as, ships as, comes off, and costs to make.
  code: 'code',
  quality: 'quality',
  packSizeKg: 'pack_size_kg',
  /*
   * What a moulded product ships in, and what one of it weighs.
   *
   * `packSizeKg` above is the other thing entirely - what a sack of a reclaim
   * grade weighs - and the two are easy to confuse from the names alone. A
   * moulded product is not sold by weight: it is sold by the piece, boxed some
   * number at a time, so `packSize` is a count of pieces.
   *
   * `pieceKg` is what the yard puts a weight against moulded stock with, and
   * what the loading gang's kg comes from on a moulded load. Unset, the stock
   * page reports no weight rather than a fabricated one.
   */
  packSize: 'pack_size',
  packLabel: 'pack_label',
  pieceKg: 'piece_kg',
  /*
   * Whether it is moulded at all. Cavities and a cycle time are facts about a
   * mould, so the sleeve and loop run sheets ask for neither where this is off -
   * see run.service's mouldingFields().
   */
  moulded: 'moulded',
  machineId: 'machine_id',
  rawMaterialCost: 'raw_material_cost',
  firewoodCost: 'firewood_cost',
  powerKwh: 'power_kwh',
  labourCost: 'labour_cost',
  machineHours: 'machine_hours',
};

function toColumns(payload = {}) {
  const row = {};
  for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
    if (payload[field] !== undefined) row[column] = payload[field];
    else if (payload[column] !== undefined) row[column] = payload[column];
  }
  return row;
}

/** A product cannot be edited into the project until the table is there. */
const noTable = () =>
  ApiError.unavailable(
    'The product list cannot be edited yet - run supabase/fix-missing-columns.sql to create it.',
  );

export const productService = {
  ...base,

  async list(query = {}, filters = {}) {
    if (await usingFallback()) {
      const rows = fallbackRows().filter(
        (p) => filters.active === undefined || Boolean(p.active) === Boolean(filters.active),
      );
      return { rows, total: rows.length, page: 1, limit: rows.length };
    }
    return base.list({ order: 'asc', limit: 100, ...query }, filters);
  },

  /** What a press start sheet offers: the products still in use, in order. */
  listActive: (query = {}) => productService.list(query, { active: true }),

  async findById(id) {
    if (await usingFallback()) {
      const found = fallbackRows().find((p) => p.id === id);
      if (!found) throw ApiError.notFound('Product ' + id + ' not found');
      return found;
    }
    return base.findById(id);
  },

  async create(payload = {}) {
    if (await usingFallback()) throw noTable();
    const name = String(payload.name ?? '').trim();
    if (!name) throw ApiError.badRequest('A product name is required');
    // The id is the name in the shape an id can be: short, upper case and
    // stable, so a press run reads as PRS_P3 -> LOOP rather than to a uuid.
    const id = String(payload.id ?? name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!id) throw ApiError.badRequest('A product name is required');
    if (await base.exists({ id })) throw ApiError.conflict(name + ' is already on the product list');
    return base.create({ ...toColumns(payload), id, name, active: payload.active ?? true });
  },

  async update(id, patch = {}) {
    if (await usingFallback()) throw noTable();
    const row = toColumns(patch);
    if (!Object.keys(row).length) throw ApiError.badRequest('Nothing to change');
    return base.update(id, { ...row, updated_at: new Date().toISOString() });
  },

  /**
   * Taken off the list rather than deleted. A product a press has already
   * moulded against is named on those runs, and removing the row would leave
   * their costing pointing at nothing.
   */
  async retire(id) {
    if (await usingFallback()) throw noTable();
    return base.update(id, { active: false });
  },
};

export default productService;
