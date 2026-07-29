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
  efficiency: '/admin/efficiency',
  rates: '/admin/rates',
  costing: '/admin/costing',
  maintenance: '/admin/maintenance',
  bearings: '/admin/bearings',
  users: '/admin/users',
} as const;

export default { userPaths, adminPaths };
