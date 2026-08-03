import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type {
  MouldedStock,
  QcStatus,
  StockGroup,
  StockPool,
  StockSummaryRow,
} from '@/types/models';

/**
 * The yard, from whichever side the account is on.
 *
 * `list` is the manager's - every group with what was packed into it, what has
 * gone out, what is left and who signed its verdict off. `summary` is the
 * supervisor's, and is a genuinely different response built by its own
 * serializer on the server: the physical facts about the goods and none of the
 * commercial ones. They are separate calls here for the same reason they are
 * separate serializers there - so nothing can reach for the fuller one by habit.
 *
 * Both list everything in every QC state. Nothing is filtered out for being
 * unsellable: a group the lab failed is still stock standing in the yard, and a
 * read that dropped it would answer "what can I sell" while being asked "what
 * is here".
 */
export const stockService = {
  list: (params?: ListQuery) => requestPaged<StockGroup>(endpoints.stock.root, params),

  summary: (params?: ListQuery) => requestPaged<StockSummaryRow>(endpoints.stock.summary, params),

  /**
   * The coarse pools with their three sample points. Carries stock and readings
   * and nothing commercial, which is what lets the lab read it - the bench
   * tests the period rather than a lot, so it has to see which periods exist.
   */
  pools: (params?: ListQuery) => requestPaged<StockPool>(endpoints.stock.pools, params),

  /**
   * What the presses have made, by product and pack, with where each stands
   * with the lab. Carries stock and verdicts and nothing commercial, which is
   * what lets the bench read it - and it has to, because a moulded group is on
   * neither the batch card nor the pool list.
   */
  moulded: (params?: ListQuery) => requestPaged<MouldedStock>(endpoints.stock.moulded, params),

  async setQcStatus(id: string, qcStatus: QcStatus): Promise<StockGroup> {
    const res = await axiosClient.patch<ApiEnvelope<StockGroup>>(endpoints.stock.qc(id), {
      qc_status: qcStatus,
    });
    return res.data.data;
  },
};

export default stockService;
