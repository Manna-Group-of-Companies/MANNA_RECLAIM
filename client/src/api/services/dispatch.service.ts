import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Dispatch, DispatchLoad } from '@/types/models';

export const dispatchService = {
  list: (params?: ListQuery) => requestPaged<Dispatch>(endpoints.dispatch.root, params),

  async getOne(id: string): Promise<Dispatch> {
    const res = await axiosClient.get<ApiEnvelope<Dispatch>>(endpoints.dispatch.byId(id));
    return res.data.data;
  },

  async create(payload: Partial<Dispatch>): Promise<Dispatch> {
    const res = await axiosClient.post<ApiEnvelope<Dispatch>>(endpoints.dispatch.root, payload);
    return res.data.data;
  },

  async update(id: string, patch: Partial<Dispatch>): Promise<Dispatch> {
    const res = await axiosClient.patch<ApiEnvelope<Dispatch>>(endpoints.dispatch.byId(id), patch);
    return res.data.data;
  },

  async addLoad(id: string, payload: Partial<DispatchLoad> & { grossKg?: number; tareKg?: number }): Promise<DispatchLoad> {
    const res = await axiosClient.post<ApiEnvelope<DispatchLoad>>(endpoints.dispatch.loads(id), payload);
    return res.data.data;
  },

  removeLoad: (id: string, loadId: string) => axiosClient.delete(endpoints.dispatch.load(id, loadId)),
};

export default dispatchService;
