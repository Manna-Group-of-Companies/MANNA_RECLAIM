/** Shared domain vocabulary. Keep in sync with client/src/config/constants.ts */

export const ROLES = {
  WORKER: 'worker',
  SUPERVISOR: 'supervisor',
  LAB: 'lab',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

export const ADMIN_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

/**
 * The lab keeps the quality record, and nobody else writes to it: a supervisor
 * has no way to sign off on a test they did not run. Admins are here because
 * they can already delete a test - being able to correct one is the lesser
 * power, and locking them out would leave a bad row with no way back.
 */
export const QUALITY_WRITE_ROLES = [ROLES.LAB, ...ADMIN_ROLES];

export const SHIFTS = { DAY: 'Day', NIGHT: 'Night' };

/** Day 08:30-20:30, Night 20:30-08:30 (minutes from midnight). */
export const SHIFT_WINDOW = { dayStart: 510, dayEnd: 1230 };

export const QUALITIES = ['Special', 'SuperFine', 'Fine', 'Medium', 'DRC'];

/**
 * The grades a batch is tracked as yielding: the rows of the batch card's grid,
 * what the supervisor may mark, and what the close rule counts.
 *
 * DRC is left out of the batch lifecycle on purpose. It stays a grade everywhere
 * else - a run can be logged as DRC, the lab can test it, and it keeps its own
 * quality chip - so nothing but the batch card and its rules leaves it alone.
 *
 * Kept as a list of its own rather than as a filter at each use, because the grid
 * the crew reads, the marked count the chip shows and the close rule all have to
 * be counting the same set. Mirrors BATCH_QUALITIES in the client's constants.
 */
export const BATCH_QUALITIES = ['Special', 'SuperFine', 'Fine', 'Medium'];

export const DISPATCH_GRADES = ['Special', 'SuperFine', 'Fine', 'Medium', 'Coarse', 'Sillsheet'];

export const MACHINE_KINDS = ['grind', 'autoclave', 'prerefiner', 'refiner', 'coarse', 'press'];

/**
 * The moulding presses. They mould finished goods out of reclaim compound rather
 * than making reclaim, so almost none of the plant's usual rules reach them: no
 * meters, no run hours, no energy, no bearings, nothing to weigh afterwards and
 * no packing path. What they record is a count of pieces against a product.
 */
export const PRESS_IDS = ['PRS_P3', 'PRS_P5'];

/** Standard list rate per kg. A customer rate card entry overrides these. */
export const PRICE_LIST = { Special: 48, SuperFine: 47, Fine: 43, Medium: 41, Coarse: 36 };

export const FIREWOOD_KG_PER_LOAD = 550;

/** One packed sack. Anything under this is carried into the next batch. */
export const SACK_KG = 50;

/**
 * How often a running machine has its bearing / bush temperatures logged, and
 * which positions get a reading. PR1, R1, R2 and Grinder 1 run on bushes;
 * everything else on bearings. Autoclaves and the presses have neither.
 */
export const BEARING_INTERVAL_H = { grind: 2, refiner: 3, prerefiner: 3, coarse: 3 };
export const BUSH_MACHINE_IDS = ['PR1', 'R1', 'R2', 'GRD_K'];
export const BEARING_POSITIONS = ['1', '2', '3', '4'];

/** Supabase table names. Their columns and keys live in src/config/tables.js. */
export const TABLES = {
  users: 'users',
  shifts: 'shifts',
  machines: 'machines',
  // What the presses mould, and the curing settings that belong to it.
  products: 'products',
  runs: 'runs',
  dispatches: 'dispatches',
  dispatchLoads: 'dispatch_loads',
  qualityTests: 'quality_tests',
  maintenance: 'maintenance',
  bearingLogs: 'bearing_logs',
  customers: 'customers',
  rates: 'rates',

  // The prototype kept batches, leftouts and the seq counter inside one
  // "plant" blob rather than as their own table, so batch reads go through it -
  // there is no `batches` table in the project, by design.
  sharedState: 'shared_state',
  liveState: 'live_state',
  sessions: 'sessions',
  customerRates: 'customer_rates',
  priceList: 'price_list',
  materialRates: 'material_rates',
  costRates: 'cost_rates',
  conversions: 'conversions',
  formulations: 'formulations',
  machineTargets: 'machine_targets',
  // Why a shift under-performed, written by the back office when it flags a dip.
  efficiencyNotes: 'efficiency_notes',
};

/**
 * Postgres views. Already aggregated by the database, so the report and
 * costing services read them instead of recomputing from raw runs. Read-only:
 * Postgres rebuilds them from the tables above on every query.
 */
export const VIEWS = {
  machineShiftEfficiency: 'machine_shift_efficiency',
  shiftActivity: 'shift_activity',
  shiftCosting: 'shift_costing',
  coarseShiftCosting: 'coarse_shift_costing',
  specialBatchDetail: 'special_batch_detail',
  specialBatchQuality: 'special_batch_quality',
  coarseShiftDetail: 'coarse_shift_detail',
  batchCostingSpecial: 'batch_costing_special',
  monthlyQualityCosting: 'monthly_quality_costing',
  customerEffectiveRate: 'customer_effective_rate',
  formulationRm: 'formulation_rm',
  bearingTempLog: 'bearing_temp_log',
  qualityLatest: 'quality_latest',
  dispatchValue: 'dispatch_value',
  dispatchRevenueByGrade: 'dispatch_revenue_by_grade',
};

/** Machines whose output is weighed after the run, from the prototype. */
export const WEIGHED_KINDS = ['grind', 'coarse', 'refiner'];

/** The refiner passes a special-line grade goes through, and the grinders. */
export const REFINER_IDS = ['PR2', 'R1', 'R3', 'R4'];
export const GRINDER_IDS = ['CRK', 'GRD_K', 'GRD_S', 'GRD_O'];

/**
 * The refiner line split into the stages a batch's grade is tracked through -
 * the three columns of the batch card's grade grid.
 *
 * A grade is refined on R3, or on R1 when R3 is down and stands in for it, then
 * finished on R4. R4 is the only one of them that weighs, so logging a run there
 * is also what settles which grade the batch actually yielded - see
 * batch.service's markQuality().
 *
 * The pre-refiners are not a stage: they break a charge down before the grades
 * are split out of it, so a batch reports which of them it went through rather
 * than tracking them per grade.
 */
export const PRE_REFINER_IDS = ['PR1', 'PR2'];
export const REFINE_STAGE_IDS = ['R3', 'R1'];
export const FINAL_REFINER_IDS = ['R4'];

/** A shift is 12 hours; a bearing over this many degrees is flagged. */
export const SHIFT_MINUTES = 720;
export const BEARING_TEMP_LIMIT_C = 80;

/**
 * When the back office calls a shift below par. Each is a fraction of the
 * plant's own median, not an absolute target - the plant is measured against
 * itself, which is the only baseline it has.
 */
export const EFFICIENCY_THRESHOLDS = {
  labour: 0.8, // production per man-hour under 80% of usual
  energy: 1.25, // kWh per kg over 125% of usual (more energy is worse)
  yield: 0.85, // batch yield under 85% of usual
  utilisation: 0.7, // ran less than 70% of the 12 h shift
};

/** The cost inputs the Rates tab edits, stored as one `cost_rates` row. */
export const COST_RATE_KEYS = [
  'crumbTruckPerKg', 'crumbBikePerKg', 'crumbDrcPerKg', 'raPerKg', 'rpoPerKg', 'pineTarPerKg',
  'waterPerL', 'packLabourPerSack', 'packMaterialPerSack', 'loadingPerKg', 'transDriverPerKg',
  'transVehiclePerKm', 'transFuelPerKm', 'firewoodPerKg', 'refinerKwhRate', 'ohFinancialPerMonth',
  'ohManufacturingPerMonth', 'ohDepreciationPerMonth', 'interestPctPerAnnum',
];

export default { ROLES, SHIFTS, QUALITIES, DISPATCH_GRADES, MACHINE_KINDS, PRICE_LIST, TABLES, VIEWS };
