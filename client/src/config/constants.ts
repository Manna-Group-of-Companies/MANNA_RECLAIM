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
