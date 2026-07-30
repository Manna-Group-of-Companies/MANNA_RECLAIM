import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Batch, BatchDetail, Quality } from '@/types/models';

/** What deleting an orphaned batch took with it. */
export interface BatchDeleted {
  id: string;
  ref: string;
  runs: number;
  qualityTests: number;
}

export const batchService = {
  /** Every batch, closed ones included - what dispatch and history read. */
  list: (params?: ListQuery) => requestPaged<Batch>(endpoints.batches.root, params),
  /** Open batches only: the batch list and every refiner picker on the floor. */
  listOpen: (params?: ListQuery) => requestPaged<Batch>(endpoints.batches.open, params),

  async getOne(id: string): Promise<BatchDetail> {
    const res = await axiosClient.get<ApiEnvelope<BatchDetail>>(endpoints.batches.byId(id));
    return res.data.data;
  },

  /** Only ever called by the autoclave load sheet - the server checks that. */
  async create(payload: Partial<Batch>): Promise<Batch> {
    const res = await axiosClient.post<ApiEnvelope<Batch>>(endpoints.batches.root, payload);
    return res.data.data;
  },

  async update(id: string, patch: Partial<Batch>): Promise<Batch> {
    const res = await axiosClient.patch<ApiEnvelope<Batch>>(endpoints.batches.byId(id), patch);
    return res.data.data;
  },

  /** Ticks a grade the batch will yield, or takes one back off. */
  async setQuality(id: string, quality: Quality, marked: boolean): Promise<Batch> {
    const res = await axiosClient.post<ApiEnvelope<Batch>>(endpoints.batches.qualities(id), {
      quality,
      marked,
    });
    return res.data.data;
  },

  async close(id: string, remarks?: string): Promise<Batch> {
    const res = await axiosClient.post<ApiEnvelope<Batch>>(endpoints.batches.close(id), { remarks });
    return res.data.data;
  },

  /** Orphans only. Takes the batch's quality tests with it. */
  async remove(id: string): Promise<BatchDeleted> {
    const res = await axiosClient.delete<ApiEnvelope<BatchDeleted>>(endpoints.batches.byId(id));
    return res.data.data;
  },
};

export default batchService;
