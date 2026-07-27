import { crud } from './base.service.js';
import { TABLES, PRICE_LIST } from '../config/constants.js';

const customers = crud(TABLES.customers, { defaultSort: 'name' });
const rates = crud(TABLES.rates, { defaultSort: 'customer' });

/** Rate card loaded once per process and refreshed on write. */
let cache = null;

async function load() {
  if (cache) return cache;
  const { rows } = await rates.list({ limit: 500, order: 'asc' });
  cache = rows.reduce((acc, r) => {
    (acc[r.customer] ||= {})[r.grade] = { rate: Number(r.rate), note: r.note || '' };
    return acc;
  }, {});
  return cache;
}

export const rateService = {
  customers,
  rates,
  priceList: PRICE_LIST,

  invalidate: () => { cache = null; },

  listRates: async (query = {}) => rates.list(query),

  async upsertRate(payload) {
    const row = await rates.upsertMany([payload], 'customer,grade');
    rateService.invalidate();
    return row[0] ?? null;
  },

  /** Negotiated customer rate when present, otherwise the standard list rate. */
  rateFor(customer, grade, table = cache) {
    const negotiated = table?.[customer]?.[grade];
    if (negotiated) return { rate: negotiated.rate, custom: true, note: negotiated.note };
    if (PRICE_LIST[grade] != null) return { rate: PRICE_LIST[grade], custom: false, note: '' };
    return { rate: null, custom: false, note: '' };
  },

  async rateForAsync(customer, grade) {
    return rateService.rateFor(customer, grade, await load());
  },
};

export default rateService;
