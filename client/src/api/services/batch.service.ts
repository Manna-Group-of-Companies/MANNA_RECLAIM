import { axiosClient, drainPaged, requestPaged } from '../axiosClient';
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

  /**
   * Every batch charged on or after `from`, newest first - open and closed,
   * every line. `from` of null is the whole record.
   *
   * The back office's lab record reads this rather than listOpen. A batch closes
   * once its grades are weighed and listOpen also drops anything off the special
   * line, so a charge that was produced, closed and never tested - or any coarse
   * charge at all - was on no screen the office could find it from. Whether a
   * batch was tested has nothing to do with whether it is still open, which is
   * what made the open-only read the wrong question to build this on.
   *
   * The floor keeps listOpen: a bench works the batches that are still open, and
   * its tab badge counts those. See fetchPendingQuality.
   */
  listSince: (from: string | null) =>
    drainPaged<Batch>(endpoints.batches.root, {
      since: from,
      dateOf: (b) => b.opened_at ?? b.shift_date,
    }),

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
