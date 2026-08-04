import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type {
  QualityGradeSummary,
  QualityTest,
  Quality,
  RemovedQualityTest,
  Shift,
  Verdict,
} from '@/types/models';

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
   *   lot      one shift of sleeve or loop. Also moulded goods, so `grade`
   *            carries the product here too - but a lot is certified per lot, so
   *            the verdict is addressed by `batchNo`, which is the generated
   *            batch number and is required. That is the whole difference from a
   *            `product` test: one moves a shift, the other moves every pack of
   *            that product in the yard.
   *
   * Defaults to `batch`.
   */
  kind?: 'batch' | 'pool' | 'product' | 'lot';
  /**
   * The batch number; on a pool sample, the pool's label; on a moulded test,
   * the batch of compound the press was running; on a lot, the lot's own number,
   * which is what the verdict is addressed by.
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

  /**
   * Takes a test off the record, and takes its verdict off the goods with it.
   *
   * Back office only - the route is admin-gated. A verdict is filed at the
   * bench and is never edited there, because tests are append-only: the bench
   * corrects itself by filing a re-test, and the newest one wins. This is the
   * other case, and the one a re-test cannot fix - a test filed against the
   * wrong batch or the wrong grade, which goes on releasing goods it was never
   * about however many times the right one is filed beside it.
   *
   * Answers which stock groups it moved, so the screen can say what changed in
   * the yard rather than only that a row is gone.
   */
  async remove(id: string): Promise<RemovedQualityTest> {
    const res = await axiosClient.delete<ApiEnvelope<RemovedQualityTest>>(
      endpoints.quality.byId(id),
    );
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
