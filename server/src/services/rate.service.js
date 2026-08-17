import { randomUUID } from 'node:crypto';
import { crud } from './base.service.js';
import {
  TABLES,
  PRICE_LIST,
  COST_RATE_KEYS,
  IDEAL_VALUE_KEYS,
  DEFAULT_SHIFT_HOURS,
} from '../config/constants.js';

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
const idealValues = crud(TABLES.idealValues, { defaultSort: 'id' });
const labourRates = crud(TABLES.labourRates, { defaultSort: 'effective_from' });

/**
 * What an hour of a labourer's time cost, on a given day.
 *
 * The plant hires by the day, so a rate may be entered either way round: a
 * per-hour figure, or a day wage over the shift it covers. Both end up here as
 * rupees per hour, because that is what every costing in the plant multiplies
 * by - the picking gang, the cracker crew, the grinders.
 */
export const perHourOf = (row) => {
  if (row == null) return null;
  const direct = Number(row.per_hour ?? row.perHour);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const wage = Number(row.daily_wage ?? row.dailyWage);
  const hours = Number(row.shift_hours ?? row.shiftHours ?? DEFAULT_SHIFT_HOURS);
  if (Number.isFinite(wage) && wage > 0 && Number.isFinite(hours) && hours > 0) {
    return Math.round((wage / hours) * 10000) / 10000;
  }
  return null;
};

/**
 * The labour rate in force on a date, out of the dated rows in hand.
 *
 * The newest row that had already come into force on the day the work was done
 * - so a rate raised this morning leaves last month exactly where it was, and a
 * run corrected in History re-prices at the rate of its own day rather than at
 * today's. That is the whole reason these rows carry a date.
 *
 * `fallback` is the undated `pickingLabourPerHour` off the Rates tab. It answers
 * for a plant that has never entered a dated rate, and for runs older than the
 * earliest one - and the costing says which of the two it used, because a figure
 * priced off a fallback is a figure somebody should come back to.
 *
 * Pure and exported: the arithmetic behind a rupee is worth being able to assert
 * on without a database in the way.
 */
export function labourRateAt(date, history = [], fallback = 0) {
  const day = String(date ?? '').slice(0, 10);
  let best = null;
  for (const row of history) {
    const from = String(row?.effective_from ?? '').slice(0, 10);
    if (!from) continue;
    // A run with no date on it cannot be placed in the history at all, so it
    // takes the newest rate rather than the oldest - the plant's rates only
    // ever move forward, and pricing an undated run at a rate from years ago
    // would understate it every time.
    if (day && from > day) continue;
    if (!best || from > String(best.effective_from).slice(0, 10)) best = row;
  }
  const rate = perHourOf(best);
  if (rate != null) {
    return { rate, source: 'dated', effectiveFrom: String(best.effective_from).slice(0, 10) };
  }
  return { rate: Number(fallback) || 0, source: 'fallback', effectiveFrom: null };
}

/**
 * The cost inputs live as one row, id 'current', with every figure inside a
 * `data` object - the shape back.html wrote and the migration carried over.
 * Keeping it means the back office and the old prototype read the same row.
 */
const COST_RATES_ID = 'current';

/** The ideal values sit the same way, in one row of their own table. */
const IDEAL_VALUES_ID = 'current';

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

  /**
   * The manager's benchmarks - what the plant should be making, per shift, per
   * line and per grade.
   *
   * Every declared key comes back, unset ones as null rather than absent, so the
   * form renders before anyone has ever saved and a newly declared benchmark
   * reads as "not set" rather than as a target of zero - which every line in the
   * plant would then be over, permanently.
   *
   * A project whose database has not had migration 0014 run against it has no
   * table to read, and that is not an error worth failing the Efficiency screen
   * over: it answers with every key unset, which is exactly where the screen was
   * before this existed. The save path does not swallow it - see below.
   */
  async idealValues() {
    const { rows } = await idealValues
      .list({ limit: 1 }, { id: IDEAL_VALUES_ID })
      .catch(() => ({ rows: [] }));
    const stored = rows[0]?.data ?? {};
    const data = Object.fromEntries(IDEAL_VALUE_KEYS.map((k) => [k, stored[k] ?? null]));
    return { data, updatedAt: rows[0]?.updated_at ?? null, updatedBy: rows[0]?.updated_by ?? null };
  },

  /**
   * Replaces the whole set. Unknown keys are dropped rather than stored, and a
   * blank clears the benchmark rather than setting it to nought.
   *
   * Deliberately not wrapped in the catch the read above has: a manager who
   * types thirty targets into a form is owed the truth about whether they were
   * saved, and a silent success on a project with no table would leave them
   * looking at figures nothing had kept.
   */
  async saveIdealValues(data = {}, updatedBy = null) {
    const clean = {};
    for (const key of IDEAL_VALUE_KEYS) {
      const value = data[key];
      if (value == null || value === '') continue;
      const n = Number(value);
      if (!Number.isNaN(n)) clean[key] = n;
    }
    await idealValues.upsertMany([
      {
        id: IDEAL_VALUES_ID,
        data: clean,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
    ]);
    return rateService.idealValues();
  },

  /**
   * Every labour rate the plant has set, newest first.
   *
   * A project whose database has not had migration 0004 run against it has no
   * table to read, and that is not an error worth failing a costing over: it
   * answers empty and the costing falls back to the undated rate on the Rates
   * tab, which is exactly where it was before this existed.
   */
  async labourRates() {
    const rows = await labourRates.all({}, { sort: 'effective_from' }).catch(() => []);
    return [...rows]
      .map((row) => ({ ...row, per_hour: perHourOf(row) }))
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
  },

  /**
   * Sets the rate in force from a date. Upserted on the date rather than
   * appended, so a manager who mistyped a rate this morning corrects it instead
   * of stacking a second one behind it and wondering which one is being used.
   */
  async saveLabourRate(payload = {}, createdBy = null) {
    const effectiveFrom = String(payload.effectiveFrom ?? '').slice(0, 10);
    const perHour = perHourOf(payload);
    const row = {
      id: randomUUID(),
      effective_from: effectiveFrom,
      per_hour: perHour,
      daily_wage: payload.dailyWage ?? null,
      shift_hours: payload.dailyWage != null ? payload.shiftHours ?? DEFAULT_SHIFT_HOURS : null,
      note: payload.note ?? null,
      created_at: new Date().toISOString(),
      created_by: createdBy,
    };
    await labourRates.upsertMany([row], 'effective_from');
    return rateService.labourRates();
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
