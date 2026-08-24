import { axiosClient } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope } from '@/types/api';
import type {
  CostingReport,
  DowntimeDetail,
  DowntimeReport,
  EfficiencyNote,
  EfficiencyRow,
  ProductionReport,
  RunFilters,
  ShiftEfficiency,
  ShiftOption,
  VarianceReason,
  VarianceStatus,
} from '@/types/models';

export interface DateRange {
  from?: string;
  to?: string;
  [key: string]: unknown;
}

/**
 * What the machine-log export covers. Every field narrows it and every one is
 * optional: with none of them it is the plant's whole record, which is what the
 * back office asks for at the end of a month.
 */
export interface MachineLogParams {
  from?: string;
  to?: string;
  machineId?: string;
  shift?: string;
  kind?: string;
}

export interface Dashboard {
  production: ProductionReport;
  efficiency: EfficiencyRow[];
  costing: CostingReport;
}

export interface EfficiencyNotePayload {
  date: string;
  shift?: string | null;
  line: 'refiner' | 'grind';
  metric: string;
  reason: string;
  enteredBy?: string | null;
}

/**
 * Why an actual missed its ideal.
 *
 * `parameter` is the benchmark's own key rather than the card's title, so the
 * reason stays attached to the figure it explains however the screen is laid out
 * later. `ideal` and `actual` are sent because they are what was on screen when
 * the manager was asked - the record is meant to keep the two numbers the reason
 * was written about, not whatever the target says next month.
 */
export interface VarianceReasonPayload {
  date: string;
  shift?: string | null;
  parameter: string;
  label?: string | null;
  ideal?: number | null;
  actual?: number | null;
  reason: string;
  enteredBy?: string | null;
}

const get = async <T>(url: string, params?: Record<string, unknown>): Promise<T> => {
  const res = await axiosClient.get<ApiEnvelope<T>>(url, { params });
  return res.data.data;
};

export const reportService = {
  production: (range?: DateRange) => get<ProductionReport>(endpoints.reports.production, range),
  efficiency: (range?: DateRange) => get<EfficiencyRow[]>(endpoints.reports.efficiency, range),
  costing: (range?: DateRange) => get<CostingReport>(endpoints.reports.costing, range),
  dashboard: (range?: DateRange) => get<Dashboard>(endpoints.reports.dashboard, range),

  /** Days, shifts and machines the run history covers - fills the pickers. */
  filters: () => get<RunFilters>(endpoints.reports.filters),

  /** Shifts that can be analysed, newest day first. */
  shifts: () => get<ShiftOption[]>(endpoints.reports.shifts),

  /** One shift's metrics, each already carrying the plant's usual value. */
  shiftEfficiency: (params: { date: string; shift: string }) =>
    get<ShiftEfficiency>(endpoints.reports.shiftEfficiency, params),

  async addEfficiencyNote(payload: EfficiencyNotePayload): Promise<EfficiencyNote> {
    const res = await axiosClient.post<ApiEnvelope<EfficiencyNote>>(
      endpoints.reports.efficiencyNotes,
      payload,
    );
    return res.data.data;
  },

  async addVarianceReason(payload: VarianceReasonPayload): Promise<VarianceReason> {
    const res = await axiosClient.post<ApiEnvelope<VarianceReason>>(
      endpoints.reports.varianceReasons,
      payload,
    );
    return res.data.data;
  },

  /**
   * Every reason across a window of days. The cards answer "why did this shift
   * miss"; this answers "what has been going wrong", which is the question worth
   * asking at a month's end.
   */
  /**
   * The state of the rule: every miss over a window, each unexplained, waiting
   * on the office, or approved.
   */
  varianceStatus: (range?: DateRange) =>
    get<VarianceStatus>(endpoints.reports.varianceStatus, range),

  varianceReasons: (range?: DateRange) =>
    get<VarianceReason[]>(endpoints.reports.varianceReasons, range),

  /**
   * The office accepting a reason the shift wrote, with its own note if it has
   * one. Who approved it is taken from the session on the server, not sent.
   */
  async approveVarianceReason(id: string, managerNote?: string | null): Promise<VarianceReason> {
    const res = await axiosClient.post<ApiEnvelope<VarianceReason>>(
      endpoints.reports.approveVarianceReason(id),
      { managerNote: managerNote ?? null },
    );
    return res.data.data;
  },

  /** Corrects the wording. What the reason is about is not editable. */
  async updateVarianceReason(
    id: string,
    payload: { reason: string; enteredBy?: string | null },
  ): Promise<VarianceReason> {
    const res = await axiosClient.patch<ApiEnvelope<VarianceReason>>(
      endpoints.reports.varianceReasonById(id),
      payload,
    );
    return res.data.data;
  },

  downtime: (params?: { month?: string }) => get<DowntimeReport>(endpoints.reports.downtime, params),

  downtimeDetail: (params: { month?: string; machineId: string }) =>
    get<DowntimeDetail[]>(endpoints.reports.downtimeDetail, params),

  /**
   * The machine log as a file, saved straight to the browser's downloads.
   *
   * Fetched through the same axios client as everything else rather than by
   * pointing a link at the URL, because the route is authenticated and a bare
   * `<a href>` carries none of that - it would land on the login page and save
   * an HTML file called machine-log.csv, which is the worst possible failure
   * here: it looks like it worked.
   *
   * The server names the file - it knows the window and the machine the export
   * covers - so the name is read back off Content-Disposition rather than
   * rebuilt here from the same parameters a second time.
   */
  async machineLogCsv(params: MachineLogParams = {}): Promise<string> {
    const res = await axiosClient.get<Blob>(endpoints.reports.machineLog, {
      params,
      responseType: 'blob',
    });

    const disposition = String(res.headers?.['content-disposition'] ?? '');
    const named = /filename="?([^";]+)"?/i.exec(disposition);
    const filename = named?.[1] ?? 'machine-log.csv';

    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked on the next tick rather than immediately: Safari has not finished
    // with the URL when click() returns, and a revoked one saves nothing.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return filename;
  },
};

export default reportService;
