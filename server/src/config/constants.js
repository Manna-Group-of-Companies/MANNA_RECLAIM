/** Shared domain vocabulary. Keep in sync with client/src/config/constants.ts */

export const ROLES = {
  WORKER: 'worker',
  SUPERVISOR: 'supervisor',
  LAB: 'lab',
  MANAGER: 'manager',
  ADMIN: 'admin',
  /**
   * The managing director. Reads the plant's summary and nothing else - see
   * SUMMARY_ROLES below, which is the only list this role appears in.
   */
  MD: 'md',
};

export const ADMIN_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

/**
 * Who may read the plant's summary reports.
 *
 * The managing director's whole account. It is deliberately its own list rather
 * than md being added to ADMIN_ROLES: ADMIN_ROLES is the back office, and the
 * back office writes - it sets the rate card, moves an ideal, corrects a run,
 * issues a dispatch and answers for a shift that came in short. An MD does none
 * of that. Widening ADMIN_ROLES would have handed over every one of those in a
 * single line, on a screen the MD never opens, which is the kind of grant nobody
 * reviews because nobody sees it happen.
 *
 * So this gates the GETs that answer "how is the plant doing" - the overview and
 * the shift efficiency - and every POST and PATCH on those same routes stays at
 * adminOnly. The MD reads the reasons a supervisor wrote; they do not write one.
 *
 * Costing, the machine log and the whole rate card are not here either. The
 * overview already carries the conversion cost and the dispatched value, which
 * is the figure an MD is after; what is behind those two routes is every run the
 * plant has ever logged with a price against it, which is a different question.
 */
export const SUMMARY_ROLES = [ROLES.MD, ...ADMIN_ROLES];

/**
 * Who may read how a shift did against the manager's benchmarks.
 *
 * The crew as well as the office, which is the point: the plant pays an
 * incentive on these figures, and a target somebody is paid against and cannot
 * see is not a target, it is a surprise at the end of the month. The supervisor
 * closes the shift and reads the same numbers the office will read.
 *
 * What this does NOT open is the money. /reports/costing, the machine log and
 * the rate card stay where they were - this is kg per man-hour and kWh per kg
 * against what they were meant to be, and carries no rate, no wage and no
 * customer. The crew is shown what it is judged on, not what it is worth.
 *
 * The reasons a supervisor is asked to write for a miss are a separate route and
 * stay with the back office. This screen reports; it does not interrogate.
 */
export const SHIFT_REVIEW_ROLES = [
  ROLES.WORKER,
  ROLES.SUPERVISOR,
  ROLES.MD,
  ...ADMIN_ROLES,
];

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

export const QUALITIES = ['Special', 'SuperFine', 'Fine', 'Medium', 'DRC', 'Special DRC'];

/**
 * The grades a batch is tracked as yielding: the rows of the batch card's grid,
 * what the supervisor may mark, and what the close rule counts.
 *
 * DRC is left out of the batch lifecycle on purpose. It stays a grade everywhere
 * else - a run can be logged as DRC, the lab can test it, and it keeps its own
 * quality chip - so nothing but the batch card and its rules leaves it alone.
 *
 * Special DRC is NOT the same case, despite the name. It is worked out of a
 * special charge the refiners take grades off, so it is marked, staged, weighed
 * and closed like any other grade, and a batch is exactly what it is tracked as.
 * The plant was writing it into the batch number by hand - "3084 special drc" -
 * to get it onto a screen at all, which put a grade in the one field every
 * record is keyed on.
 *
 * Kept as a list of its own rather than as a filter at each use, because the grid
 * the crew reads, the marked count the chip shows and the close rule all have to
 * be counting the same set. Mirrors BATCH_QUALITIES in the client's constants.
 */
export const BATCH_QUALITIES = ['Special', 'SuperFine', 'Fine', 'Medium', 'Special DRC'];

