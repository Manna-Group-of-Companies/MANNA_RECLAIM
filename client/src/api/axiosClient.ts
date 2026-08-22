import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { appEnv, storageKeys } from '@/config/env';
import { requestLog } from './requestLog';
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

/**
 * A call in flight, as the diagnostic log needs to see it: when it started, and
 * whether it is the retry half of a refresh. Both are stamped on the config so
 * they survive into the response interceptor, which is the only place that
 * knows how the call actually ended.
 */
type Timed = InternalAxiosRequestConfig & { _startedAt?: number; _retried?: boolean };

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Stamped on the retry as well as on the first attempt, so the millis on each
  // log line is that attempt's own wait rather than the pair's.
  (config as Timed)._startedAt = performance.now();
  return config;
});

type Retriable = Timed;

/** How long this call took, from the stamp the request interceptor left. */
const elapsed = (config?: Timed) =>
  config?._startedAt == null ? 0 : performance.now() - config._startedAt;

/** Where the call went, as the log names it: the route, without the origin. */
const pathOf = (config?: Timed) => config?.url ?? '(unknown)';

const methodOf = (config?: Timed) => config?.method ?? 'get';

/**
 * Why a request never landed, in the words to say it in. Axios reports these as
 * a code rather than a status, because there is no response to read one off.
 */
const reasonFor = (error: AxiosError): string => {
  switch (error.code) {
    case 'ECONNABORTED':
    case 'ETIMEDOUT':
      return 'timed out waiting for a reply';
    case 'ERR_NETWORK':
      return 'could not reach the server';
    case 'ERR_CANCELED':
      return 'cancelled';
    default:
      return error.message || 'no reply';
  }
};

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

/**
 * Every call is recorded as it completes - see api/requestLog for what is and
 * is not kept. The recording sits in the interceptors rather than in `request`
 * below, so a call made straight through the axios instance is logged too and
 * the refresh dance shows up as the two attempts it really is.
 *
 * The refresh call itself is not logged: it goes through a bare `axios.post`
 * rather than this instance. What a reader needs is the 401 that provoked it
 * and the retry that followed, and both of those are here.
 */
axiosClient.interceptors.response.use(
  (res: AxiosResponse) => {
    const config = res.config as Timed;
    requestLog.record({
      method: methodOf(config),
      path: pathOf(config),
      status: res.status,
      millis: elapsed(config),
      note: config._retried ? 'after refresh' : undefined,
    });
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as Retriable | undefined;
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const token = await refreshAccessToken();
      // Recorded either way. A 401 that was quietly refreshed and retried is
      // invisible to the caller and worth seeing in a log - it is what a
      // session dying slowly looks like.
      requestLog.record({
        method: methodOf(original),
        path: pathOf(original),
        status: 401,
        millis: elapsed(original),
        note: token ? 'refreshed, retrying' : 'refresh failed',
      });
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return axiosClient(original);
      }
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('manna:signed-out'));
      return Promise.reject(error);
    }

    if (error.response) {
      requestLog.record({
        method: methodOf(original),
        path: pathOf(original),
        status: error.response.status,
        millis: elapsed(original),
        // The server's own words. This is the half worth keeping: every refusal
        // this API makes names where the work actually is.
        message: toRequestError(error).message,
        note: original?._retried ? 'after refresh' : undefined,
      });
    } else {
      // Nothing reached the server, so there is no status and no message from
      // it - only what the client was doing when it gave up.
      requestLog.record({
        method: methodOf(original),
        path: pathOf(original),
        millis: elapsed(original),
        message: reasonFor(error),
      });
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

/**
 * Pages a newest-first list back as far as a cutoff date.
 *
 * Every list route caps a page at 200 rows and none of them takes a date
 * filter, so a screen wanting "everything since March" and asking in one go
 * gets the newest 200 and nothing to say it is looking at a slice. That is the
 * failure this exists to prevent: a screen whose whole job is to show what has
 * been missed must not itself miss things quietly.
 *
 * Rows come back newest first, so it stops at the first page that reaches past
 * the cutoff rather than draining the table - a 30-day window on a plant with
 * two years of history is one request. `since` of null means the whole record,
 * bounded by `maxPages`.
 *
 * `truncated` is true when that ceiling was reached with rows still to come.
 * The caller is expected to say so on screen. A silent cap here would put the
 * screen back exactly where it started.
 */
export async function drainPaged<T>(
  url: string,
  {
    dateOf,
    since,
    params = {},
    limit = 200,
    maxPages = 25,
  }: {
    dateOf: (row: T) => string | null | undefined;
    since: string | null;
    params?: Record<string, unknown>;
    limit?: number;
    maxPages?: number;
  },
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const { rows: batch } = await requestPaged<T>(url, { ...params, page, limit });
    rows.push(...batch);
    // A short page is the end of the table, whatever the cutoff says.
    if (batch.length < limit) return { rows, truncated: false };
    // Reached past the window: everything older is somebody else's question.
    if (since && batch.some((row) => (dateOf(row) ?? '').slice(0, 10) < since)) {
      return { rows, truncated: false };
    }
  }
  return { rows, truncated: true };
}

export default axiosClient;
