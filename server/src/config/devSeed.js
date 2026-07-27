import bcrypt from 'bcryptjs';
import { env } from './env.js';
import { isDbReady } from './db.js';
import { logger } from './logger.js';
import { ROLES } from './constants.js';

/**
 * Development-only seed so the app is usable before MongoDB is wired up.
 * Active ONLY when the database is unconfigured and NODE_ENV is not
 * production - see devSeedActive(). Delete this file (and the two fallbacks
 * in user.service.js / machine.service.js) once the real tables exist.
 */

const SEED_PINS = [
  { name: 'Mathai', role: ROLES.SUPERVISOR, pin: '1111' },
  { name: 'Rahul', role: ROLES.SUPERVISOR, pin: '2222' },
  { name: 'Devanand', role: ROLES.SUPERVISOR, pin: '3333' },
  { name: 'Manager', role: ROLES.MANAGER, pin: '2525' },
];

export const DEV_USERS = SEED_PINS.map((u, i) => ({
  id: 'dev-' + (i + 1),
  name: u.name,
  role: u.role,
  active: true,
  pin_hash: bcrypt.hashSync(u.pin, 10),
}));

/** The 14 machines defined in the index.html prototype. */
export const DEV_MACHINES = [
  { id: 'CRK', name: 'Cracker', short: 'CRK', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise - tyre prep (mixed)', accent: '#9bb0c4', enabled: true, sort_order: 1 },
  { id: 'GRD_K', name: 'Grinder 1', short: 'Grind 1', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise - 30# default', accent: '#9bb0c4', out_weight: true, enabled: true, sort_order: 2 },
  { id: 'GRD_S', name: 'Grinder 2', short: 'Grind 2', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise - 20# default', accent: '#9bb0c4', out_weight: true, enabled: true, sort_order: 3 },
  { id: 'GRD_O', name: 'Soorya Grinder', short: 'Soorya', kind: 'grind', group_name: 'Grinding line', sub: 'shiftwise', accent: '#9bb0c4', out_weight: true, enabled: true, sort_order: 4 },
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
];

let warned = false;

export function devSeedActive() {
  if (env.isProd || isDbReady()) return false;
  if (!warned) {
    warned = true;
    logger.warn('DEV SEED ACTIVE - in-memory accounts and machines are being served.');
    logger.warn('Set MONGODB_URI to switch to the real database.');
  }
  return true;
}

export default { DEV_USERS, DEV_MACHINES, devSeedActive };
