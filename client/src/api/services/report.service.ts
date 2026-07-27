import { axiosClient } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope } from '@/types/api';
import type { CostingReport, EfficiencyRow, ProductionReport } from '@/types/models';

export interface DateRange { from?: string; to?: string }

export interface Dashboard {
  production: ProductionReport;
  efficiency: EfficiencyRow[];
  costing: CostingReport;
}

const get = async <T>(url: string, params?: DateRange): Promise<T> => {
  const res = await axiosClient.get<ApiEnvelope<T>>(url, { params });
  return res.data.data;
};

export const reportService = {
  production: (range?: DateRange) => get<ProductionReport>(endpoints.reports.production, range),
  efficiency: (range?: DateRange) => get<EfficiencyRow[]>(endpoints.reports.efficiency, range),
  costing: (range?: DateRange) => get<CostingReport>(endpoints.reports.costing, range),
  dashboard: (range?: DateRange) => get<Dashboard>(endpoints.reports.dashboard, range),
};

export default reportService;
