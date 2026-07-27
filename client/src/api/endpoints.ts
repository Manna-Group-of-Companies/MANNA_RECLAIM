/** Every server path in one place, so a rename is a one-line change. */
export const endpoints = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
    register: '/auth/register',
  },
  users: {
    root: '/users',
    byId: (id: string) => `/users/${id}`,
    pin: (id: string) => `/users/${id}/pin`,
  },
  machines: {
    root: '/machines',
    grouped: '/machines/grouped',
    byId: (id: string) => `/machines/${id}`,
    enabled: (id: string) => `/machines/${id}/enabled`,
  },
  batches: {
    root: '/batches',
    open: '/batches/open',
    byId: (id: string) => `/batches/${id}`,
    close: (id: string) => `/batches/${id}/close`,
    reopen: (id: string) => `/batches/${id}/reopen`,
  },
  runs: {
    root: '/runs',
    active: '/runs/active',
    shift: '/runs/shift',
    byId: (id: string) => `/runs/${id}`,
    start: '/runs/start',
    stop: (id: string) => `/runs/${id}/stop`,
    pause: (id: string) => `/runs/${id}/pause`,
    sync: '/runs/sync',
  },
  quality: {
    root: '/quality-tests',
    summary: '/quality-tests/summary',
    byId: (id: string) => `/quality-tests/${id}`,
  },
  dispatch: {
    root: '/dispatches',
    byId: (id: string) => `/dispatches/${id}`,
    loads: (id: string) => `/dispatches/${id}/loads`,
    load: (id: string, loadId: string) => `/dispatches/${id}/loads/${loadId}`,
  },
  rates: {
    root: '/rates',
    customers: '/rates/customers',
    priceList: '/rates/price-list',
    quote: '/rates/quote',
  },
  maintenance: {
    root: '/maintenance',
    resolve: (id: string) => `/maintenance/${id}/resolve`,
    bearings: '/maintenance/bearings',
    bearingsDue: '/maintenance/bearings/due',
  },
  reports: {
    production: '/reports/production',
    efficiency: '/reports/efficiency',
    costing: '/reports/costing',
    dashboard: '/reports/dashboard',
  },
} as const;

export default endpoints;
