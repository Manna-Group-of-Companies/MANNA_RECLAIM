import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { DispatchGrade, Rate } from '@/types/models';

export interface Quote { rate: number | null; custom: boolean; note: string }

export const rateService = {
  list: (params?: ListQuery) => requestPaged<Rate>(endpoints.rates.root, params),
  customers: (params?: ListQuery) =>
    requestPaged<{ id: string; name: string }>(endpoints.rates.customers, params),

  async priceList(): Promise<Record<string, number>> {
    const res = await axiosClient.get<ApiEnvelope<Record<string, number>>>(endpoints.rates.priceList);
    return res.data.data;
  },

  async quote(customer: string, grade: DispatchGrade): Promise<Quote> {
    const res = await axiosClient.get<ApiEnvelope<Quote>>(endpoints.rates.quote, {
      params: { customer, grade },
    });
    return res.data.data;
  },

  async save(payload: Rate): Promise<Rate> {
    const res = await axiosClient.put<ApiEnvelope<Rate>>(endpoints.rates.root, payload);
    return res.data.data;
  },
};

export default rateService;
