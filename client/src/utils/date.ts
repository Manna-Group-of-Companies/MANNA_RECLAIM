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

/**
 * The moment the shift in progress began.
 *
 * Day runs 08:30-20:30 and night the rest, the same boundary shiftForMinutes
 * draws, so "this shift" means the same thing to a screen asking who is on it
 * as it does to a sheet being signed. Between midnight and 08:30 the shift in
 * progress started at 20:30 *yesterday*, which is the case worth having a
 * function for - it is the one a subtraction gets wrong.
 */
export const shiftStart = (now = new Date()) => {
  const at = (hour: number, minute: number, dayOffset = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute, 0, 0);
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 510 && mins < 1230) return at(8, 30);
  if (mins >= 1230) return at(20, 30);
  return at(20, 30, -1);
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

/**
 * A past moment placed the way someone reading a list wants it: "Today 14:32"
 * for this shift's, "Yesterday 22:10" for last night's, and a dated "12 Aug,
 * 14:32" once it is old enough that the day is the point.
 *
 * The days are compared on the local calendar rather than by subtracting 24
 * hours, so a 23:50 sign-in still reads as yesterday at 08:00 the next morning
 * - which is what the person looking at it means by the word.
 */
export const whenLast = (iso?: string | null) => {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const day = todayISO(at);
  const today = todayISO();
  if (day === today) return `Today ${clock24(iso)}`;
  if (day === todayISO(new Date(Date.now() - 86400000))) return `Yesterday ${clock24(iso)}`;
  return `${dayMonth(iso)}, ${clock24(iso)}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1-12 off a plain 'YYYY-MM-DD', or 0 when there is no month to read. */
const monthOf = (day?: string | null) => {
  const month = parseInt(String(day ?? '').slice(5, 7), 10);
  return month >= 1 && month <= 12 ? month : 0;
};

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

/**
 * The letter a coarse batch number is prefixed with: the month it was charged
 * in, A for January through L for December.
 *
 * The coarse line is not batch-identified the way the special line is - its
 * numbers are a running series the crew keeps by hand - so the letter is what
 * says which month a number belongs to, and `C-2893` read off a sack means the
 * 2893rd coarse charge, cooked in March.
 *
 * Taken off a plain 'YYYY-MM-DD' by hand rather than through Date, for the same
 * reason dayLong() is: `new Date('2026-03-01')` is UTC midnight and reads as
 * February to anyone west of Greenwich, which would put the charge in the wrong
 * month's series. A blank or unparseable day gives back '' rather than a guess -
 * a wrong letter is worse than none, because the crew would leave it standing.
 */
export const monthLetter = (day?: string | null) => {
  const month = monthOf(day);
  return month ? String.fromCharCode(64 + month) : '';
};

/** "Mar" for the month of a 'YYYY-MM-DD', so a letter can be shown spelt out. */
export const monthShort = (day?: string | null) => {
  const month = monthOf(day);
  return month ? (MONTHS[month - 1] as string) : '';
};

export const lastNDays = (n: number) => {
  const to = new Date();
  const from = new Date(to.getTime() - (n - 1) * 86400000);
  return { from: todayISO(from), to: todayISO(to) };
};