/**
 * The grades a particular charge is tracked in, where that is narrower than the
 * whole list above.
 *
 * A Special DRC charge comes off as Special DRC or as Special and as nothing
 * else, so its card offers those two rows and no others. Left as the full list
 * it offered three grades the charge cannot yield, which is not a harmless
 * extra row: a grade ticked by mistake has to be weighed before the batch will
 * close, and un-ticking it is refused once a refiner has run against it.
 *
 * Keyed on the grade the vessel was charged for - the quality on the load run,
 * not whatever has since been marked, or ticking the first row would rewrite
 * which rows exist. Anything not named here gets the full list, which is every
 * ordinary Special charge.
 */
export const BATCH_QUALITIES_BY_CHARGE = {
  'Special DRC': ['Special', 'Special DRC'],
};

/** The grid rows for a charge. Mirrors batchQualitiesFor in both clients. */
export const batchQualitiesFor = (chargeGrade) =>
  BATCH_QUALITIES_BY_CHARGE[chargeGrade] ?? BATCH_QUALITIES;

/**
 * What may go on a dispatch line - and, through isGrade() in stock.service, what
 * the server reads as a grade of rubber rather than a moulded product.
 *
 * Special DRC is here because it is a batch grade: a grade that can be packed
 * and cannot be dispatched is a dead end in the yard, and a lab verdict on one
 * would be filed as a press verdict by isGrade(). Plain DRC is still absent -
 * it never becomes a packed lot to sell. It carries no entry in PRICE_LIST
 * either, deliberately: the rate against a grade is the plant's to set on the
 * rate card, not this file's to invent.
 */
export const DISPATCH_GRADES = [
  'Special',
  'SuperFine',
  'Fine',
  'Medium',
  'Special DRC',
  'Coarse',
  'Sillsheet',
];

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
  /**
   * What the plant *should* make - one row, id 'current', every benchmark inside
   * `data`. The manager's own figures, and since the running-average baselines
   * were taken off the Efficiency tab, the only thing an actual is flagged
   * against. See migrations/0014.
   */
  idealValues: 'ideal_values',
  /** Why an actual missed its ideal, against the date, shift and parameter. */
  varianceReasons: 'variance_reasons',
  /**
   * Who operates the lines, and who was on which one for a given shift. Two
   * tables because they answer two questions - see migrations/0019.
   */
  operators: 'operators',
  shiftOperators: 'shift_operators',
  attendancePunches: 'attendance_punches',
  shiftLabour: 'shift_labour',
  /**
   * Stock as SAP holds it, and the record of each read of it.
   *
   * Two tables because a sync is two facts: what the stock is, and whether the
   * reading of it worked. A screen showing stock with no idea how old it is
   * will be believed on the day the script has been failing silently - see
   * migrations/0020.
   */
  sapStock: 'sap_stock',
  /** What has gone out, three months of it - see migrations/0021. */
  sapDispatches: 'sap_dispatches',
  /** One run table for both feeds, scoped by `feed`. */
  sapSyncs: 'sap_syncs',
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

/**
 * The machine list, cut the way somebody reading the record asks for it.
 *
 * "Show me the autoclaves" is a question the History tab could not answer: it
 * offered one machine or all of them, so comparing the three vessels meant
 * reading the page three times and adding it up on paper.
 *
 * Cut by kind rather than by the machines table's `group_name`, which is a
 * heading on the shop-floor screen and is edited to suit it. A category that
 * moved because somebody renamed a heading would quietly change what a month's
 * comparison covered, and nothing on the screen would say so.
 *
 * The cracker is carved out of the grinders on purpose. It shares their kind -
 * it is on the grinding line and the plant groups it there - but it grinds
 * nothing: it breaks tyres for the yard, weighs no output, and averaged in with
 * three grinders it drags every figure they are judged on. Somebody asking for
 * the grinders means the three that grind.
 */
export const MACHINE_CATEGORIES = [
  { key: 'grinders', label: 'Grinders', kinds: ['grind'], exclude: CRACKER_IDS },
  { key: 'cracker', label: 'Cracker', ids: CRACKER_IDS },
  { key: 'refiners', label: 'Refiners', kinds: ['refiner', 'prerefiner'] },
  { key: 'autoclaves', label: 'Autoclaves', kinds: ['autoclave'] },
  { key: 'coarse', label: 'Coarse line', kinds: ['coarse'] },
  { key: 'presses', label: 'Presses', kinds: ['press', 'sleeve', 'loop'] },
];

