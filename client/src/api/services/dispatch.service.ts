import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type {
  DispatchDoc,
  DispatchSummary,
  LoadingMaterial,
  LoadingMode,
  StockUnit,
} from '@/types/models';

/**
 * One line: which stock, and how much of it.
 *
 * `qty` is the count in the group's own unit - sacks of a reclaim grade, pieces
 * of a moulded product. `sacks` is the older name for the same field and is
 * still accepted by the API so an unrebuilt client keeps posting; one of the two
 * has to be sent.
 *
 * `unit` is advisory in both directions. The server writes the group's own unit
 * onto the line whatever arrives, and refuses a document that named a different
 * one rather than repricing it - a form that thinks it is buying sacks of
 * something sold by the piece has a price on it that means nothing.
 */
export interface DispatchLinePayload {
  stock_group_id: string;
  quality?: string | null;
  qty?: number;
  sacks?: number;
  unit?: StockUnit;
}

/**
 * The loading job, as the form sends it.
 *
 * Neither rate is here. Both are read from the settings on the server and
 * snapshotted onto the entry, so a client cannot post a job at a rate of its
 * own and a later revision cannot reprice a job already done.
 *
 * `loading_mode` is a hint rather than a decision. The server derives what the
 * entry is actually stored as from what was entered - day labour on a contract
 * load makes it `mixed` whatever this says - because the rule is that every
 * day-labour worker's time is accounted in man-hours, and a rule that depends
 * on a dropdown being right is not a rule.
 */
export interface LoadingPayload {
  loading_mode?: LoadingMode;
  material_kind?: LoadingMaterial;
  /** Defaults to the sacks on the document at 50 kg a sack. */
  kg_loaded?: number | null;
  manhour_labourers?: number;
  manhour_hours?: number;
  vehicle_no?: string | null;
  remarks?: string | null;
}

export interface DispatchPayload {
  customer_id: string;
  dispatch_date: string;
  transport_provided: boolean;
  transport_charge: number;
  remarks?: string | null;
  lines: DispatchLinePayload[];
  /**
   * The rate given to the customer, one figure per quality on the document.
   * The price is agreed per quality, not per pallet, so two lines off two
   * batches of the same grade cannot go out at two different figures. Every
   * quality being dispatched has to appear here or the API answers 422.
   *
   * Per unit of that quality: rupees a sack for a reclaim grade, rupees a piece
   * for a moulded product - which is why a product's id is a legitimate key here
   * beside the grades.
   */
  prices: Record<string, number>;
  loading?: LoadingPayload | null;
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
