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
  /** What the moulding presses mould, and the curing settings on each. */
  products: {
    root: '/products',
    byId: (id: string) => `/products/${id}`,
  },
  batches: {
    root: '/batches',
    open: '/batches/open',
    byId: (id: string) => `/batches/${id}`,
    qualities: (id: string) => `/batches/${id}/qualities`,
    close: (id: string) => `/batches/${id}/close`,
    reopen: (id: string) => `/batches/${id}/reopen`,
  },
  runs: {
    root: '/runs',
    active: '/runs/active',
    pendingWeigh: '/runs/pending-weigh',
    weighed: '/runs/weighed',
    pendingPack: '/runs/pending-pack',
    /** Packed sacks still in the yard, for the Dispatch tab. */
    packed: '/runs/packed',
    shift: '/runs/shift',
    byId: (id: string) => `/runs/${id}`,
    start: '/runs/start',
    stop: (id: string) => `/runs/${id}/stop`,
    weigh: (id: string) => `/runs/${id}/weigh`,
    /** The running tally banked while a shiftwise machine is still going. */
    tally: (id: string) => `/runs/${id}/tally`,
    pack: (id: string) => `/runs/${id}/pack`,
    pause: (id: string) => `/runs/${id}/pause`,
    cancel: (id: string) => `/runs/${id}/cancel`,
    sync: '/runs/sync',
  },
  quality: {
    root: '/quality-tests',
    summary: '/quality-tests/summary',
    byId: (id: string) => `/quality-tests/${id}`,
    report: (id: string) => `/quality-tests/${id}/report`,
  },
  /**
   * The yard. `/stock` is the back office's whole table; `/stock/summary` is
   * the shop floor's, and is a different response built by a different
   * serializer rather than the same one with fields left out.
   */
  stock: {
    root: '/stock',
    summary: '/stock/summary',
    byId: (id: string) => `/stock/${id}`,
    qc: (id: string) => `/stock/${id}/qc`,
  },
  /** Posted once, never edited - a correction is a reversal and a new one. */
  dispatch: {
    root: '/dispatches',
    byId: (id: string) => `/dispatches/${id}`,
  },
  customers: {
    root: '/customers',
    byId: (id: string) => `/customers/${id}`,
    dispatches: (id: string) => `/customers/${id}/dispatches`,
    lastPrices: (id: string) => `/customers/${id}/last-prices`,
  },
  rates: {
    root: '/rates',
    customers: '/rates/customers',
    priceList: '/rates/price-list',
    quote: '/rates/quote',
    costRates: '/rates/cost-rates',
  },
  maintenance: {
    root: '/maintenance',
    byId: (id: string) => `/maintenance/${id}`,
    resolve: (id: string) => `/maintenance/${id}/resolve`,
    bearings: '/maintenance/bearings',
    bearingsDue: '/maintenance/bearings/due',
  },
  reports: {
    production: '/reports/production',
    efficiency: '/reports/efficiency',
    costing: '/reports/costing',
    dashboard: '/reports/dashboard',
    filters: '/reports/filters',
    downtime: '/reports/downtime',
    downtimeDetail: '/reports/downtime/detail',
    shifts: '/reports/shifts',
    shiftEfficiency: '/reports/shift-efficiency',
    efficiencyNotes: '/reports/efficiency-notes',
  },
} as const;

export default endpoints;