export const MACHINE_CATEGORY_KEYS = MACHINE_CATEGORIES.map((c) => c.key);

/**
 * Which machines a category covers, worked out against the plant's own machine
 * list rather than written down twice - a machine added next year lands in its
 * category because of its kind, not because somebody remembered this file.
 */
export const machinesInCategory = (key, machines = []) => {
  const category = MACHINE_CATEGORIES.find((c) => c.key === key);
  if (!category) return [];
  if (category.ids) return machines.filter((m) => category.ids.includes(m.id)).map((m) => m.id);
  return machines
    .filter((m) => category.kinds.includes(m.kind) && !(category.exclude ?? []).includes(m.id))
    .map((m) => m.id);
};

/** A shift is 12 hours; a bearing over this many degrees is flagged. */
export const SHIFT_MINUTES = 720;
export const BEARING_TEMP_LIMIT_C = 80;

/**
 * The one flag on the Efficiency tab that is not a manager's benchmark.
 *
 * Utilisation is a fraction of the shift itself - twelve hours is twelve hours,
 * whatever the plant has averaged - so it is a fixed standard, not a figure that
 * moves with the plant's history, and it stays.
 *
 * Three thresholds that used to sit here are gone: labour, energy and yield,
 * each of which was a fraction of the plant's own median. A median answers "is
 * this shift worse than usual" and cannot answer "is usual any good" - a line
 * that has run 15% under capacity for two years has a median that says so, and a
 * screen that never once flags it. Worse for a screen meant to hold people to
 * account, it moves: a bad month lowers the bar the next month is judged by, so
 * the same figure could be a miss in March and a pass in June. Those three
 * comparisons are now made against IDEAL_VALUE_FIELDS below and nothing else.
 */
