import { axiosClient, tokenStore } from '../axiosClient';
import { endpoints } from '../endpoints';
import type { ApiEnvelope } from '@/types/api';
import type { User } from '@/types/models';

export interface LoginPayload { name: string; pin: string }
export interface Session { user: User; accessToken: string }

export const authService = {
  async login(payload: LoginPayload): Promise<Session> {
    const res = await axiosClient.post<ApiEnvelope<Session>>(endpoints.auth.login, payload);
    tokenStore.set(res.data.data.accessToken);
    return res.data.data;
  },

  async me(): Promise<User> {
    const res = await axiosClient.get<ApiEnvelope<User>>(endpoints.auth.me);
    return res.data.data;
  },

  async logout(): Promise<void> {
    try {
      await axiosClient.post(endpoints.auth.logout);
    } finally {
      tokenStore.clear();
    }
  },
};

export default authService;
