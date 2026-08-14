/// Every server path in one place, so a rename is a one-line change.
///
/// A direct port of client/src/api/endpoints.ts. The backend is unchanged, so
/// these strings are the contract between the two apps: nothing here may be
/// invented, and anything missing is a route this app has no business calling.
class Endpoints {
  const Endpoints._();

  // ---- auth -----------------------------------------------------------
  static const authLogin = '/auth/login';
  static const authLogout = '/auth/logout';
  static const authRefresh = '/auth/refresh';
  static const authMe = '/auth/me';

  /// The names that may sign a record, for the Supervisor pick. The one route
  /// under /users the shop floor can reach - the rest is the back office's.
  static const userSigners = '/users/signers';

  // ---- machines -------------------------------------------------------
  static const machines = '/machines';
  static const machinesGrouped = '/machines/grouped';

  // ---- products (what the presses mould) ------------------------------
  static const products = '/products';

  // ---- batches --------------------------------------------------------
  static const batches = '/batches';
  static const batchesOpen = '/batches/open';
  static String batch(String id) => '/batches/$id';
  static String batchQualities(String id) => '/batches/$id/qualities';
  static String batchClose(String id) => '/batches/$id/close';

  // ---- runs -----------------------------------------------------------
  static const runs = '/runs';
  static const runsActive = '/runs/active';
  static const runsPendingWeigh = '/runs/pending-weigh';
  static const runsWeighed = '/runs/weighed';
  static const runsPendingPack = '/runs/pending-pack';
  static const runsPacked = '/runs/packed';
  static const runsShift = '/runs/shift';
  static const runsStart = '/runs/start';
  static const runsSync = '/runs/sync';
  static String run(String id) => '/runs/$id';
  static String runStop(String id) => '/runs/$id/stop';
  static String runWeigh(String id) => '/runs/$id/weigh';
  static String runTally(String id) => '/runs/$id/tally';
  static String runPack(String id) => '/runs/$id/pack';
  static String runPause(String id) => '/runs/$id/pause';
  static String runCancel(String id) => '/runs/$id/cancel';

  /// The yard. `/stock` is the back office's whole table; `/stock/summary` is
  /// the shop floor's, and is a different response built by a different
  /// serializer rather than the same one with fields left out. A supervisor is
  /// refused `/stock` at the route, so this app only ever asks for the summary.
  static const stockSummary = '/stock/summary';
  static const stockPools = '/stock/pools';

  // ---- dispatch (the yard raises its own - see DISPATCH_ROLES) ---------
  static const dispatches = '/dispatches';

  // ---- customers, rates ------------------------------------------------
  static const customers = '/customers';
  static String customerLastPrices(String id) => '/customers/$id/last-prices';
  static const loadingRates = '/rates/loading-rates';

  // ---- maintenance -----------------------------------------------------
  static const maintenance = '/maintenance';
  static String maintenanceById(String id) => '/maintenance/$id';
  static String maintenanceResolve(String id) => '/maintenance/$id/resolve';
  static const bearings = '/maintenance/bearings';
  static const bearingsDue = '/maintenance/bearings/due';

  // ---- reports ---------------------------------------------------------
  /// The only one left, and it is not a report: the day, shift, batch and
  /// machine lists the History tab's pickers are built from. The production
  /// headline went with the Reports page.
  static const reportsFilters = '/reports/filters';
}
