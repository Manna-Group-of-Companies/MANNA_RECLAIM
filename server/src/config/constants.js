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
 * Who may delete, as opposed to who may correct.
 *
 * The admin account alone - deliberately narrower than ADMIN_ROLES, which is
 * what "the back office" means everywhere else in this file. The three deletes
 * it gates are the shop-floor tabs' destructive controls: clearing a weighing on
 * Weigh, clearing an emptied group on Stock, and taking a verdict off the record
 * on Quality.
 *
 * A manager loses nothing they can do twice. Weighing again, re-testing,
 * re-packing and setting a QC verdict by hand are all still theirs, and each of
 * those can be taken back by doing it again. What is behind this list is the
 * half that cannot: no screen in this app puts a deleted verdict, a cleared
 * weighing or a removed yard row back.
 *
 * It is its own name rather than an inline `authorize(ROLES.ADMIN)` at each
 * route because who counts as the back office and who may destroy a record are
 * two questions, and widening this again is then a one-line change here rather
 * than a hunt through the routes.
 *
 * Enforced at the routes as `strictAdminOnly`; the screens mirror this list so
 * they do not offer a tap that comes back 403. Mirrors DELETE_ROLES in
 * client/src/config/constants.ts.
 */
export const DELETE_ROLES = [ROLES.ADMIN];

/**
 * The lab keeps the quality record, and nobody else writes to it: a supervisor
 * has no way to sign off on a test they did not run. Admins are here because
 * they can already delete a test - being able to correct one is the lesser
 * power, and locking them out would leave a bad row with no way back.
 */
export const QUALITY_WRITE_ROLES = [ROLES.LAB, ...ADMIN_ROLES];

/**
 * Who may issue a dispatch.
 *
 * The yard and the back office. The vehicle is loaded at the yard, and the
 * supervisor standing at it is the person who knows what actually went on it -
 * so that is where the document is now raised.
 *
 * This has moved twice and it is worth being plain about what the second move
 * costs, because it is not a detail. A dispatch cannot be posted without naming
 * the customer it goes to and the price it goes at. So anyone who can post one
 * can read the customer list and the rate against each grade, and there is no
 * arrangement in which a supervisor fills this form in and does not see them.
 * The list was previously shut for exactly that reason. It is open again
 * because the plant has decided the yard raising its own paperwork is worth
 * more than keeping the list off the floor - a commercial judgement, not a
 * technical one, and the only honest way to give the yard a working form.
 *
 * What did NOT move with it:
 *   - GET /stock, the packed-against-dispatched ledger the back office
 *     reconciles with. The yard reads /stock/summary, which carries what is
 *     there and what the lab said and nothing about what has been sold. See
 *     stock.service's two serializers.
 *   - PATCH /stock/:id/qc. Releasing goods for sale stays the office's.
 *   - Editing the rate card, the cost inputs and the customer records
 *     themselves. Reading a customer to dispatch to is not the same as being
 *     able to add, rename or reprice one.
 *
 * worker and lab are still refused everywhere here. See stock-access.test.js
 * for the assertions that hold this shape in place.
 */
export const DISPATCH_ROLES = [ROLES.SUPERVISOR, ...ADMIN_ROLES];

/**
 * Whose name may sign a record on the shop floor.
 *
 * The list behind the Supervisor pick on the sheets, which used to be three
 * names hard-coded into the web client and copied again into the Flutter app.
 * A supervisor renamed or added in the back office never reached either copy,
 * so the pick and the account list drifted apart - and the name that lands on a
 * run is the name the plant reads back off it months later.
 *
 * Deliberately not floorRoles: a worker holding the tablet signs with whoever
 * is supervising, which is what the pick is for, and lab accounts are not on
 * the floor at all. Mirrors SIGNER_ROLES in client/src/config/constants.ts.
 */
export const SIGNER_ROLES = [ROLES.SUPERVISOR, ...ADMIN_ROLES];

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

/**
 * Where a stock group stands with the lab. Only `pass` may be dispatched - the
 * check is in post_dispatch() rather than only in the screen, so a group on
 * hold cannot leave the yard however the request was made.
 */
export const QC_STATUSES = ['pass', 'fail', 'pending'];

/**
 * The three things a stock group can be, which is the three ways this plant
 * makes something it can sell.
 *
 *   batch    one grade off one special-line batch, certified as a lot.
 *   pool     the coarse line's ten-day period. Not batch-identified - the line
 *            runs for a shift, not for a batch.
 *   product  what a moulding press made, keyed on the product and the pack it
 *            is boxed in. Counted in pieces rather than sacks.
 *   lot      what a sleeve or loop shift made, keyed on its own batch number.
 *            Counted in pieces like a `product` group and certified per label
 *            like a `batch` one, which is why it is neither of them.
 */
