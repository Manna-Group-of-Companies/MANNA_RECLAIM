import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery, PageMeta } from '@/types/api';
import type { Customer, DispatchDoc } from '@/types/models';

export interface CustomerPayload {
  name?: string;
  phone?: string | null;
  address?: string | null;
  region?: string | null;
  active?: boolean;
}

export const customerService = {
  list: (params?: ListQuery) => requestPaged<Customer>(endpoints.customers.root, params),

  search: (q: string) => requestPaged<Customer>(endpoints.customers.root, { q, limit: 50 }),

  async getOne(id: string): Promise<Customer> {
    const res = await axiosClient.get<ApiEnvelope<Customer>>(endpoints.customers.byId(id));
    return res.data.data;
  },

  async create(payload: CustomerPayload): Promise<Customer> {
    const res = await axiosClient.post<ApiEnvelope<Customer>>(endpoints.customers.root, payload);
    return res.data.data;
  },

  async update(id: string, patch: CustomerPayload): Promise<Customer> {
    const res = await axiosClient.patch<ApiEnvelope<Customer>>(endpoints.customers.byId(id), patch);
    return res.data.data;
  },

  /** What has gone out to them, each document with the lines it was made of. */
  async dispatches(id: string, params?: ListQuery) {
    const res = await axiosClient.get<ApiEnvelope<DispatchDoc[]> & { meta?: PageMeta & { customer?: Customer } }>(
      endpoints.customers.dispatches(id),
      { params },
    );
    return { rows: res.data.data ?? [], customer: res.data.meta?.customer ?? null };
  },

  /**
   * What this customer last paid per grade. A prefill for the dispatch form and
   * never a default it applies quietly - a price carried over from months ago is
   * exactly what goes out wrong and is only noticed on the invoice, so the form
   * shows the figure on every line for confirmation.
   */
  async lastPrices(id: string): Promise<Record<string, number>> {
    const res = await axiosClient.get<ApiEnvelope<Record<string, number>>>(
      endpoints.customers.lastPrices(id),
    );
    return res.data.data ?? {};
  },
};

export default customerService;
