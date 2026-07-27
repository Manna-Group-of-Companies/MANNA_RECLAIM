/** Single place that reads import.meta.env, so nothing else has to. */
export const appEnv = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  appName: import.meta.env.VITE_APP_NAME ?? 'Manna Production Management',
  devtools: import.meta.env.VITE_ENABLE_DEVTOOLS !== 'false',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export const storageKeys = {
  accessToken: 'manna.accessToken',
  user: 'manna.user',
  theme: 'manna.theme',
  offlineQueue: 'manna.offlineQueue',
} as const;

export default appEnv;
