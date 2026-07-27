import { crud } from './base.service.js';
import { TABLES } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';

const base = crud(TABLES.batches, { defaultSort: 'opened_at' });

export const batchService = {
  ...base,

  listOpen: (query = {}) => base.list({ ...query, order: 'asc' }, { status: 'open' }),

  /** A batch closes once every stage has a recorded verdict. */
  async close(id, { closedBy, remarks }) {
    const batch = await base.findById(id);
    if (batch.status === 'closed') throw ApiError.conflict('Batch is already closed');
    return base.update(id, {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
      remarks: remarks ?? batch.remarks,
    });
  },

  reopen: (id) => base.update(id, { status: 'open', closed_at: null, closed_by: null }),
};

export default batchService;
