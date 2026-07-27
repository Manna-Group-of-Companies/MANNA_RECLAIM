import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Batch, QualityTest } from '@/types/models';

export const batchService = {
  list: (params?: ListQuery) => requestPaged<Batch>(endpoints.batches.root, params),
  listOpen: (params?: ListQuery) => requestPaged<Batch>(endpoints.batches.open, params),

  async getOne(id: string): Promise<Batch & { qualityTests: QualityTest[] }> {
    const res = await axiosClient.get<ApiEnvelope<Batch & { qualityTests: QualityTest[] }>>(
      endpoints.batches.byId(id),
    );
    return res.data.data;
  },

  async create(payload: Partial<Batch>): Promise<Batch> {
    const res = await axiosClient.post<ApiEnvelope<Batch>>(endpoints.batches.root, payload);
    return res.data.data;
  },

  async update(id: string, patch: Partial<Batch>): Promise<Batch> {
    const res = await axiosClient.patch<ApiEnvelope<Batch>>(endpoints.batches.byId(id), patch);
    return res.data.data;
  },

  async close(id: string, remarks?: string): Promise<Batch> {
    const res = await axiosClient.post<ApiEnvelope<Batch>>(endpoints.batches.close(id), { remarks });
    return res.data.data;
  },
};

export default batchService;
