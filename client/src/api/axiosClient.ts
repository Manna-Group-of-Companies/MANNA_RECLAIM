import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { appEnv, storageKeys } from '@/config/env';
import type { ApiEnvelope, RequestError } from '@/types/api';

export const tokenStore = {
  get: () => localStorage.getItem(storageKeys.accessToken),
  set: (token: string) => localStorage.setItem(storageKeys.accessToken, token),
  clear: () => localStorage.removeItem(storageKeys.accessToken),
};

export const axiosClient: AxiosInstance = axios.create({
  baseURL: appEnv.apiUrl,
  withCredentials: true,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type Retriable = InternalAxiosRequestConfig & { _retried?: boolean };

let refreshing: Promise<string | null> | null = null;

/** One in-flight refresh at a time; queued calls reuse its result. */
async function refreshAccessToken(): Promise<string | null> {
  refreshing ??= axios
    .post<ApiEnvelope<{ accessToken: string }>>(
      `${appEnv.apiUrl}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    .then((res) => {
      const token = res.data?.data?.accessToken ?? null;
      if (token) tokenStore.set(token);
      return token;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export const toRequestError = (error: unknown): RequestError => {
  const err = error as AxiosError<ApiEnvelope<unknown>>;
  if (err?.response) {
    return {
      message: err.response.data?.message || err.message,
      status: err.response.status,
      errors: err.response.data?.errors,
    };
  }
  if (err?.request) return { message: 'Network unreachable - working offline' };
  return { message: (error as Error)?.message || 'Something went wrong' };
};

axiosClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error: AxiosError) => {
    const original = error.config as Retriable | undefined;
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return axiosClient(original);
      }
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('manna:signed-out'));
    }
    return Promise.reject(error);
  },
);

/** Unwraps `{ success, data }` so callers get the payload straight away. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await axiosClient.request<ApiEnvelope<T>>(config);
  return res.data.data;
}

/** Same, but keeps the pagination meta alongside the rows. */
export async function requestPaged<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<{ rows: T[]; meta: ApiEnvelope<T[]>['meta'] }> {
  const res = await axiosClient.get<ApiEnvelope<T[]>>(url, { params });
  return { rows: res.data.data ?? [], meta: res.data.meta };
}

export default axiosClient;
