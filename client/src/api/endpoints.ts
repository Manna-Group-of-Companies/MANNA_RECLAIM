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
    /**
     * The names that may sign a record, for the Supervisor pick. The one route
     * here the shop floor can reach - everything else under /users is the back
     * office's. Names only; see the server's userService.listSigners.
     */
    signers: '/users/signers',
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

    /** Packed sacks still in the yard, for the Stock tab. */
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
    /** The lab record by batch and then by grade - what the MD's Quality tab reads. */
    byBatch: '/quality-tests/by-batch',
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
    /**
     * Stock as SAP holds it, with how old the reading is. Posted by the
     * scheduled sync on the plant server - see /sync/sap-stock, which is the
     * way in and takes a shared secret rather than a session.
     */
    sap: '/stock/sap',
    /**
     * The coarse pools and their three sample points. The lab tests the period
     * rather than a lot, so it has to see which periods exist and which slots
     * are still empty.
     */
    pools: '/stock/pools',
    /**
     * What the presses have made, by product and pack. The lab's other stock
     * route: a moulded group is keyed on its product and the pack it is boxed
     * in, so it is on neither the batch card nor the pool list, and boxed
     * pieces would sit at `pending` with no bench able to reach them.
     */
    moulded: '/stock/moulded',
    byId: (id: string) => `/stock/${id}`,
    qc: (id: string) => `/stock/${id}/qc`,
  },
  /** Posted once, never edited - a correction is a reversal and a new one. */
  dispatch: {
    root: '/dispatches',
    /**
     * What has gone out, as SAP holds it - three months, read once a day. The
     * office and the managing director read this; the yard raises documents and
     * reads what left lately, which is `root`.
     */
    sap: '/dispatches/sap',
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
    /**
     * The manager's benchmarks - what a shift ought to produce, how many charges
     * a vessel ought to take, what a kg ought to cost in energy and in
     * labour-hours. Beside the cost rates because they are edited on the same
     * screen and behind the same door: they are what a shift is judged against.
     */
    idealValues: '/rates/ideal-values',
    /**
     * The two figures a loading job is costed by, for the dispatch form's
     * running total. Its own route rather than the whole cost model above,
     * which stays the back office's - the yard raises dispatch notes, and that
     * is no reason to hand it the overheads and the interest rate.
     */
    loadingRates: '/rates/loading-rates',
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
    /**
     * Why an actual missed its ideal. A shift's own come back with it on
     * shiftEfficiency; this is the review across a window of days, which is what
     * the record is kept for. The PATCH corrects the wording only.
     */
    varianceReasons: '/reports/variance-reasons',
    /** Every miss over a window, and how far along its explanation is. */
    varianceStatus: '/reports/variance-status',

    /**
     * One line, grade or vessel followed across a window - the question a
     * single shift cannot answer, which is whether the shift just read was
     * normal.
     */
    efficiencyTrend: '/reports/efficiency-trend',
    varianceReasonById: (id: string) => `/reports/variance-reasons/${id}`,
    approveVarianceReason: (id: string) => `/reports/variance-reasons/${id}/approve`,
    /**
     * The machine log as a spreadsheet - every logged run, one column set for
     * the whole plant. The only route that answers with a file rather than the
     * usual envelope, which is why it is fetched as a blob.
     */
    machineLog: '/reports/machine-log.csv',
  },
} as const;

export default endpoints;
