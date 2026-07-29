import type { Shift } from '@/types/models';

export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Day shift 08:30-20:30, night otherwise - same rule as the server. */
export const shiftForMinutes = (mins: number): Shift =>
  mins >= 510 && mins < 1230 ? 'Day' : 'Night';

export const currentShift = (d = new Date()): Shift =>
  shiftForMinutes(d.getHours() * 60 + d.getMinutes());

export const clock = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--';

export const dayMonth = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '--';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "7 Jul 2026" from a plain 'YYYY-MM-DD'. Parsed by hand rather than through
 * Date, because `new Date('2026-07-07')` is read as UTC midnight and shows as
 * the 6th to anyone west of Greenwich.
 */
export const dayLong = (day?: string | null) => {
  if (!day) return '--';
  const [y, m, d] = String(day).split('-');
  if (!y || !m || !d) return String(day);
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};

/** "Jul 2026" from a 'YYYY-MM'. */
export const monthLong = (month?: string | null) => {
  if (!month) return '--';
  const [y, m] = String(month).split('-');
  if (!y || !m) return String(month);
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};

export const lastNDays = (n: number) => {
  const to = new Date();
  const from = new Date(to.getTime() - (n - 1) * 86400000);
  return { from: todayISO(from), to: todayISO(to) };
};
