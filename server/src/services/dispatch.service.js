import { crud } from './base.service.js';
import { absentSchema } from '../config/supabase.js';
import { TABLES } from '../config/constants.js';
import { rateService } from './rate.service.js';

const base = crud(TABLES.dispatches, { defaultSort: 'dispatched_at' });
const loads = crud(TABLES.dispatchLoads, { defaultSort: 'created_at' });

/**
 * Supabase named these columns after the weighbridge slip - `customer_name`,
 * `quality`, `weight_kg`, `dispatched_at` - while the client models and the
 * costing report were written against customer/grade/total_kg/dispatch_date.
 * Rows are translated on the way out and payloads on the way in, so the table
 * keeps its own names and neither side has to learn the other's.
 */
export const fromRow = (row) =>
  row && {
    ...row,
    customer: row.customer_name ?? null,
    grade: row.quality ?? null,
    total_kg: Number(row.weight_kg || 0),
    dispatch_date: row.dispatched_at ? String(row.dispatched_at).slice(0, 10) : null,
    vehicle: row.vehicle_no ?? null,
  };

const toRow = (payload = {}) => {
  const { customer, grade, total_kg: totalKg, dispatch_date: date, vehicle, ...rest } = payload;
  return {
    ...rest,
    ...(customer !== undefined ? { customer_name: customer } : {}),
    ...(grade !== undefined ? { quality: grade } : {}),
    ...(totalKg !== undefined ? { weight_kg: totalKg } : {}),
    ...(date !== undefined ? { dispatched_at: date } : {}),
    ...(vehicle !== undefined ? { vehicle_no: vehicle } : {}),
  };
};

/**
 * Money is never stored on a dispatch - it is the customer's rate for that
 * grade times the weight, priced at read time so a rate correction reprices
 * the history instead of leaving stale totals behind.
 */
const priced = (raw, card, kg) => {
  const row = fromRow(raw);
  if (!row) return row;
  const weight = kg ?? row.total_kg;
  const { rate, note } = rateService.rateFor(row.customer, row.grade, card.table, card.list);
  return {
    ...row,
    total_kg: weight,
    rate,
    rate_note: note || null,
    amount: rate != null ? +(weight * rate).toFixed(2) : null,
  };
};

export const dispatchService = {
  ...base,
  loads,

  async list(query = {}, filters = {}) {
    const [result, card] = await Promise.all([
      base.list({ order: 'desc', ...query }, toRow(filters)),
      rateService.card(),
    ]);
    return { ...result, rows: result.rows.map((row) => priced(row, card)) };
  },

  async findById(id) {
    return fromRow(await base.findById(id));
  },

  create: (payload) => base.create(toRow(payload)).then(fromRow),

  update: (id, patch) => base.update(id, toRow(patch)).then(fromRow),

  /** Dispatch header plus its weighed loads and the priced total. */
  async detail(id) {
    const [dispatch, card] = await Promise.all([base.findById(id), rateService.card()]);
    const { rows } = await loads.list({ limit: 200, order: 'asc' }, { dispatch_id: id });
    // A dispatch with weighed loads is priced off them; one entered straight
    // from the shop floor carries its own weight instead.
    const kg = rows.length
      ? rows.reduce((sum, l) => sum + Number(l.net_kg || 0), 0)
      : Number(dispatch.weight_kg || 0);
    return { ...priced(dispatch, card, kg), loads: rows };
  },

  /**
   * How many sacks have already gone out against each of the given packed runs,
   * keyed by run id - what the Dispatch tab's packed stock is drawn down by.
   *
   * A project that has not run supabase/schema.sql has no `run_id` to tie a load
   * back with, so nothing can be said to have left: it answers empty rather than
   * failing the read, and every packed sack reads as still in the yard.
   */
  async sacksByRun(runIds = []) {
    const ids = [...new Set(runIds.filter(Boolean))];
    if (!ids.length) return {};
    if ((absentSchema()[TABLES.dispatches] ?? []).includes('run_id')) return {};

    const rows = await base.all({ run_id: ids }, { sort: 'dispatched_at' });
    return rows.reduce((totals, row) => {
      totals[row.run_id] = (totals[row.run_id] ?? 0) + Number(row.sacks || 0);
      return totals;
    }, {});
  },

  async addLoad(dispatchId, payload) {
    const net = Number(payload.grossKg || 0) - Number(payload.tareKg || 0);
    return loads.create({
      dispatch_id: dispatchId,
      vehicle_no: payload.vehicle ?? payload.vehicleNo ?? null,
      driver: payload.driver ?? null,
      gross_kg: payload.grossKg ?? null,
      tare_kg: payload.tareKg ?? null,
      net_kg: payload.netKg ?? (net > 0 ? net : null),
      bags: payload.bags ?? null,
    });
  },

  removeLoad: (loadId) => loads.remove(loadId),
};

export default dispatchService;