export const STOCK_KINDS = ['batch', 'pool', 'product', 'lot'];

/**
 * What a stock count counts.
 *
 * Reclaim and coarse are bagged, so they are sacks. A press moulds finished
 * goods and counts them one at a time, so they are pieces. The column holding
 * the number is `packed_sacks` either way - see the note in schema.sql - and
 * this is what says what the number means. Every serializer, every screen and
 * every dispatch line reads it rather than assuming.
 */
export const STOCK_UNITS = ['sacks', 'pieces'];

/** Singular and plural, for a screen that has to name what it is counting. */
export const UNIT_NOUN = {
  sacks: { one: 'sack', many: 'sacks' },
  pieces: { one: 'piece', many: 'pieces' },
};

/** The coarse line is not batch-identified, so its sacks are pooled by period. */
export const COARSE_GRADE = 'Coarse';

/**
 * How the crew that loaded a vehicle was paid.
 *
 *   contract  a per-kg rate to the loading gang. What reclaim normally goes on.
 *   manhour   manpower allotted x time worked, at the daily-labour rate. The
 *             only method available for moulded goods, which have no per-kg
 *             contract behind them.
 *   mixed     both on the one job - a contract load that also had day labour
 *             on it.
 *
 * `mixed` is not a third form to fill in. It is what a contract load becomes
 * the moment anyone is entered against the man-hour fields, and the coercion is
 * in loadingEntry() below rather than in the screen: the rule is that daily
 * labour is accounted for wherever it worked, and a rule that depends on a
 * manager remembering to change a dropdown is not a rule.
 */
export const LOADING_MODES = ['contract', 'manhour', 'mixed'];

/**
 * What was loaded, as far as the costing is concerned. Moulded goods come off
 * the presses and have no per-kg loading contract, so they are costed by
 * man-hours and nothing else - see forcedLoadingMode().
 */
export const LOADING_MATERIALS = ['reclaim', 'moulded'];

/** Moulded goods have no per-kg contract, so man-hours are the only method. */
export const forcedLoadingMode = (material) => (material === 'moulded' ? 'manhour' : null);

export const MACHINE_KINDS = [
  'grind', 'autoclave', 'prerefiner', 'refiner', 'coarse', 'press', 'sleeve', 'loop',
];

/**
 * The activities that make finished goods a lot at a time - sleeve and loop.
 *
 * They sit beside the presses rather than inside them, and the difference is
 * what they are certified as. A press pools by the product and the pack it is
 * boxed in, so one verdict moves every loop the plant has ever made; sleeve and
 * loop are made a shift at a time and answered for a shift at a time, which is
 * how a batch of reclaim works. That is the whole reason they are their own
 * kinds: everything else about them - no meters, no hours, pieces against a
 * product - a press already does.
 *
 * A list rather than `kind === 'sleeve' || kind === 'loop'` at each use, because
 * a third one is a thing the plant could start making, and a hard-coded pair is
 * how that becomes a bug in five files.
 */
export const MOULDING_KINDS = ['sleeve', 'loop'];

export const isMoulding = (kind) => MOULDING_KINDS.includes(String(kind ?? ''));

/**
 * How far the count off the bench may differ from what the cycle and the mould
 * say before the run is flagged, as a percentage.
 *
 * A flag on any difference at all would fire on nearly every shift - a cycle
 * time is nominal and a run does not stop on a whole cycle - and a flag that
 * always fires is one nobody reads. Ten per cent is wide enough to leave an
 * ordinary shift alone and narrow enough that a mould running short, or a count
 * entered a digit out, shows up.
 */
export const PIECES_VARIANCE_PCT = 10;

/**
 * The finer name a machine is listed under in the back office.
 *
 * `kind` is what the run rules switch on - does it weigh, does it need a
 * quality, does it log bearings - and a cracker and a grinder answer all three
 * the same way, so both are `kind='grind'`. To anyone standing in front of them
 * they are two different machines, and this is the column that says so.
 */
export const MACHINE_TYPES = [
  'grinder', 'cracker', 'autoclave', 'prerefiner', 'refiner', 'press', 'sleeve', 'loop', 'other',
];

/**
 * The moulding presses. They mould finished goods out of reclaim compound rather
 * than making reclaim, so almost none of the plant's usual rules reach them: no
 * meters, no run hours, no energy, no bearings and nothing to weigh afterwards.
 * What they record is a count of pieces against a product.
 *
 * They do now have a packing path. A press run's pieces used to stop at the run
 * and reach the yard nowhere, so the Stock page - which is meant to be every
 * packed thing in the plant - could not see a shift's moulding at all. Boxing
 * them files a `product` stock group the same way bagging files a batch one.
 */
export const PRESS_IDS = ['PRS_P3', 'PRS_P5'];

