import { crud } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { rateService } from './rate.service.js';

const base = crud(TABLES.dispatches, { defaultSort: 'dispatch_date' });
const loads = crud(TABLES.dispatchLoads, { defaultSort: 'created_at' });

export const dispatchService = {
  ...base,
  loads,

  /** Dispatch header plus its weighed loads and the priced total. */
  async detail(id) {
    const dispatch = await base.findById(id);
    const { rows } = await loads.list({ limit: 200, order: 'asc' }, { dispatch_id: id });
    const kg = rows.reduce((sum, l) => sum + Number(l.net_kg || 0), 0);
    const { rate } = rateService.rateFor(dispatch.customer, dispatch.grade);
    return { ...dispatch, loads: rows, total_kg: kg, rate, amount: rate ? +(kg * rate).toFixed(2) : null };
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
