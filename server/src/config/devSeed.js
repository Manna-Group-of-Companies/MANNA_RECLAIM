import bcrypt from 'bcryptjs';
import { env } from './env.js';
import { request, isDbReady } from './supabase.js';
import { logger } from './logger.js';
import { ROLES, TABLES } from './constants.js';

/**
 * Development-only seed for the two things Supabase does not have yet.
 *
 * The plant's data - runs, batches, quality, bearings, rates - all came across
 * from the tablets and lives in Supabase. Accounts and the machine list never
 * did: the prototype hard-coded both, so `users` and `machines` are created by
 * supabase/schema.sql rather than copied.
 *
 * Until that SQL has been run, these in-memory rows keep login and the machine
 * screens working. Once the tables are there the fallback switches itself off -
 * see devSeedActive(). Delete this file, and the two fallbacks in
 * user.service.js / machine.service.js, when the plant is fully on Supabase.
 */

/**
 * The starting accounts. Mirrors SEED_USERS in scripts/seed-users.js, which is
 * what writes the same seven into Supabase.
 *
 * `MD` is the managing director, and reads two screens: the plant overview and
 * the shift efficiency. It is not a quieter Manager - it has no write anywhere
 * in the app, which is what SUMMARY_ROLES is for. See the note there.
 *
 * `Admin` is not a spare manager. It is the only account that satisfies
 * DELETE_ROLES, which is deliberately narrower than ADMIN_ROLES: clearing a
 * weighing on Weigh, clearing an emptied group on Stock and taking a verdict off
 * the record on Quality are the three things in this app that cannot be undone
 * by doing them again, and they are behind this account and no other. Without
 * one seeded, those controls existed in the code and were reachable by nobody.
 *
 * It is a separate account from Manager rather than a widening of what Manager
 * may do, because that is the whole point of the split - the destructive half
 * should take a deliberate sign-in, not ride along with the one somebody leaves
 * open on a desk all day.
 */
const SEED_PINS = [
  { name: 'Mathai', role: ROLES.SUPERVISOR, pin: '1111' },
  { name: 'Rahul', role: ROLES.SUPERVISOR, pin: '2222' },
  { name: 'Devanand', role: ROLES.SUPERVISOR, pin: '3333' },
  { name: 'Lab', role: ROLES.LAB, pin: '4444' },
  { name: 'Manager', role: ROLES.MANAGER, pin: '2525' },
  { name: 'Admin', role: ROLES.ADMIN, pin: '9999' },
  { name: 'MD', role: ROLES.MD, pin: '3567' },
];

export const DEV_USERS = SEED_PINS.map((u, i) => ({
  id: 'dev-' + (i + 1),
  name: u.name,
  role: u.role,
  active: true,
  pin_hash: bcrypt.hashSync(u.pin, 10),
}));

