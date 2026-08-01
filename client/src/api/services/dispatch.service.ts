import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { DispatchDoc, DispatchSummary } from '@/types/models';

export interface DispatchLinePayload {
  stock_group_id: string;
  quality?: string | null;
  sacks: number;
  unit_price: number;
}

export interface DispatchPayload {
  customer_id: string;
  dispatch_date: string;
  transport_provided: boolean;
  transport_charge: number;
  remarks?: string | null;
  lines: DispatchLinePayload[];
}

/**
 * A dispatch is posted once. There is no update here and no PATCH route behind
 * one: a load that went out wrong is corrected by a reversal document and a
 * fresh dispatch, so the ledger keeps what happened - and the stock behind it
 * stays something that only ever moved forward.
 *
 * A 409 from create() means the yard moved under the form: another vehicle took
 * the sacks first, or the group has not passed QC. The message names the group,
 * and `errors[0].label` is what the form puts it against.
 */
export const dispatchService = {
  /**
   * What has gone out lately, newest first. A header list - the lines are
   * fetched by tapping one - so this stays cheap enough to sit at the top of a
   * screen the crew opens all day.
   */
  recent: (params?: ListQuery) => requestPaged<DispatchSummary>(endpoints.dispatch.root, params),

  async create(payload: DispatchPayload): Promise<DispatchDoc> {
    const res = await axiosClient.post<ApiEnvelope<DispatchDoc>>(endpoints.dispatch.root, payload);
    return res.data.data;
  },

  async getOne(id: string): Promise<DispatchDoc> {
    const res = await axiosClient.get<ApiEnvelope<DispatchDoc>>(endpoints.dispatch.byId(id));
    return res.data.data;
  },
};

export default dispatchService;
