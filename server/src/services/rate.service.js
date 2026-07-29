import { crud } from './base.service.js';
import { TABLES, PRICE_LIST, COST_RATE_KEYS } from '../config/constants.js';

/**
 * Two different things were both called "rates" in the prototype:
 *
 *   customer_rates  the negotiated per-kg selling price per customer + grade
 *   price_list      the standard per-kg selling price per grade
 *   rates           a single row of plant input costs (electricity, labour...)
 *
 * The rate card is the first two. The third is what costing runs on, so it is
 * exposed separately as `plantRates` rather than being mixed into the card.
 */

const customers = crud(TABLES.customers, { defaultSort: 'name' });
const rates = crud(TABLES.customerRates, { defaultSort: 'customer' });
const priceRows = crud(TABLES.priceList, { defaultSort: 'grade' });
const plantRates = crud(TABLES.rates, { defaultSort: 'id' });
const costRates = crud(TABLES.costRates, { defaultSort: 'id' });

/**
 * The cost inputs live as one row, id 'current', with every figure inside a
 * `data` object - the shape back.html wrote and the migration carried over.
 * Keeping it means the back office and the old prototype read the same row.
 */
const COST_RATES_ID = 'current';

/** Rate card and list price, loaded once per process and refreshed on write. */
let cache = null;
let listCache = null;

async function load() {
  if (cache) return cache;
  const rows = await rates.all({}, { sort: 'customer', ascending: true });
  cache = rows.reduce((acc, r) => {
    (acc[r.customer] ||= {})[r.grade] = { rate: Number(r.rate), note: r.note || '' };
    return acc;
  }, {});
  return cache;
}

/** The price_list collection, falling back to the compiled-in constant. */
async function loadPriceList() {
  if (listCache) return listCache;
  const rows = await priceRows.all({}, { sort: 'grade', ascending: true });
  listCache = rows.length
    ? rows.reduce((acc, r) => {
        acc[r.grade] = Number(r.rate);
        return acc;
      }, {})
    : { ...PRICE_LIST };
  return listCache;
}

export const rateService = {
  customers,
  rates,
  plantRates,

  invalidate: () => {
    cache = null;
    listCache = null;
  },

  listRates: (query = {}) => rates.list({ order: 'asc', ...query }),

  priceList: () => loadPriceList(),

  /** The plant's input cost rates - one row, id 1. */
  async inputCosts() {
    const { rows } = await plantRates.list({ limit: 1 });
    return rows[0] ?? null;
  },

  /**
   * The Rates tab's figures. Every declared key comes back, missing ones as
   * null rather than absent, so the form can render before anyone has ever
   * saved and a newly added rate does not read as zero.
   */
  async costRates() {
    const { rows } = await costRates.list({ limit: 1 }, { id: COST_RATES_ID });
    const stored = rows[0]?.data ?? {};
    const data = Object.fromEntries(COST_RATE_KEYS.map((k) => [k, stored[k] ?? null]));
    return { data, updatedAt: rows[0]?.updated_at ?? null, updatedBy: rows[0]?.updated_by ?? null };
  },

  /** Replaces the whole set. Unknown keys are dropped rather than stored. */
  async saveCostRates(data = {}, updatedBy = null) {
    const clean = {};
    for (const key of COST_RATE_KEYS) {
      const value = data[key];
      if (value == null || value === '') continue;
      const n = Number(value);
      if (!Number.isNaN(n)) clean[key] = n;
    }
    await costRates.upsertMany([
      { id: COST_RATES_ID, data: clean, updated_at: new Date().toISOString(), updated_by: updatedBy },
    ]);
    return rateService.costRates();
  },

  async upsertRate(payload) {
    const row = await rates.upsertMany([payload], 'customer,grade');
    rateService.invalidate();
    return row[0] ?? null;
  },

  /** Negotiated customer rate when present, otherwise the standard list rate. */
  rateFor(customer, grade, table, list = PRICE_LIST) {
    const negotiated = table?.[customer]?.[grade];
    if (negotiated) return { rate: negotiated.rate, custom: true, note: negotiated.note };
    if (list?.[grade] != null) return { rate: list[grade], custom: false, note: '' };
    return { rate: null, custom: false, note: '' };
  },

  async rateForAsync(customer, grade) {
    const { table, list } = await rateService.card();
    return rateService.rateFor(customer, grade, table, list);
  },

  /**
   * Both halves of the rate card in one await, for callers pricing a whole
   * list - going through rateForAsync per row would re-await the same two
   * caches once per dispatch.
   */
  async card() {
    const [table, list] = await Promise.all([load(), loadPriceList()]);
    return { table, list };
  },
};

export default rateService;
