import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { QualityGradeSummary, QualityTest, Quality, Shift, Verdict } from '@/types/models';

export interface RecordTestPayload {
  /**
   * What is being certified.
   *
   *   batch    one grade of one lot, and passing it releases that lot's sacks.
   *   pool     one sample of a coarse period. Coarse has no lot to certify, so
   *            the period is sampled three times instead and a sample records
   *            what the line was doing without releasing or gating anything.
   *   product  what a press moulded. The bench tests loops rather than a grade
   *            of rubber, so `grade` carries the product's id - which is why
   *            this is its own kind rather than a batch test with the grade
   *            loosened. Passing it releases every pack of that product.
   *
   * Defaults to `batch`.
   */
  kind?: 'batch' | 'pool' | 'product';
  /**
   * The batch number; on a pool sample, the pool's label; on a moulded test,
   * the batch of compound the press was running.
   */
  batchNo?: string | null;
  machineId?: string | null;
  /** The grade on a batch or pool test, and the product's id on a moulded one. */
  grade: Quality | string;
  verdict: Verdict;
  params?: { name: string; value: string; unit?: string }[];
  testedBy?: string | null;
  shiftDate?: string;
  shift?: Shift;
  remarks?: string | null;
  /** A report already on file, kept when a grade is tested again. */
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

/** The file itself, handed over as a data URL - see attachReport below. */
export interface ReportPayload {
  id: string;
  name: string;
  dataUrl: string;
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

  /**
   * Hangs the lab's report on a test already filed. The file goes up as a data
   * URL - the sheets read it with FileReader, and the server is the only side
   * holding a storage key.
   */
  async attachReport({ id, name, dataUrl }: ReportPayload): Promise<QualityTest> {
    const res = await axiosClient.post<ApiEnvelope<QualityTest>>(endpoints.quality.report(id), {
      name,
      dataUrl,
    });
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
