import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { QcStatus, StockGroup, StockSummaryRow } from '@/types/models';

/**
 * The yard, from whichever side the account is on.
 *
 * `list` is the manager's - every group with what was packed into it, what has
 * gone out and what is left. `summary` is the supervisor's, and is a genuinely
 * different response: four fields, built by their own serializer on the server.
 * They are separate calls here for the same reason they are separate serializers
 * there - so nothing can reach for the fuller one by habit.
 */
export const stockService = {
  list: (params?: ListQuery) => requestPaged<StockGroup>(endpoints.stock.root, params),

  summary: (params?: ListQuery) => requestPaged<StockSummaryRow>(endpoints.stock.summary, params),

  async setQcStatus(id: string, qcStatus: QcStatus): Promise<StockGroup> {
    const res = await axiosClient.patch<ApiEnvelope<StockGroup>>(endpoints.stock.qc(id), {
      qc_status: qcStatus,
    });
    return res.data.data;
  },
};

export default stockService;
