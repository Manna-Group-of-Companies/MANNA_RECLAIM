import type { Shift } from '@/types/models';

export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Day shift 08:30-20:30, night otherwise - same rule as the server. */
export const shiftForMinutes = (mins: number): Shift =>
  mins >= 510 && mins < 1230 ? 'Day' : 'Night';

export const currentShift = (d = new Date()): Shift =>
  shiftForMinutes(d.getHours() * 60 + d.getMinutes());

/**
 * The shift a 'HH:MM' entry falls in. Blank means the sheet was left on "now",
 * so the clock decides it - the same reading the autoclave load sheet shows
 * under its time field.
 */
export const shiftForTime = (time?: string | null): Shift => {
  if (!time) return currentShift();
  const [h = '', m = ''] = String(time).split(':');
  return shiftForMinutes((parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0));
};

/** 24-hour HH:MM off a timestamp - the clock the shop floor reads. */
export const clock24 = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * A local 'YYYY-MM-DD' + 'HH:MM' pair as an instant. Built through the Date
 * constructor rather than string parsing so it reads as plant-local time, not
 * UTC. Null when either half is missing or the pair does not parse.
 */
export const atLocal = (day?: string | null, time?: string | null): string | null => {
  if (!day || !time) return null;
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;
  const at = new Date(y, mo - 1, d, h, mi);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

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
