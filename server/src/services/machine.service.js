import { crud } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { DEV_MACHINES, devSeedActive } from '../config/devSeed.js';

const base = crud(TABLES.machines, { defaultSort: 'sort_order' });

const groupBy = (rows) =>
  rows.reduce((acc, m) => {
    const key = m.group_name || 'Other';
    (acc[key] ||= []).push(m);
    return acc;
  }, {});

export const machineService = {
  ...base,

  async list(query = {}, filters = {}) {
    if (await devSeedActive()) {
      const rows = DEV_MACHINES.filter(
        (m) => (!filters.kind || m.kind === filters.kind) && m.enabled !== false,
      );
      return { rows, total: rows.length, page: 1, limit: rows.length };
    }
    return base.list(query, filters);
  },

  async findById(id) {
    if (await devSeedActive()) {
      const machine = DEV_MACHINES.find((m) => m.id === id);
      if (!machine) throw ApiError.notFound('Machine ' + id + ' not found');
      return machine;
    }
    return base.findById(id);
  },

  /** The shop-floor screen lists live machines only - the admin side owns `enabled`. */
  async listByGroup(query = {}) {
    const { rows, total, page, limit } = await machineService.list(
      { ...query, limit: 200, order: 'asc' },
      { enabled: true },
    );
    return { rows, groups: groupBy(rows), total, page, limit };
  },

  setEnabled: (id, enabled) => base.update(id, { enabled }),
};

export default machineService;
