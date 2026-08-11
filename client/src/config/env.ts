/** Single place that reads import.meta.env, so nothing else has to. */
export const appEnv = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  appName: import.meta.env.VITE_APP_NAME ?? 'Manna Production Management',
  devtools: import.meta.env.VITE_ENABLE_DEVTOOLS !== 'false',
  /**
   * The passcode on the back office's Costing tab, as back.html had it.
   * Settable so the plant can change it without a code edit - but note it
   * ships inside the bundle either way, so treat it as a "not in front of a
   * visitor" screen rather than access control. What actually guards the
   * costing figures is the manager/admin check on the route and the API.
   */
  costingPasscode: import.meta.env.VITE_COSTING_PASSCODE ?? '2525',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export const storageKeys = {
  accessToken: 'manna.accessToken',
  user: 'manna.user',
  theme: 'manna.theme',
  offlineQueue: 'manna.offlineQueue',
  /** The name the tablet is signing records with - see hooks/useSupervisor. */
  supervisor: 'manna.supervisor',
  /**
   * The names that may sign, as last read from the server. Kept so a tablet
   * that opens a sheet before the fetch lands - or with no signal at all - still
   * offers the crew the list it had yesterday rather than three compiled-in
   * names. See hooks/useSupervisor.
   */
  signers: 'manna.signers',
} as const;

export default appEnv;
