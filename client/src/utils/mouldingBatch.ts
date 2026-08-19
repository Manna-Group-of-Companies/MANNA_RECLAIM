import { PIECES_VARIANCE_PCT } from '@/config/constants';

/**
 * The batch number a sleeve or loop run will be recorded under, worked out here
 * so the crew can read it before they start.
 *
 * Nobody types it. A shift is the day it was worked and which shift worked it,
 * and there is nothing else about it to name - so asking an operator for a
 * running number would be asking them to keep a series in their head, on a
 * tablet that is shared, at the end of a twelve-hour shift.
 *
 *   03/Aug/26-day     03/Aug/26-night
 *
 * The date is the shift date rather than the clock's, so a night shift that runs
 * past midnight stays one number instead of splitting either side of 00:00.
 *
 * The product is not in the string. It is its own field on the run, the stock
 * group and the lab test, and the number names the shift - so sleeve and loop
 * made on the same shift share this number and are told apart by the product
 * beside it, never by reading the string. See the server's copy for why.
 *
 * This is a copy, and it is worth being plain about which copy is which. The
 * server generates the number that gets stored and never accepts one from a
 * request - a client that could name its own lot could file this shift's pieces
 * into last week's. What this is for is showing the crew, before the run starts,
 * what the server is going to call it. The two agreeing is the point; if they
 * ever disagree, the server is right.
 *
 * Mirrors server/src/utils/mouldingBatch.js.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-08-03` -> `03/Aug/26`.
 *
 * Split by hand rather than through Date, for the reason dayLong() in
 * utils/date gives: `new Date('2026-08-03')` is UTC midnight and reads as the
 * 2nd to anyone west of Greenwich, which would show the crew yesterday's lot.
 */
export function plantDate(day?: string | null): string {
  const [year, month, date] = String(day ?? '').slice(0, 10).split('-');
  const m = Number(month);
  if (!year || !(m >= 1 && m <= 12) || !date) return '';
  return `${String(date).padStart(2, '0')}/${MONTHS[m - 1]}/${String(year).slice(-2)}`;
}

/**
 * The number, or '' when the date or the shift is missing.
 *
 * The empty string is a real answer and the sheet shows it as such - "pick a
 * date and a shift" rather than a number with a hole in it.
 */
export function mouldingBatchNo({
  shiftDate,
  shift,
}: {
  shiftDate?: string | null;
  shift?: string | null;
}): string {
  const date = plantDate(shiftDate);
  const when = String(shift ?? '').trim().toLowerCase();
  if (!date || !when) return '';
  return `${date}-${when}`;
}

/**
 * How many pieces the cycle and the mould say a run of this length should have
 * made, or null when the product has not been measured into the system.
 *
 * Whole cycles only: a run stopped two thirds of the way through a cycle has an
 * unfinished piece in the mould, not two thirds of one.
 */
export function expectedPieces({
  runtimeMin,
  cyclicMin,
  cavities,
}: {
  runtimeMin?: number | null;
  cyclicMin?: number | null;
  cavities?: number | null;
}): number | null {
  const minutes = Number(runtimeMin);
  const cycle = Number(cyclicMin);
  const moulds = Number(cavities);
  if (!(minutes > 0) || !(cycle > 0) || !(moulds > 0)) return null;
  return Math.floor(minutes / cycle) * moulds;
}

/** The gap as a signed percentage - negative for a lot that came up short. */
export function variancePct(actual?: number | null, expected?: number | null): number | null {
  const made = Number(actual);
  const due = Number(expected);
  if (!Number.isFinite(made) || !(due > 0)) return null;
  return Math.round(((made - due) / due) * 1000) / 10;
}

/** Whether that gap is wide enough to be worth somebody looking at. */
export const overVariance = (pct?: number | null) =>
  pct != null && Math.abs(Number(pct)) > PIECES_VARIANCE_PCT;

/**
 * Minutes between two instants, for the expected count on a run still going.
 *
 * `lessMs` comes off the gap - the time the bench stood paused, which the mould
 * made nothing in. Leaving it in would measure a lot against a cycle it never
 * had the minutes for, and flag every paused run as short.
 */
export function minutesBetween(
  from?: string | null,
  to: Date = new Date(),
  lessMs = 0,
): number | null {
  if (!from) return null;
  const started = new Date(from).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.round((to.getTime() - started - Math.max(0, lessMs)) / 60000));
}
