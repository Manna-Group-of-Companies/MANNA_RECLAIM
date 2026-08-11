import { axiosClient, requestPaged } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope, ListQuery } from '@/types/api';
import type { Role, User } from '@/types/models';

export const userService = {
  list: (params?: ListQuery) => requestPaged<User>(endpoints.users.root, params),

  /** Who may sign a record, by name. Readable by the shop floor, unlike list(). */
  async signers(): Promise<string[]> {
    const res = await axiosClient.get<ApiEnvelope<string[]>>(endpoints.users.signers);
    return res.data.data;
  },

  async create(payload: { name: string; pin: string; role?: Role }): Promise<User> {
    const res = await axiosClient.post<ApiEnvelope<User>>(endpoints.users.root, payload);
    return res.data.data;
  },

  async update(id: string, patch: Partial<User>): Promise<User> {
    const res = await axiosClient.patch<ApiEnvelope<User>>(endpoints.users.byId(id), patch);
    return res.data.data;
  },

  resetPin: (id: string, pin: string) => axiosClient.patch(endpoints.users.pin(id), { pin }),
  remove: (id: string) => axiosClient.delete(endpoints.users.byId(id)),
};

export default userService;
