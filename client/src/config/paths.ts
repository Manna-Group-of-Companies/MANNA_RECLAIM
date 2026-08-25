import type { Role } from '@/types/models';

/** Route paths. Import these instead of hard-coding strings in links. */
export const userPaths = {
  root: '/',
  login: '/login',
  machines: '/machines',
  batches: '/batches',
  weigh: '/weigh',

  /**
   * What is packed and ready to dispatch. One route, two answers: a manager
   * gets the whole table and the form to issue a dispatch from it, a supervisor
   * gets what is in stock and nothing else - see StockPage, and /stock/summary
   * on the server. Issuing a dispatch is the manager's alone, because the form
   * cannot be filled in without the customer list.
   */
  stock: '/stock',
  quality: '/quality',
  history: '/history',
  bearing: '/bearing',
  reports: '/reports',
  /**
   * How the shift did against the manager's benchmarks, for the crew that
   * worked it. The plant pays an incentive on these figures, so the people
   * being measured read them on the same day the office does.
   */
  efficiency: '/efficiency',
  settings: '/settings',
  /**
   * What this tablet has asked the server for, and what came back. Under
   * Settings rather than on the tab bar: it is opened when something would not
   * save, which is a handful of times a year, and a tab is for work.
   */
  log: '/settings/log',
} as const;

export const adminPaths = {
  root: '/admin',
  login: '/admin/login',
  dashboard: '/admin/dashboard',
  history: '/admin/history',
  /**
   * The lab record, and the yard's verdicts beside it - the page carries both
   * views and switches between them, so there is one address for the question
   * "may this be sold" whichever end it is asked from.
   */
  quality: '/admin/quality',
  efficiency: '/admin/efficiency',
  /**
   * Whether the rule is running: every figure that missed its benchmark, and
   * whether the shift has explained it and the office signed it off.
   */
  approvals: '/admin/approvals',
  rates: '/admin/rates',
  /**
   * What a shift should make, as the manager sets it - the benchmarks the
   * Efficiency tab holds each collected figure against. Its own address rather
   * than the foot of /admin/rates: a target is meant to be revisited, and a
   * page reached by scrolling past somebody else's figures is not.
   */
  ideals: '/admin/ideals',
  costing: '/admin/costing',
  maintenance: '/admin/maintenance',
  bearings: '/admin/bearings',
  /** What the plant makes and sells, and what a unit of it costs. */
  products: '/admin/products',
  /** The machine list, including the presses and the platens they mould on. */
  machines: '/admin/machines',
  /** Who the plant sells to, and what has gone out to each. */
  customers: '/admin/customers',
  customer: (id: string) => `/admin/customers/${id}`,
  users: '/admin/users',
} as const;

/**
 * The managing director's two screens.
 *
 * Its own prefix rather than a thinner /admin: every route under /admin is
 * behind a guard that means "the back office", and an MD that could pass that
 * guard could reach the rate card by typing the address. Two addresses, two
 * guards, and the narrow one cannot be widened by accident.
 */
export const mdPaths = {
  root: '/md',
  login: '/md/login',
  overview: '/md/overview',
  efficiency: '/md/efficiency',
  /** The same approvals board, read-only - the process, observed. */
  approvals: '/md/approvals',
  /** The run record, read-only: no correction sheet and no costed export. */
  history: '/md/history',
} as const;

/**
 * Where an account belongs when it lands on `/`, is bounced off a page it may
 * not have, or has just signed in. A lab account has no Machines tab, so
 * sending it there would only bounce it straight back - and the managing
 * director has no shop-floor tab at all.
 */
export const homeFor = (role?: Role | null): string => {
  if (role === 'md') return mdPaths.overview;
  if (role === 'lab') return userPaths.quality;
  return userPaths.machines;
};

export default { userPaths, adminPaths, mdPaths };
