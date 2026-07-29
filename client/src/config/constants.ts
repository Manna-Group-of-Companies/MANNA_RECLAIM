import type { Quality, DispatchGrade, Role, Shift } from '@/types/models';

/** Mirrors server/src/config/constants.js - keep both sides in step. */
export const ROLES: Record<string, Role> = {
  WORKER: 'worker',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

export const ADMIN_ROLES: Role[] = ['manager', 'admin'];

export const SHIFTS: Shift[] = ['Day', 'Night'];

export const QUALITIES: Quality[] = ['Special', 'SuperFine', 'Fine', 'Medium', 'DRC'];

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
  Special: 'bg-quality-special text-bg',
  SuperFine: 'bg-quality-superfine text-bg',
  Fine: 'bg-quality-fine text-bg',
  Medium: 'bg-quality-medium text-bg',
  DRC: 'bg-quality-drc text-bg',
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
  { name: 'Coarse 2200', capacity: 2200, type: 'coarse' },
  { name: 'Coarse 2500', capacity: 2500, type: 'coarse' },
];

/** The formulations that fit this vessel - specials first, then coarse. */
export const autoclaveFormsFor = (capacity?: number | null): AutoclaveForm[] =>
  capacity == null ? [] : AUTOCLAVE_FORMS.filter((f) => f.capacity === capacity);

/**
 * Two hands charge two autoclaves between them, so a paired load costs one
 * worker; charged on its own it takes both.
 */
export const autoclaveWorkers = (paired: boolean) => (paired ? 1 : 2);

/** One packed sack. Anything under this is carried into the next batch. */
export const SACK_KG = 50;

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
};

/** The two feedstocks the grinding line runs on, and the crumb each yields. */
export const TYRES = {
  truck: { label: 'Truck tyre', mesh: '30#' },
  bike: { label: 'Bike tyre', mesh: '20#' },
} as const;

export type TyreType = keyof typeof TYRES;

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
    default:
      return shiftwise ? 2 : null;
  }
};

/** Soorya is metered on one phase only - see the note on both its sheets. */
export const TOD_MACHINE_ID = 'GRD_O';

/** Supervisors who sign for a shift. Mirrors the prototype's SUPERVISORS. */
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
    fields: [
      { key: 'crumbTruckPerKg', label: 'Rubber crumb — Truck', unit: '₹/kg' },
      { key: 'crumbBikePerKg', label: 'Rubber crumb — Bike', unit: '₹/kg' },
      { key: 'crumbDrcPerKg', label: 'Rubber crumb — DRC', unit: '₹/kg' },
      { key: 'raPerKg', label: 'Reclaiming agent (RA)', unit: '₹/kg' },
      { key: 'rpoPerKg', label: 'Rubber processing oil (RPO)', unit: '₹/kg' },
      { key: 'pineTarPerKg', label: 'Pine tar', unit: '₹/kg' },
      { key: 'waterPerL', label: 'Water', unit: '₹/L' },
    ],
  },
  {
    title: 'Packing & loading',
    fields: [
      { key: 'packLabourPerSack', label: 'Packing labour', unit: '₹/sack', hint: 'Costed per kg at 50 kg/sack' },
      { key: 'packMaterialPerSack', label: 'Packing raw material', unit: '₹/sack', hint: 'Costed per kg at 50 kg/sack' },
      { key: 'loadingPerKg', label: 'Loading labour', unit: '₹/kg' },
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