/** The 14 machines defined in the index.html prototype, plus the two presses. */
export const DEV_MACHINES = [
  { id: 'CRK', name: 'Cracker', short: 'CRK', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise - tyre prep (mixed)', accent: '#9bb0c4', enabled: true, sort_order: 1 },
  { id: 'GRD_K', name: 'Grinder 1', short: 'Grind 1', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise - 30# default', accent: '#9bb0c4', out_weight: true, tyre: true, def_tyre: 'truck', enabled: true, sort_order: 2 },
  { id: 'GRD_S', name: 'Grinder 2', short: 'Grind 2', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise - 20# default', accent: '#9bb0c4', out_weight: true, tyre: true, def_tyre: 'bike', enabled: true, sort_order: 3 },
  // No electricity meter and no hour meter on this one, which is why `meters`
  // exists at all - see migrations/0015. Its sheets ask for weight and crew.
  { id: 'GRD_O', name: 'Soorya Grinder', short: 'Soorya', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise - no meters', accent: '#9bb0c4', out_weight: true, tyre: true, def_tyre: 'truck', meters: false, bearings: false, enabled: true, sort_order: 4 },
  { id: 'AC_A', name: 'Autoclave A', short: 'AC-A', kind: 'autoclave', group_name: 'Autoclaves', capacity: 2500, accent: '#e0762e', enabled: true, sort_order: 5 },
  { id: 'AC_M', name: 'Autoclave M', short: 'AC-M', kind: 'autoclave', group_name: 'Autoclaves', capacity: 2200, accent: '#e0762e', enabled: true, sort_order: 6 },
  { id: 'AC_N', name: 'Autoclave N', short: 'AC-N', kind: 'autoclave', group_name: 'Autoclaves', capacity: 2200, accent: '#e0762e', enabled: false, sort_order: 7 },
  { id: 'AC_O', name: 'Autoclave O', short: 'AC-O', kind: 'autoclave', group_name: 'Autoclaves', capacity: 2200, accent: '#e0762e', enabled: false, sort_order: 8 },
  { id: 'PR2', name: 'Pre-Refiner 2', short: 'PR2', kind: 'prerefiner', group_name: 'Pre-Refiners', accent: '#46c2d6', needs_quality: true, enabled: true, sort_order: 9 },
  { id: 'R1', name: 'Refiner 1', short: 'R1', kind: 'refiner', group_name: 'Refiners', sub: 'stands in for R3', accent: '#46c2d6', needs_quality: true, enabled: true, sort_order: 10 },
  { id: 'R3', name: 'Refiner 3', short: 'R3', kind: 'refiner', group_name: 'Refiners', accent: '#46c2d6', needs_quality: true, enabled: true, sort_order: 11 },
  { id: 'R4', name: 'Refiner 4', short: 'R4', kind: 'refiner', group_name: 'Refiners', accent: '#46c2d6', needs_quality: true, weigh: true, enabled: true, sort_order: 12 },
  { id: 'PR1', name: 'Pre-Refiner 1', short: 'PR1', kind: 'coarse', group_name: 'Coarse line', sub: 'coarse - shiftwise', accent: '#e0762e', enabled: true, sort_order: 13 },
  { id: 'R2', name: 'Refiner 2', short: 'R2', kind: 'coarse', group_name: 'Coarse line', sub: 'coarse - or Medium grade', accent: '#e0762e', out_weight: true, enabled: true, sort_order: 14 },
  { id: 'PRS_P3', name: 'Press 3', short: 'P3', kind: 'press', group_name: 'Moulding presses', sub: 'platen, daylights, tonnage - to be measured', accent: '#4d9fe8', enabled: true, sort_order: 15 },
  { id: 'PRS_P5', name: 'Press 5', short: 'P5', kind: 'press', group_name: 'Moulding presses', sub: 'platen, daylights, tonnage - to be measured', accent: '#4d9fe8', enabled: true, sort_order: 16 },
  // Sleeve and loop. Their own activities rather than a filter on the presses:
  // what they make is certified a shift at a time under a generated batch
  // number, which is how a batch of reclaim works and is not how a press works.
  //
  // Off the floor, so the Machines page carries no Sleeve & Loop section. Same
  // lever as the two idle autoclaves above rather than a delete: the runs, lots
  // and lab verdicts already recorded against these two stay where they are, and
  // the admin screen turns them back on the day the benches are worked again.
  { id: 'SLEEVE', name: 'Sleeve', short: 'Sleeve', kind: 'sleeve', type: 'sleeve', group_name: 'Sleeve & Loop', sub: 'batch per shift - pieces, flash and crew at stop', accent: '#7ec9a0', enabled: false, sort_order: 17 },
  { id: 'LOOP', name: 'Loop', short: 'Loop', kind: 'loop', type: 'loop', group_name: 'Sleeve & Loop', sub: 'batch per shift - pieces, flash and crew at stop', accent: '#c99ade', enabled: false, sort_order: 18 },
];

/**
 * What the presses mould, until the products table exists.
 *
 * Seeded with their figures unset, exactly as supabase/schema.sql seeds them: a
 * curing temperature or a compound rate nobody has measured would be a number
 * the costing then treats as fact. The press sheets show "not set" against each
 * one until the back office fills it in.
 */
// `code` is the one figure that is not left unset. It is a name rather than a
// measurement - what an order matches on - which is why seeding it is not the
// same as inventing a rate. It used to be the prefix a sleeve or loop batch
// number was built from; since 0007 a lot is named by its shift with the product
// beside it, so nothing depends on this to start a run.
export const DEV_PRODUCTS = [
  { id: 'LOOP', name: 'Loop', code: 'LOOP', moulded: true, cure_temp_c: null, cyclic_min: null, cavities: null, compound_rate: null, active: true, sort_order: 1 },
  { id: 'SLEVE', name: 'Sleve', code: 'SLEEVE', moulded: true, cure_temp_c: null, cyclic_min: null, cavities: null, compound_rate: null, active: true, sort_order: 2 },
];

let warned = false;
/** Whether Supabase has the accounts/machines tables. Probed once per process. */
let tablesPresent = null;

async function supabaseHasSeedTables() {
  if (tablesPresent !== null) return tablesPresent;
  try {
    await Promise.all([
      request(TABLES.users, { select: 'id', limit: 0 }),
      request(TABLES.machines, { select: 'id', limit: 0 }),
    ]);
    tablesPresent = true;
  } catch {
    tablesPresent = false;
  }
  return tablesPresent;
}

/**
 * True only while Supabase is still missing `users`/`machines`, and never in
 * production - a plant running on hard-coded PINs is not something to fail
 * quietly into.
 */
export async function devSeedActive() {
  if (env.isProd || !isDbReady()) return false;
  if (await supabaseHasSeedTables()) return false;
  if (!warned) {
    warned = true;
    logger.warn('DEV SEED ACTIVE - in-memory accounts and machines are being served.');
    logger.warn('Run supabase/schema.sql, then `npm run seed`, to move them into Supabase.');
  }
  return true;
}

export default { DEV_USERS, DEV_MACHINES, DEV_PRODUCTS, devSeedActive };
