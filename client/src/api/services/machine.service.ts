import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Machine } from '@/types/models';

export interface GroupedMachines {
  rows: Machine[];
  groups: Record<string, Machine[]>;
}

export const machineService = {
  list: (params?: ListQuery) => requestPaged<Machine>(endpoints.machines.root, params),

  async grouped(): Promise<GroupedMachines> {
    const res = await axiosClient.get<ApiEnvelope<GroupedMachines>>(endpoints.machines.grouped);
    return res.data.data;
  },

  async update(id: string, patch: Partial<Machine>): Promise<Machine> {
    const res = await axiosClient.patch<ApiEnvelope<Machine>>(endpoints.machines.byId(id), patch);
    return res.data.data;
  },

  async setEnabled(id: string, enabled: boolean): Promise<Machine> {
    const res = await axiosClient.patch<ApiEnvelope<Machine>>(endpoints.machines.enabled(id), { enabled });
    return res.data.data;
  },
};

export default machineService;