export const EFFICIENCY_THRESHOLDS = {
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

/**
 * ---------------------------------------------------------------------------
 * Ideal values - what the plant should be making, as the manager sets it
 * ---------------------------------------------------------------------------
 *
 * These are what the Efficiency tab flags against, and now the only thing it
 * flags against. It used to compare every figure with the plant's own median as
 * well; see the note on EFFICIENCY_THRESHOLDS above for why a bar that the plant
 * sets by drifting is no bar at all on a screen whose whole job is to ask a
 * supervisor why a shift came in short.
 *
 * Every one of them is compared against a figure the app already collects, and
 * that is the whole test for whether a benchmark belongs here: an ideal with
 * nothing to sit beside is a number in a form. The converse now bites too - a
 * figure on that screen with no ideal against it is never flagged and nobody is
 * ever asked about it, so anything the plant means to hold a shift to has to
 * have a row here.
 */

/**
 * The lines that are given an ideal production per shift.
 *
 * The three grinders and the coarse line, each of which weighs a shift's output
 * as one figure. The cracker is deliberately absent - it weighs nothing, because
 * what it cracks is weighed downstream at the grinders, so an ideal against it
 * would compare a target with a permanent blank.
 *
 * The special line is not here either, and for the opposite reason: it comes off
 * in grades and is benchmarked per grade below.
 */
export const IDEAL_PRODUCTION_LINES = [
  { key: 'GRD_K', label: 'Grinder 1' },
  { key: 'GRD_S', label: 'Grinder 2' },
  { key: 'GRD_O', label: 'Soorya Grinder' },
  { key: 'COARSE', label: 'Coarse line' },
];

/**
 * The grinders on their own, where something is about grinding specifically.
 *
 * Not the list to benchmark efficiency against - see IDEAL_EFFICIENCY_LINES.
 */
export const IDEAL_GRINDERS = IDEAL_PRODUCTION_LINES.filter((l) => l.key !== 'COARSE');

/**
 * The lines given an energy and a labour benchmark: the three grinders and the
 * coarse line.
 *
 * The coarse line was left out of both until now, and there was no reason for it
 * beyond the list being called "grinders". It weighs its output as one figure
 * like a grinder does, its runs carry crew, hours and a meter reading like a
 * grinder's do, and the arithmetic is the same - so the only thing the omission
 * achieved was a line that could burn any amount of electricity per kg without
 * the screen ever asking about it. Every other weighing line on the plant is
 * answerable for those two.
 */
export const IDEAL_EFFICIENCY_LINES = IDEAL_PRODUCTION_LINES;

/**
 * The autoclaves the plant runs, benchmarked on runs per day rather than per
 * shift - a vessel is charged, cooked and emptied across whatever shift boundary
 * falls in the middle, so counting a day's charges is the only count that does
 * not depend on where the crew changed over.
 *
 * A and M only: N and O are seeded disabled and have been for the life of this
 * project (see devSeed and schema.sql). If either is brought back, add it here
 * and the comparison follows.
 */
/**
 * The machines given a utilisation target: how much of the shift they should be
 * turning.
 *
 * Every machine the plant runs except the two presses, which record no hours at
 * all - five press runs on the whole record and not one of them with a figure
 * against it. A target on a machine that cannot report the number it is judged
 * on is a row that is permanently blank on the screen and permanently unmet on
 * the report.
 *
 * The Soorya Grinder is here despite never having had a run logged. It is on the
 * plant and enabled, and a machine that is never switched on is exactly what a
 * utilisation target is for.
 */
export const IDEAL_UTILISATION_MACHINES = [
  { key: 'CRK', label: 'Cracker' },
  { key: 'GRD_K', label: 'Grinder 1' },
  { key: 'GRD_S', label: 'Grinder 2' },
  { key: 'GRD_O', label: 'Soorya Grinder' },
  { key: 'PR1', label: 'Pre-Refiner 1' },
  { key: 'PR2', label: 'Pre-Refiner 2' },
  { key: 'R1', label: 'Refiner 1' },
  { key: 'R2', label: 'Refiner 2' },
  { key: 'R3', label: 'Refiner 3' },
  { key: 'R4', label: 'Refiner 4' },
  { key: 'AC_A', label: 'Autoclave A' },
  { key: 'AC_M', label: 'Autoclave M' },
];

export const IDEAL_AUTOCLAVES = [
  { key: 'AC_A', label: 'Autoclave A' },
  { key: 'AC_M', label: 'Autoclave M' },
];

/** The special line's benchmarks are per grade - see IDEAL_PRODUCTION_LINES. */
export const SPECIAL_LINE_KEY = 'SPECIAL';

/**
 * The stations an operator is assigned to, and the whole list of them.
 *
 * A line, not a machine. The plant is operated in lines: the coarse line is PR1
 * and R2 worked as one, the special line is the refiners together, and the
 * autoclaves are a pair one person charges. Only the grinders and the cracker
 * are a machine each. So four of these seven are not machines at all, which is
 * why an assignment names a station rather than pointing at `machines`.
 *
 * The cracker is here and has no ideal value of its own - it weighs nothing,
 * because what it cracks is weighed downstream at the grinders. Somebody still
 * runs it, and a station list built only out of the things with benchmarks would
 * have left the man on the cracker off the plant's roster.
 *
 * Ordered as the shop floor reads them: raw tyre in at the top, refined grade
 * out at the bottom.
 */
export const OPERATOR_STATIONS = [
  { key: 'CRK', label: 'Cracker' },
  { key: 'GRD_K', label: 'Grinder 1' },
  { key: 'GRD_S', label: 'Grinder 2' },
  { key: 'GRD_O', label: 'Soorya Grinder' },
  { key: 'AUTOCLAVES', label: 'Autoclaves' },
  { key: SPECIAL_LINE_KEY, label: 'Special line' },
  { key: 'COARSE', label: 'Coarse line' },
];

export const OPERATOR_STATION_KEYS = OPERATOR_STATIONS.map((s) => s.key);

/**
 * Where a pair of hands can be put for a shift, beyond the machines.
 *
 * The labour board is a different question from the roster above and takes a
 * different list. The roster names who is answerable for a line - one name, and
 * the incentive is paid on it - so its stations are lines. This is where every
 * person who came through the gate actually spent the shift, and a supervisor
 * deploying eleven people thinks in machines: two on the grinder, three on the
 * special line's refiners, one on the cracker.
 *
 * So the board offers the machines themselves, and these. Packing and cleaning
 * are work: they take hands off the lines for a whole shift, and a board that
 * could not say so would show a supervisor assigning eleven people to fourteen
 * machines and leave him wondering where the other six had gone. Neither is a
 * row in `machines` and neither should be - nothing runs, nothing is weighed and
 * nothing has a meter.
 *
 * Add to this list to add a station. It is the only place the board's
 * off-machine stations are named.
 */
export const OFF_MACHINE_STATIONS = [
  { key: 'PACKING', label: 'Packing', kind: 'packing' },
  { key: 'CLEANING', label: 'Cleaning', kind: 'cleaning' },
];

/**
 * Which station's figures a machine's runs belong to.
 *
 * The efficiency cards are keyed per machine and per grade; the roster is keyed
 * per line. This is the one place the two are joined, so a card can name who was
 * responsible for it without every card working the mapping out again.
 */
export const STATION_OF_MACHINE = {
  CRK: 'CRK',
  GRD_K: 'GRD_K',
  GRD_S: 'GRD_S',
  GRD_O: 'GRD_O',
  AC_A: 'AUTOCLAVES',
  AC_M: 'AUTOCLAVES',
  AC_N: 'AUTOCLAVES',
  AC_O: 'AUTOCLAVES',
  PR2: SPECIAL_LINE_KEY,
  R1: SPECIAL_LINE_KEY,
  R3: SPECIAL_LINE_KEY,
  R4: SPECIAL_LINE_KEY,
  PR1: 'COARSE',
  R2: 'COARSE',
};

/**
 * How a benchmark is named inside `ideal_values.data`.
 *
 * Built rather than written out, so the form, the whitelist and the comparison
 * cannot disagree about what a figure is called - a target saved under one
 * spelling and read under another is a target that silently never applies.
 */
export const idealKey = {
  production: (key) => `prod.${key}`,
  /**
   * There is deliberately no per-grade production key for the special line.
   *
   * One autoclave charge is worked into sheets of several grades at once, and
   * how much of each comes off R4 is a market decision taken that week - more
   * Special this month, more SuperFine next. A kg/shift target per grade would
   * therefore flag the plant for making what it was asked to make, and a
   * supervisor would be writing a reason for following an order.
   *
   * What does not move with the grade split is how efficiently the line runs,
   * so the special line is benchmarked on kg per man-hour and kWh per kg alone -
   * see specialPerManHour and specialKwhPerKg below. The grade's output is still
   * shown on the card; it is context, not a target.
   */
  autoclaveRuns: (key) => `runs.${key}`,
  /**
   * How long one charge should take, in hours.
   *
   * Per vessel, because they are not the same vessel: across the whole record
   * Autoclave A runs a median 8.3 h a charge and M 7.4, and one target for both
   * would flag the slower one on every charge it ever cooked correctly.
   *
   * This is what the plant judges a vessel on, rather than how many charges it
   * got through in a day. A count per day is a fact about how much work there
   * was - a quiet day is not a slow vessel - and the crew cannot answer for it.
   * How long each charge took is the vessel's own, and it is the figure that
   * moves when a valve is passing or the fire is not being kept up.
   */
  autoclaveCycle: (key) => `cycle.${key}`,
  kwhPerKg: (key) => `kwhkg.${key}`,
  specialKwhPerKg: (quality) => `kwhkg.${SPECIAL_LINE_KEY}.${quality}`,
  perManHour: (key) => `pmh.${key}`,
  specialPerManHour: (quality) => `pmh.${SPECIAL_LINE_KEY}.${quality}`,
  /**
   * What a charge should yield, as a percentage of what went into it.
   *
   * One figure for the plant, not one per vessel and not one per grade. A batch
   * is charged as a charge and weighed out across whatever grades it came off
   * as, so the yield is the material's, not the vessel's and not any one
   * grade's - and a target split three ways would be three targets nobody could
   * add back up to the one the plant actually cares about.
   *
   * It has a key at all because yield used to be flagged against the median
   * yield of every batch on record. Taking that away without putting a target
   * in its place would have left the one figure that says how much rubber the
   * plant is throwing away as the only thing on the screen nobody is ever asked
   * about.
   */
  /**
   * How much of a twelve-hour shift a machine should actually be running.
   *
   * Per machine, not per line, because it is a fact about a machine: the coarse
   * line is PR1 and R2 and they do not run for the same hours - PR1 pre-refines
   * for ten or twelve while R2 finishes in four or five. One target across both
   * would flag whichever of them is meant to run less.
   *
   * This used to be the one flag on the efficiency screen that was not a
   * manager's benchmark - measured against a fixed threshold on the reasoning
   * that twelve hours is twelve hours whatever the plant has averaged. The plant
   * has asked for a target it sets instead, which is the plant's call: a fixed
   * bar treats a vessel that cooks for eight hours and a grinder that should run
   * all twelve as the same question, and they are not.
   */
  utilisation: (key) => `util.${key}`,

  batchYield: () => 'yield.BATCH',
};

/**
 * Every benchmark the manager may set, with what it is called on screen and the
 * unit it is in. `lowerIsBetter` is what says which side of the ideal counts as
 * a shortfall: more kg is better, fewer kWh per kg is better, and a comparison
 * that does not know the difference flags every good shift on the energy line.
 *
 * The client mirrors this as IDEAL_VALUE_GROUPS in config/constants.ts, which is
 * the same arrangement laid out as a form. Keep the keys in step.
 */
export const IDEAL_VALUE_FIELDS = [
  ...IDEAL_PRODUCTION_LINES.map((line) => ({
    key: idealKey.production(line.key),
    label: `${line.label} — production`,
    unit: 'kg/shift',
    lowerIsBetter: false,
  })),
  ...IDEAL_AUTOCLAVES.map((vessel) => ({
    key: idealKey.autoclaveCycle(vessel.key),
    label: `${vessel.label} — time a charge`,
    unit: 'h/charge',
    lowerIsBetter: true,
  })),
  ...IDEAL_AUTOCLAVES.map((vessel) => ({
    key: idealKey.autoclaveRuns(vessel.key),
    label: `${vessel.label} — runs`,
    unit: 'runs/day',
    lowerIsBetter: false,
  })),
  {
    key: idealKey.batchYield(),
    label: 'Batch yield',
    unit: '%',
    lowerIsBetter: false,
  },
  ...IDEAL_UTILISATION_MACHINES.map((machine) => ({
    key: idealKey.utilisation(machine.key),
    label: `${machine.label} — utilisation`,
    unit: '%',
    lowerIsBetter: false,
  })),
  ...IDEAL_EFFICIENCY_LINES.map((line) => ({
    key: idealKey.kwhPerKg(line.key),
    label: `${line.label} — energy`,
    unit: 'kWh/kg',
    lowerIsBetter: true,
  })),
  ...QUALITIES.map((quality) => ({
    key: idealKey.specialKwhPerKg(quality),
    label: `Special line ${quality} — energy`,
    unit: 'kWh/kg',
    lowerIsBetter: true,
  })),
  ...IDEAL_EFFICIENCY_LINES.map((line) => ({
    key: idealKey.perManHour(line.key),
    label: `${line.label} — labour productivity`,
    unit: 'kg/man-hour',
    lowerIsBetter: false,
  })),
  ...QUALITIES.map((quality) => ({
    key: idealKey.specialPerManHour(quality),
    label: `Special line ${quality} — labour productivity`,
    unit: 'kg/man-hour',
    lowerIsBetter: false,
  })),
];

/** The whitelist a save is filtered through - anything else is dropped. */
export const IDEAL_VALUE_KEYS = IDEAL_VALUE_FIELDS.map((f) => f.key);

const IDEAL_FIELD_BY_KEY = Object.fromEntries(IDEAL_VALUE_FIELDS.map((f) => [f.key, f]));

export const idealFieldFor = (key) => IDEAL_FIELD_BY_KEY[key] ?? null;

export default { ROLES, SHIFTS, QUALITIES, DISPATCH_GRADES, MACHINE_KINDS, PRICE_LIST, TABLES, VIEWS };
