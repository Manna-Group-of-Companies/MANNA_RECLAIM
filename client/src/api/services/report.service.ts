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
} from '@/types/models';

export interface DateRange {
  from?: string;
  to?: string;
  [key: string]: unknown;
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

  downtime: (params?: { month?: string }) => get<DowntimeReport>(endpoints.reports.downtime, params),

  downtimeDetail: (params: { month?: string; machineId: string }) =>
    get<DowntimeDetail[]>(endpoints.reports.downtimeDetail, params),
};

export default reportService;
