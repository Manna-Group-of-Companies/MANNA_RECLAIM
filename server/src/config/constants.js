/** Shared domain vocabulary. Keep in sync with client/src/config/constants.ts */

export const ROLES = {
  WORKER: 'worker',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

export const ADMIN_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

export const SHIFTS = { DAY: 'Day', NIGHT: 'Night' };

/** Day 08:30-20:30, Night 20:30-08:30 (minutes from midnight). */
export const SHIFT_WINDOW = { dayStart: 510, dayEnd: 1230 };

export const QUALITIES = ['Special', 'SuperFine', 'Fine', 'Medium', 'DRC'];

export const DISPATCH_GRADES = ['Special', 'SuperFine', 'Fine', 'Medium', 'Coarse', 'Sillsheet'];

export const MACHINE_KINDS = ['grind', 'autoclave', 'prerefiner', 'refiner', 'coarse'];

/** Standard list rate per kg. A customer rate card entry overrides these. */
export const PRICE_LIST = { Special: 48, SuperFine: 47, Fine: 43, Medium: 41, Coarse: 36 };

export const FIREWOOD_KG_PER_LOAD = 550;

/** MongoDB collection names. Map to models in src/models/index.js. */
export const TABLES = {
  users: 'users',
  shifts: 'shifts',
  machines: 'machines',
  batches: 'batches',
  runs: 'runs',
  dispatches: 'dispatches',
  dispatchLoads: 'dispatch_loads',
  qualityTests: 'quality_tests',
  maintenance: 'maintenance',
  bearingLogs: 'bearing_logs',
  customers: 'customers',
  rates: 'rates',
  vehicles: 'vehicles',
  drivers: 'drivers',
};

export default { ROLES, SHIFTS, QUALITIES, DISPATCH_GRADES, MACHINE_KINDS, PRICE_LIST, TABLES };
