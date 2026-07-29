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

/** One packed sack. Anything under this is carried into the next batch. */
export const SACK_KG = 50;

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

/** The lab's measured values per test, as the prototype's QC sheet asks them. */
export const QC_PARAMS = [
  { name: 'Moisture', unit: '%' },
  { name: 'Ash', unit: '%' },
  { name: 'Acetone extract', unit: '%' },
  { name: 'Specific gravity', unit: '' },
];
