import type { Role } from '@/types/models';

/** Route paths. Import these instead of hard-coding strings in links. */
export const userPaths = {
  root: '/',
  login: '/login',
  machines: '/machines',
  batches: '/batches',
  weigh: '/weigh',
  packing: '/packing',
  dispatch: '/dispatch',
  quality: '/quality',
  history: '/history',
  bearing: '/bearing',
  reports: '/reports',
  settings: '/settings',
} as const;

export const adminPaths = {
  root: '/admin',
  login: '/admin/login',
  dashboard: '/admin/dashboard',
  history: '/admin/history',
  quality: '/admin/quality',
  efficiency: '/admin/efficiency',
  rates: '/admin/rates',
  costing: '/admin/costing',
  maintenance: '/admin/maintenance',
  bearings: '/admin/bearings',
  users: '/admin/users',
} as const;

/**
 * Where an account belongs when it lands on `/`, is bounced off a page it may
 * not have, or has just signed in. A lab account has no Machines tab, so
 * sending it there would only bounce it straight back.
 */
export const homeFor = (role?: Role | null): string =>
  role === 'lab' ? userPaths.quality : userPaths.machines;

export default { userPaths, adminPaths };
