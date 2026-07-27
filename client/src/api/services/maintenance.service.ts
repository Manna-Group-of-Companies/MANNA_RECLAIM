import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { BearingDue, BearingLog, MaintenanceLog } from '@/types/models';

export const maintenanceService = {
  list: (params?: ListQuery) => requestPaged<MaintenanceLog>(endpoints.maintenance.root, params),
  bearings: (params?: ListQuery) => requestPaged<BearingLog>(endpoints.maintenance.bearings, params),

  async create(payload: Partial<MaintenanceLog>): Promise<MaintenanceLog> {
    const res = await axiosClient.post<ApiEnvelope<MaintenanceLog>>(endpoints.maintenance.root, payload);
    return res.data.data;
  },

  async resolve(id: string, remarks?: string): Promise<MaintenanceLog> {
    const res = await axiosClient.post<ApiEnvelope<MaintenanceLog>>(
      endpoints.maintenance.resolve(id),
      { remarks },
    );
    return res.data.data;
  },

  async logBearing(payload: { machineId: string; kind?: 'bearing' | 'bush'; positions?: string[] }): Promise<BearingLog> {
    const res = await axiosClient.post<ApiEnvelope<BearingLog>>(endpoints.maintenance.bearings, payload);
    return res.data.data;
  },

  async due(): Promise<BearingDue[]> {
    const res = await axiosClient.get<ApiEnvelope<BearingDue[]>>(endpoints.maintenance.bearingsDue);
    return res.data.data;
  },
};

export default maintenanceService;
