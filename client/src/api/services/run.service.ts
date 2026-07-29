import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Run, Quality, Shift } from '@/types/models';

export interface StartRunPayload {
  machineId: string;
  batchId?: string | null;
  batchNo?: string | null;
  line?: string | null;
  /** Copied off the picked batch so the stop sheet can name it. */
  formulation?: string | null;
  /** The grinding line's feedstock for this shift, and the crumb it yields. */
  tyreType?: string | null;
  mesh?: string | null;
  quality?: Quality | null;
  shiftDate?: string;
  shift?: Shift;
  supervisor?: string | null;
  workers?: number | null;
  /** An autoclave charged alongside its twin, so the crew is shared. */
  paired?: boolean;
  /**
   * When the run actually began, for a sheet that asks: the autoclave load
   * sheet takes a loading time. Left out, the server stamps the moment it is
   * told about the run.
   */
  startedAt?: string;
  /** Meter readings taken off the machine as it starts (refiner line). */
  elecStart?: number | null;
  hourStart?: number | null;
  /** The special line's rare pass that yields nothing to weigh. */
  nonProduction?: boolean;
}

export interface StopRunPayload {
  /** The unloading time an autoclave sheet asks for; blank means now. */
  stoppedAt?: string;
  outWeight?: number | null;
  workers?: number | null;
  remarks?: string | null;
  /** Meter readings at stop; the server turns each pair into a difference. */
  elecEnd?: number | null;
  hourEnd?: number | null;
  /** The differences themselves, for when only those are known. */
  kwh?: number | null;
  hoursRun?: number | null;
  firewoodKg?: number | null;
}

/**
 * A correction to a run already on record. Only the fields sent are touched,
 * and the server re-derives energy and hours from whichever readings change.
 */
export interface UpdateRunPayload {
  batchNo?: string | null;
  formulation?: string | null;
  quality?: Quality | null;
  shiftDate?: string;
  shift?: Shift;
  supervisor?: string | null;
  workers?: number | null;
  elecStart?: number | null;
  elecEnd?: number | null;
  hourStart?: number | null;
  hourEnd?: number | null;
  kwh?: number | null;
  hoursRun?: number | null;
  outWeight?: number | null;
  firewoodKg?: number | null;
  capacity?: number | null;
  packedSacks?: number | null;
  remarks?: string | null;
}

/** What a deleted run was carrying, so the screen can name what it removed. */
export interface RemovedRun {
  id: string;
  machine_id: string;
  machine?: string | null;
  shift_date?: string | null;
  shift?: Shift | null;
  batch_no?: string | null;
  weight_kg?: number | null;
}

export interface PackRunPayload {
  sacks: number;
  leftoutIn?: number | null;
  leftoutOut?: number | null;
}

export const runService = {
  list: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.root, params),
  listActive: () => requestPaged<Run>(endpoints.runs.active),
  /** Finished runs on a weighed machine still waiting for their out-weight. */
  listPendingWeigh: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.pendingWeigh, params),
  /** Runs already weighed, newest first - what the Weigh tab corrects from. */
  listWeighed: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.weighed, params),
  /** Weighed runs that still have full sacks to bag. */
  listPendingPack: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.pendingPack, params),
  byShift: (params?: ListQuery) => requestPaged<Run>(endpoints.runs.shift, params),

  async start(payload: StartRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.start, payload);
    return res.data.data;
  },

  async stop(id: string, payload: StopRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.stop(id), payload);
    return res.data.data;
  },

  /**
   * Records the out-weight of a run that has already finished - and corrects
   * one already weighed, which is the same write. `entries` are the individual
   * weighings the total came off, kept so a correction can show them.
   */
  async weigh(id: string, outWeight: number, entries?: number[]): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.weigh(id), {
      outWeight,
      ...(entries ? { entries } : {}),
    });
    return res.data.data;
  },

  /** Records the sacks bagged off a weighed run. */
  async pack(id: string, payload: PackRunPayload): Promise<Run> {
    const res = await axiosClient.post<ApiEnvelope<Run>>(endpoints.runs.pack(id), payload);
    return res.data.data;
  },

  /** Corrects a logged run - either History tab. */
  async update(id: string, payload: UpdateRunPayload): Promise<Run> {
    const res = await axiosClient.patch<ApiEnvelope<Run>>(endpoints.runs.byId(id), payload);
    return res.data.data;
  },

  /**
   * Takes a logged run off the record for good - the History tab's delete.
   * There is no way back from it, so the tab confirms against the named run
   * before it calls this.
   */
  async remove(id: string): Promise<RemovedRun> {
    const res = await axiosClient.delete<ApiEnvelope<RemovedRun>>(endpoints.runs.byId(id));
    return res.data.data;
  },

  /** Discards a run started by mistake - nothing is logged against it. */
  async cancel(id: string): Promise<{ id: string }> {
    const res = await axiosClient.post<ApiEnvelope<{ id: string }>>(endpoints.runs.cancel(id));
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
