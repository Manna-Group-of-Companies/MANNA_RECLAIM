import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Run, Quality, Shift } from '@/types/models';

export interface StartRunPayload {
  machineId: string;
  batchId?: string | null;
  quality?: Quality | null;
  shiftDate?: string;
  shift?: Shift;
  supervisor?: string | null;
  workers?: number | null;
}

export interface StopRunPayload {
  outWeight?: number | null;
  workers?: number | null;
  remarks?: string | null;
}

export const runService = {
  list: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.root, params),
  listActive: () => requestPaged<Run>(endpoints.runs.active),
  byShift: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.shift, params),

  async start(payload: StartRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.start, payload);
    return res.data.data;
  },

  async stop(id: string, payload: StopRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.stop(id), payload);
    return res.data.data;
  },

  async pause(id: string, paused: boolean): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.pause(id), { paused });
    return res.data.data;
  },

  /** Flushes locally queued runs after an offline stretch. */
  async sync(rows: Partial<Run>[]): Promise<Run[]> {
    const res = await axiosClient.post<ApiEnvelope<Run[]>>(endpoints.runs.sync, { rows });
    return res.data.data;
  },
};

export default runService;
