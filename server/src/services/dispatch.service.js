import { crud } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { rateService } from './rate.service.js';

const base = crud(TABLES.dispatches, { defaultSort: 'dispatch_date' });
const loads = crud(TABLES.dispatchLoads, { defaultSort: 'created_at' });

/**
 * Money is never stored on a dispatch - it is the customer's rate for that
 * grade times the weight, priced at read time so a rate correction reprices
 * the history instead of leaving stale totals behind.
 */
const priced = (row, card, kg = Number(row?.total_kg || 0)) => {
  if (!row) return row;
  const { rate, note } = rateService.rateFor(row.customer, row.grade, card.table, card.list);
  return {
    ...row,
    total_kg: kg,
    rate,
    rate_note: note || null,
    amount: rate != null ? +(kg * rate).toFixed(2) : null,
  };
};

export const dispatchService = {
  ...base,
  loads,

  async list(query = {}, filters = {}) {
    const [result, card] = await Promise.all([
      base.list({ order: 'desc', ...query }, filters),
      rateService.card(),
    ]);
    return { ...result, rows: result.rows.map((row) => priced(row, card)) };
  },

  /** Dispatch header plus its weighed loads and the priced total. */
  async detail(id) {
    const [dispatch, card] = await Promise.all([base.findById(id), rateService.card()]);
    const { rows } = await loads.list({ limit: 200, order: 'asc' }, { dispatch_id: id });
    // A dispatch with weighed loads is priced off them; one entered straight
    // from the shop floor carries its own total_kg instead.
    const kg = rows.length
      ? rows.reduce((sum, l) => sum + Number(l.net_kg || 0), 0)
      : Number(dispatch.total_kg || 0);
    return { ...priced(dispatch, card, kg), loads: rows };
  },

  async addLoad(dispatchId, payload) {
    const net = Number(payload.grossKg || 0) - Number(payload.tareKg || 0);
    return loads.create({
      dispatch_id: dispatchId,
      vehicle: payload.vehicle ?? null,
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
