import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { QualityGradeSummary, QualityTest, Quality, Shift, Verdict } from '@/types/models';

export interface RecordTestPayload {
  batchNo?: string | null;
  machineId?: string | null;
  grade: Quality | string;
  verdict: Verdict;
  params?: { name: string; value: string; unit?: string }[];
  testedBy?: string | null;
  shiftDate?: string;
  shift?: Shift;
  remarks?: string | null;
}

export const qualityService = {
  list: (params?: ListQuery) => requestPaged<QualityTest>(endpoints.quality.root, params),

  /** Every test filed against one batch number, oldest first. */
  forBatch: (batchNo: string) =>
    requestPaged<QualityTest>(endpoints.quality.root, { batchNo, order: 'asc', limit: 100 }),

  async record(payload: RecordTestPayload): Promise<QualityTest> {
    const res = await axiosClient.post<ApiEnvelope<QualityTest>>(endpoints.quality.root, payload);
    return res.data.data;
  },

  /** Pass rate per grade over a window - the Quality tab's headline. */
  async summary(params?: { from?: string; to?: string }): Promise<QualityGradeSummary[]> {
    const res = await axiosClient.get<ApiEnvelope<QualityGradeSummary[]>>(endpoints.quality.summary, {
      params,
    });
    return res.data.data;
  },
};

export default qualityService;
