import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { BearingDue, BearingLog, MaintenanceLog, Shift } from '@/types/models';

export interface MarkDownPayload {
  machineId: string;
  machine?: string | null;
  /** When it actually stopped. Blank means now. */
  downStart?: string;
  rootCause?: string | null;
}

/** All three answers are required: cause, fix, and what stops it recurring. */
export interface RepairPayload {
  rootCause: string;
  resolution: string;
  prevention: string;
  repairedAt?: string;
}

export interface BearingReadingPayload {
  machineId: string;
  machine?: string | null;
  kind?: 'bearing' | 'bush';
  readings: { position: string; tempC: number }[];
  supervisor?: string | null;
  shiftDate?: string;
  shift?: Shift;
  ts?: string;
}

export const maintenanceService = {
  list: (params?: ListQuery) => requestPaged<MaintenanceLog>(endpoints.maintenance.root, params),
  /** Machines currently flagged DOWN. */
  listOpen: () =>
    requestPaged<MaintenanceLog>(endpoints.maintenance.root, { status: 'open', limit: 50 }),
  bearings: (params?: ListQuery) => requestPaged<BearingLog>(endpoints.maintenance.bearings, params),

  async markDown(payload: MarkDownPayload): Promise<MaintenanceLog> {
    const res = await axiosClient.post<ApiEnvelope<MaintenanceLog>>(endpoints.maintenance.root, payload);
    return res.data.data;
  },

  async resolve(id: string, payload: RepairPayload): Promise<MaintenanceLog> {
    const res = await axiosClient.post<ApiEnvelope<MaintenanceLog>>(
      endpoints.maintenance.resolve(id),
      payload,
    );
    return res.data.data;
  },

  /** Withdraws a breakdown reported by mistake - nothing is kept. */
  async cancel(id: string): Promise<{ id: string }> {
    const res = await axiosClient.delete<ApiEnvelope<{ id: string }>>(endpoints.maintenance.byId(id));
    return res.data.data;
  },

  /** One reading covers every position, so this returns a row per position. */
  async logBearings(payload: BearingReadingPayload): Promise<BearingLog[]> {
    const res = await axiosClient.post<ApiEnvelope<BearingLog[]>>(
      endpoints.maintenance.bearings,
      payload,
    );
    return res.data.data;
  },

  async due(): Promise<BearingDue[]> {
    const res = await axiosClient.get<ApiEnvelope<BearingDue[]>>(endpoints.maintenance.bearingsDue);
    return res.data.data;
  },
};

export default maintenanceService;
