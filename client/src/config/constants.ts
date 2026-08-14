import type { Quality, DispatchGrade, Role, Shift, StockUnit } from '@/types/models';

/** Mirrors server/src/config/constants.js - keep both sides in step. */
export const ROLES: Record<string, Role> = {
  WORKER: 'worker',
  SUPERVISOR: 'supervisor',
  LAB: 'lab',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

export const ADMIN_ROLES: Role[] = ['manager', 'admin'];

/**
 * Who may delete, as opposed to who may correct.
 *
 * The admin account alone - deliberately narrower than ADMIN_ROLES, which is
 * what "the back office" means everywhere else in this file. It gates the three
 * destructive controls on the shop-floor tabs: clearing a weighing on Weigh,
 * clearing an emptied group on Stock, and taking a verdict off the record on
 * Quality.
 *
 * A manager loses nothing they can do twice. Weighing again, re-testing,
 * re-packing and setting a QC verdict by hand are all still theirs, and each of
 * those can be taken back by doing it again. What is behind this list is the
 * half that cannot: no screen in this app puts a deleted verdict, a cleared
 * weighing or a removed yard row back.
 *
 * Mirrors DELETE_ROLES on the server, which is where it is actually enforced.
 * This one only keeps a screen from offering a tap that comes back 403.
 */
export const DELETE_ROLES: Role[] = ['admin'];

/**
 * Who may issue a dispatch, and therefore who is shown the customer list.
 *
 * The yard as well as the back office. The vehicle is loaded at the yard and
 * the supervisor standing at it knows what went on it, so that is where the
 * document is raised.
 *
 * The cost is real and worth stating: a dispatch names the customer it goes to
 * and the price it goes at, so everyone on this list can read the customer list
 * and the rate against each grade. That is a commercial judgement the plant
 * made deliberately - see the longer note on DISPATCH_ROLES in
 * server/src/config/constants.js for what did and did not move with it.
 *
 * Mirrors the server's list, which is where it is actually enforced. This one
 * only keeps a screen from asking for something it will be refused.
 */
export const DISPATCH_ROLES: Role[] = ['supervisor', 'manager', 'admin'];

/**
 * Who gets which half of the shop-floor app.
 *
 * Quality is the bench's page: the lab tests what the plant made and signs the
 * batch off. A supervisor and a worker have no business either recording that
 * verdict or seeing an untested batch as their problem, so it is not in their
 * half - and a lab account gets Quality and nothing else, because the floor's
 * work is not theirs either. Settings sits outside both lists, because every
 * account needs a way back out.
 *
 * The two lists therefore overlap in exactly one place: manager and admin are
 * on both. They are the accounts the server already trusts to write a verdict -
 * QUALITY_WRITE_ROLES is lab plus these two - so hiding the page from them was
 * hiding a page they were entitled to, and they arrived at it through the back
 * office or not at all. The back office keeps the lab record, which is the
 * reading; this is the writing, and it is the bench's own screen either way.
 */
export const LAB_ROLES: Role[] = ['lab', 'manager', 'admin'];

export const FLOOR_ROLES: Role[] = ['worker', 'supervisor', 'manager', 'admin'];

export const SHIFTS: Shift[] = ['Day', 'Night'];

export const QUALITIES: Quality[] = [
  'Special',
  'SuperFine',
  'Fine',
  'Medium',
  'DRC',
  'Special DRC',
];

/**
 * The grades a batch is tracked as yielding - the rows of the batch card's grid.
 *
 * Both DRC grades are left out of the batch lifecycle on purpose. They stay
 * grades everywhere else: a refiner run can be logged as DRC or Special DRC, the
 * lab tests either, and each keeps its own quality chip - only the batch card
 * and its rules leave them alone. The API counts the same set, so the grid, the
 * state chip and the close rule cannot disagree - mirrors BATCH_QUALITIES in
 * server/src/config/constants.js.
 */
export const BATCH_QUALITIES: Quality[] = ['Special', 'SuperFine', 'Fine', 'Medium'];

export const DISPATCH_GRADES: DispatchGrade[] = [
  'Special',
  'SuperFine',
  'Fine',
  'Medium',
  'Coarse',
  'Sillsheet',
];

export const PRICE_LIST: Record<string, number> = {
  Special: 48,
  SuperFine: 47,
  Fine: 43,
  Medium: 41,
  Coarse: 36,
};

/** Tailwind classes per quality chip, used by the Badge component. */
export const QUALITY_CLASS: Record<Quality, string> = {
  Special: 'bg-quality-special text-quality-on',
  SuperFine: 'bg-quality-superfine text-quality-on',
  Fine: 'bg-quality-fine text-quality-on',
  Medium: 'bg-quality-medium text-quality-on',
  DRC: 'bg-quality-drc text-quality-on',
  'Special DRC': 'bg-quality-special-drc text-quality-on',
};

export const FIREWOOD_KG_PER_LOAD = 550;

/** A coarse load is a shorter cook than a special one, so it burns less. */
export const FIREWOOD_KG_PER_COARSE_LOAD = 400;

/**
 * What an autoclave can be charged with. A special load opens a batch the
 * refiners then work through; a coarse load feeds the coarse line for the shift
 * and never becomes a batch of its own. `grade` is the chip the pick wears -
 * the grade itself is decided at the refiner, not at the autoclave.
 */
export interface AutoclaveForm {
  name: string;
  capacity: number;
  type: 'special' | 'coarse';
  grade?: Quality;
}

export const AUTOCLAVE_FORMS: AutoclaveForm[] = [
  { name: 'Special 2200', capacity: 2200, type: 'special', grade: 'Special' },
  { name: 'Special 2500', capacity: 2500, type: 'special', grade: 'Special' },
  { name: 'DRC 2200', capacity: 2200, type: 'special', grade: 'DRC' },
  { name: 'DRC 2500', capacity: 2500, type: 'special', grade: 'DRC' },
  { name: 'Special DRC 2200', capacity: 2200, type: 'special', grade: 'Special DRC' },
  { name: 'Special DRC 2500', capacity: 2500, type: 'special', grade: 'Special DRC' },
  { name: 'Coarse 2200', capacity: 2200, type: 'coarse' },
  { name: 'Coarse 2500', capacity: 2500, type: 'coarse' },
];

/** The formulations that fit this vessel - specials first, then coarse. */
export const autoclaveFormsFor = (capacity?: number | null): AutoclaveForm[] =>
  capacity == null ? [] : AUTOCLAVE_FORMS.filter((f) => f.capacity === capacity);

/**
 * The grades that ride the special vessels but are counted by their runs.
 *
 * A list rather than a `!== 'DRC'` at the one place that asks, because there are
 * two of them now: adding Special DRC to the charge picks without adding it here
 * would have opened a batch whose grid has no row it could ever mark.
 */
const RUN_COUNTED_GRADES: Quality[] = ['DRC', 'Special DRC'];

/**
 * Whether charging this formulation opens a batch the refiners work through.
 *
 * Only a special charge does, and not every special-vessel charge is one. A
 * coarse charge feeds the coarse line for the shift and a DRC charge - either
 * grade - is counted by its runs; none of them is marked, staged or weighed in
 * grades, so a batch record for one would sit on the list with nothing able to
 * move it off. All are still logged as runs, which is what dispatch, history and
 * the costing read. The API applies the same rule and refuses them.
 */
export const opensBatch = (form?: AutoclaveForm | null): boolean =>
  form?.type === 'special' && !RUN_COUNTED_GRADES.includes(form.grade as Quality);

/**
 * Two hands charge two autoclaves between them, so a paired load costs one
 * worker; charged on its own it takes both.
 */
export const autoclaveWorkers = (paired: boolean) => (paired ? 1 : 2);

/** One packed sack. Anything under this is carried into the next batch. */
export const SACK_KG = 50;

/**
 * What a stock count counts, and how to say it.
 *
 * Reclaim and coarse are bagged, so they are sacks. A moulding press makes
 * finished goods and counts them one at a time, so they are pieces. Both live in
 * the same field on a stock group and on a dispatch line - see the note in
 * server/src/services/stock.service.js - so `unit` is the only thing standing
 * between "4,000 loops" and a screen reading four thousand sacks.
 *
 * Kept here rather than in each screen because that is exactly the sort of
 * two-line table that gets copied into a third file with `sacks` hard-coded, and
 * the whole point of the field is that nothing assumes.
 */
export const UNIT_NOUN: Record<StockUnit, { one: string; many: string }> = {
  sacks: { one: 'sack', many: 'sacks' },
  pieces: { one: 'piece', many: 'pieces' },
};

/** "40 sacks", "1 piece" - a count that says what it is counting. */
export const counted = (n: number, unit: StockUnit = 'sacks') =>
  `${n} ${n === 1 ? UNIT_NOUN[unit].one : UNIT_NOUN[unit].many}`;

/**
 * How many weighed runs the Weigh tab lists before its Show all. The plant has
 * years of them and a correction is nearly always to something weighed this
 * shift, so the tab opens on the newest handful rather than the whole record.
 */
export const WEIGHED_PAGE = 20;

/** A bearing over this is drawn in red on the back office's trend charts. */
export const BEARING_TEMP_LIMIT_C = 80;

/** The accent each machine kind gets on its card rail and CTA. */
export const KIND_ACCENT: Record<string, string> = {
  grind: 'var(--steel)',
  autoclave: 'var(--ember)',
  coarse: 'var(--ember)',
  prerefiner: 'var(--elec)',
  refiner: 'var(--elec)',
  press: 'var(--brand)',
  // Sleeve and loop get a colour each rather than sharing one. They are two
  // activities on two cards, and a crew glancing at the screen mid-shift picks
  // the card out by its rail before it reads the name.
  sleeve: '#7ec9a0',
  loop: '#c99ade',
};

/**
 * The moulding presses. They mould finished goods out of reclaim compound rather
 * than making reclaim, so none of the plant's usual machinery reaches them: no
 * meters, no energy, no run hours, no bearing temperatures, nothing for the Weigh
 * tab and no packing path. What a press run records is pieces against a product.
 */
export const PRESS_IDS = ['PRS_P3', 'PRS_P5'];

/**
 * Sleeve and loop - the two activities that make finished goods a lot at a time.
 *
 * They sit beside the presses rather than inside them, and the difference is
 * what they are certified as. A press pools by the product and the pack it is
 * boxed in, so one verdict moves every loop the plant has ever made; sleeve and
 * loop are made a shift at a time under a generated batch number and answered
 * for a shift at a time, which is how a batch of reclaim works.
 *
 * Everything else about them a press already does: no meters, no hours, no
 * bearings, pieces counted against a product.
 *
 * Mirrors MOULDING_KINDS in server/src/config/constants.js.
 */
export const MOULDING_KINDS = ['sleeve', 'loop'];

export const isMoulding = (kind?: string | null) =>
  Boolean(kind) && MOULDING_KINDS.includes(kind as string);

/**
 * How far the count off the bench may sit from what the cycle and the mould say
 * before the run is flagged, as a percentage.
 *
 * A flag on any difference at all would fire on nearly every shift - a cycle
 * time is nominal, and a run does not stop on a whole cycle - and a flag that
 * always fires is one nobody reads.
 *
 * Mirrors PIECES_VARIANCE_PCT on the server, which is where the flag that gets
 * stored is actually decided. This one only draws it.
 */
export const PIECES_VARIANCE_PCT = 10;

/** The two feedstocks the grinding line runs on, and the crumb each yields. */
export const TYRES = {
  truck: { label: 'Truck tyre', mesh: '30#' },
  bike: { label: 'Bike tyre', mesh: '20#' },
} as const;

export type TyreType = keyof typeof TYRES;

/**
 * The cracker, singled out of the grinding line for one thing: picking.
 *
 * Picking is the gang that pulls scrap tyres out of the yard and feeds them to
 * the cracker - the first labour spent on a kg of reclaim. It is the cracker's
 * own and nothing else's, so the cracker's stop sheet is the only one that asks
 * for it, and the API drops it from anything else. A list rather than an id
 * because a second cracker is a machine the plant could buy.
 *
 * Mirrors CRACKER_IDS in server/src/config/constants.js.
 */
export const CRACKER_IDS = ['CRK'];

export const isCracker = (machineId?: string | null) =>
  Boolean(machineId) && CRACKER_IDS.includes(machineId as string);

/** The clock each shift covers, shown under the shift picks. */
export const SHIFT_HOURS: Record<Shift, string> = {
  Day: '08:30 – 20:30',
  Night: '20:30 – 08:30',
};

/**
 * The crew a machine usually runs with, prefilled at stop so the common case is
 * a glance rather than a keystroke. The grinders run one hand by day and two by
 * night; everything shiftwise that is not listed runs two.
 */
export const defaultWorkers = (machineId: string, shift: Shift, shiftwise: boolean): number | null => {
  switch (machineId) {
    case 'PR1':
    case 'PR2':
      return 3;
    case 'R1':
    case 'R3':
      return 2;
    case 'R2':
    case 'R4':
      return 3;
    case 'CRK':
      return 2;
    case 'GRD_K':
    case 'GRD_S':
      return shift === 'Night' ? 2 : 1;
    // A press is worked by two hands - one on the mould, one trimming - day and
    // night alike. The spec asks for "the press's default crew" without naming a
    // figure; this is that figure, and the stop sheet still lets the crew say
    // otherwise.
    case 'PRS_P3':
    case 'PRS_P5':
      return 2;
    // Sleeve and loop are worked the same way and by the same number of hands -
    // one on the bench, one trimming and counting. The stop sheet still lets the
    // crew say otherwise, and it is their figure the labour cost is worked out
    // from, so this is a starting point rather than an assumption.
    case 'SLEEVE':
    case 'LOOP':
      return 2;
    default:
      return shiftwise ? 2 : null;
  }
};

/** Soorya is metered on one phase only - see the note on both its sheets. */
export const TOD_MACHINE_ID = 'GRD_O';

/**
 * Supervisors who sign for a shift, as the prototype hard-coded them.
 *
 * Only the fallback now: the pick reads the plant's own accounts from
 * GET /users/signers, so a supervisor renamed or added in the back office
 * reaches the floor instead of drifting from this list. This is what a device
 * that has never reached the server is left with - see hooks/useSupervisor.
 */
export const SUPERVISORS = ['Mathai', 'Rahul', 'Devanand'];

/** Customers on the reclaim price list, in the prototype's order. */
export const CUSTOMERS = [
  'UNITED', 'TEE PEE', 'ALEXCO', 'AARSON', 'DOLPHIN', 'ESTEEM', 'ALEENA', 'EASTERN',
  'VAJRA', 'JETLUX', 'VISHAL', 'CONSOSIUM', 'G.P.T', 'SUN', 'MAHIMA', 'PEINCHERIL',
  'BLUE MOUNT', 'MS', 'MET CL',
];

export interface CostRateField {
  key: string;
  label: string;
  unit?: string;
  hint?: string;
}

export interface CostRateGroup {
  title: string;
  /** Aside on the group heading, e.g. "only when provided". */
  note?: string;
  fields: CostRateField[];
}

/**
 * The plant's cost inputs, grouped as back.html's Rates tab asks for them.
 * Keys must match server/src/config/constants.js COST_RATE_KEYS.
 */
export const COST_RATE_GROUPS: CostRateGroup[] = [
  {
    title: 'Raw materials',
    note: 'the rubber only — the grinding line adds its own works cost',
    fields: [
      {
        key: 'crumbTruckPerKg',
        label: 'Rubber crumb — Truck',
        unit: '₹/kg',
        hint: 'The rubber in a kg of crumb; power, crews and picking are added from the line',
      },
      { key: 'crumbBikePerKg', label: 'Rubber crumb — Bike', unit: '₹/kg' },
      { key: 'crumbDrcPerKg', label: 'Rubber crumb — DRC', unit: '₹/kg' },
      { key: 'raPerKg', label: 'Reclaiming agent (RA)', unit: '₹/kg' },
      { key: 'rpoPerKg', label: 'Rubber processing oil (RPO)', unit: '₹/kg' },
      { key: 'pineTarPerKg', label: 'Pine tar', unit: '₹/kg' },
      { key: 'waterPerL', label: 'Water', unit: '₹/L' },
    ],
  },
  {
    title: 'Packing',
    fields: [
      { key: 'packLabourPerSack', label: 'Packing labour', unit: '₹/sack', hint: 'Costed per kg at 50 kg/sack' },
      { key: 'packMaterialPerSack', label: 'Packing raw material', unit: '₹/sack', hint: 'Costed per kg at 50 kg/sack' },
    ],
  },
  {
    title: 'Loading',
    note: 'costed at dispatch, not in ₹/kg',
    fields: [
      {
        key: 'loadingPerKg',
        label: 'Contract rate',
        unit: '₹/kg',
        hint: 'One plant-wide rate to the loading gang',
      },
      {
        key: 'loadingLabourPerHour',
        label: 'Daily labour',
        unit: '₹/labourer/hour',
        hint: 'Man-hour rate — the only method for moulded goods',
      },
    ],
  },
  {
    title: 'Transport',
    note: 'only when provided',
    fields: [
      { key: 'transDriverPerKg', label: 'Driver cost', unit: '₹/kg' },
      { key: 'transVehiclePerKm', label: 'Vehicle cost', unit: '₹/km', hint: '× distance entered at dispatch' },
      { key: 'transFuelPerKm', label: 'Fuel cost', unit: '₹/km', hint: '× distance entered at dispatch' },
    ],
  },
  {
    title: 'Grinding line',
    note: 'flows into ₹/kg crumb, and from there into the reclaim',
    fields: [
      {
        key: 'pickingLabourPerHour',
        label: 'Picking & line labour',
        unit: '₹/labourer/hour',
        hint: 'The yard gang that feeds the cracker, and the cracker and grinder crews',
      },
      {
        key: 'grinderKwhRate',
        label: 'Grinding electricity',
        unit: '₹/kWh',
        hint: 'Cracker and grinders — falls back to the refiner rate if left blank',
      },
    ],
  },
  {
    title: 'Energy & fuel',
    fields: [
      { key: 'firewoodPerKg', label: 'Firewood', unit: '₹/kg', hint: '× firewood kg per autoclave load' },
      { key: 'refinerKwhRate', label: 'Refiner electricity', unit: '₹/kWh', hint: 'Refiner processing energy' },
    ],
  },
  {
    title: 'Overheads & interest',
    fields: [
      { key: 'ohFinancialPerMonth', label: 'Financial overhead', unit: '₹/month' },
      { key: 'ohManufacturingPerMonth', label: 'Manufacturing overhead', unit: '₹/month' },
      { key: 'ohDepreciationPerMonth', label: 'Depreciation', unit: '₹/month', hint: 'Annual ÷ 12' },
      { key: 'interestPctPerAnnum', label: 'Interest', unit: '% per annum', hint: 'On value held in plant, production → dispatch' },
    ],
  },
];

/**
 * What the lab usually measures, offered as suggestions rather than as fields:
 * a test names its own readings, so a new one needs no change here. Mirrors the
 * prototype's QC_PARAM_SUGGEST.
 */
export const QC_PARAM_SUGGEST = [
  'Specific gravity',
  'Mooney viscosity',
  'Ash %',
  'Acetone extract %',
  'Tensile (MPa)',
  'Elongation %',
  'Hardness (Shore A)',
  'Fineness / mesh',
  'Moisture %',
  'Contamination',
];

/** A lab report has to fit the upload route's body limit. */
export const QC_REPORT_MAX_BYTES = 8 * 1024 * 1024;