/**
 * How many pieces are in a pack when the product does not say.
 *
 * Deliberately null rather than a number. A pack size guessed on the product's
 * behalf would put a pack count on the yard's screen that nobody set and nobody
 * could tell from one that was - so an unset product is boxed as loose pieces
 * and the screen says the pack is not set, which is a thing the back office can
 * then go and fix.
 */
export const DEFAULT_PACK_SIZE = null;

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

  /**
   * What packing files sacks into and a dispatch draws them out of: one group
   * per batch and grade on the special line, one per ten-day period on the
   * coarse line, which is not batch-identified. See utils/stockPeriod.js.
   */
  stockGroups: 'stock_groups',
  /** The priced rows of a dispatch: which group, how many sacks, at what price. */
  dispatchLines: 'dispatch_lines',

  /**
   * One loading job - one truck - and what it cost to load. Tied to the
   * dispatch rather than to a line, because a job covers whatever qualities
   * went onto that vehicle; the cost is split back across the lines by kg at
   * read time. See services/loading.service.js.
   */
  loadingActivities: 'loading_activities',

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
  /**
   * The labour rate with the date it came into force - one row per change, so a
   * run is costed at the rate of the day it was worked and a closed month stays
   * closed. See rate.service's labourRateAt().
   */
  labourRates: 'labour_rates',
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
 * The cracker. It is one of the grinding line's machines - GRINDER_IDS has it -
 * and it is singled out here for one reason: picking.
 *
 * Picking is the gang that pulls scrap tyres out of the yard and feeds them to
 * the cracker. It is the cracker's own labour and nothing else's, so it is the
 * cracker's stop sheet that asks how many were on it and for how long. Kept as
 * a list rather than as `id === 'CRK'` because a second cracker is a machine the
 * plant could buy, and a hard-coded id is how that purchase becomes a bug.
 */
export const CRACKER_IDS = ['CRK'];

export const isCracker = (machineId) => CRACKER_IDS.includes(machineId);

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
  // Day labour on a loading job, per labourer per hour. `loadingPerKg` above is
  // the other half - the gang's contract rate - and the two are read together
  // by loadingEntry() and copied onto the entry, never re-read afterwards.
  'loadingLabourPerHour',
  /**
   * The two figures the grinding line is costed on - see crumb.service.js.
   *
   * `pickingLabourPerHour` prices the gang that picks scrap tyres for the
   * cracker, and the crews on the cracker and the grinders themselves. A
   * labourer-hour is a labourer-hour, so one rate answers for all three rather
   * than three rates that would drift apart.
   *
   * `grinderKwhRate` is the grinding line's electricity. It is its own key
   * because `refinerKwhRate` above is the refiners' - the two lines are metered
   * separately and can sit on different tariffs - and it falls back to the
   * refiner rate on a plant that has only ever filled one of them in.
   */
  'pickingLabourPerHour',
  'grinderKwhRate',
];

/**
 * The labour rate the grinding line is costed at, kept with the date it came
 * into force rather than as one figure edited in place.
 *
 * `pickingLabourPerHour` above is the same number without a date on it, and it
 * stays as the fallback for a plant that has never entered a dated one and for
 * runs older than the earliest row. What it cannot do is leave a closed month
 * closed: raise it today and every hour ever picked re-prices. A dated row can,
 * which is why the costing reads this first - see rate.service's labourRateAt().
 *
 * A row may give `perHour` directly or give `dailyWage` over `shiftHours` and
 * let the per-hour figure be worked out. The plant hires by the day; asking a
 * yard supervisor to divide it in their head is asking for a typo.
 */
export const LABOUR_RATE_KEYS = ['perHour', 'dailyWage', 'shiftHours', 'effectiveFrom', 'note'];

/** A shift is twelve hours, which is what a day wage is assumed to cover. */
export const DEFAULT_SHIFT_HOURS = SHIFT_MINUTES / 60;

/**
 * What a kg of the crumb the grinding line makes costs in rubber, by the
 * feedstock it was made from. The works half - power, the crews and the picking
 * gang - is not here: it is worked out from the line's own runs rather than
 * typed in, which is the whole point of crumb.service.js.
 */
export const CRUMB_RATE_KEYS = {
  truck: 'crumbTruckPerKg',
  bike: 'crumbBikePerKg',
  drc: 'crumbDrcPerKg',
};

/** The two figures a loading entry snapshots off the settings, and their keys. */
export const LOADING_RATE_KEYS = {
  contractPerKg: 'loadingPerKg',
  labourPerHour: 'loadingLabourPerHour',
};

export default { ROLES, SHIFTS, QUALITIES, DISPATCH_GRADES, MACHINE_KINDS, PRICE_LIST, TABLES, VIEWS };
