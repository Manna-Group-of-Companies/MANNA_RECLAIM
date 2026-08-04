/**
 * The batch number a sleeve or loop run is recorded under, and the arithmetic
 * behind the count it reports.
 *
 * Nobody types this number. A shift is the day it was worked and which of the
 * two shifts worked it, and there is nothing else about it to name - so asking
 * an operator for a running number would be asking them to keep a series in
 * their head, on a tablet that is shared, at the end of a twelve-hour shift.
 * Every such series in this plant has been kept on paper and has gaps.
 *
 *   03/Aug/26-day     03/Aug/26-night
 *
 * The date is the *shift* date, not the clock's - a night shift that runs past
 * midnight keeps the date it started on, so one shift is one number rather than
 * two halves either side of 00:00. That is the same date the whole app already
 * groups a shift's work by, which is what makes the number match what the crew
 * would say it worked on.
 *
 * The product is deliberately not in it. It used to be - the number read
 * `SLEEVE-03/Aug/26-day` - and that made one string carry two facts, which is
 * the arrangement every other part of this app has learned not to trust: the
 * yard, the lab and the CSV all had to split the string back apart to find out
 * what was made, and each of them could do it slightly differently. The product
 * is its own column on the run, on the stock group and on the test, and the
 * batch number is what the shift is called.
 *
 * What that costs is that the number no longer identifies anything on its own:
 * sleeve and loop made on the same shift share it. That is the point of the
 * composite key - see lotLabel() in utils/stockPeriod.js - and it is why every
 * card shows the product beside the number rather than in it.
 *
 * Mirrors client/src/utils/mouldingBatch.ts. The client shows the number before
 * the run starts so the crew can see what it will be recorded under; the server
 * is what actually writes it, and never takes one from a request.
 */

import { PIECES_VARIANCE_PCT } from '../config/constants.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-08-03` -> `03/Aug/26`.
 *
 * Split by hand rather than through Date, for the reason the client's dayLong()
 * gives: `new Date('2026-08-03')` is UTC midnight and reads as the 2nd to anyone
 * west of Greenwich, which would put a whole shift's output in yesterday's lot.
 * A day that will not parse gives back '' rather than a guess - a batch number
 * that is quietly wrong is worse than one that is refused.
 */
export function plantDate(day) {
  const [year, month, date] = String(day ?? '').slice(0, 10).split('-');
  const m = Number(month);
  if (!year || !(m >= 1 && m <= 12) || !date) return '';
  return `${String(date).padStart(2, '0')}/${MONTHS[m - 1]}/${String(year).slice(-2)}`;
}

/**
 * The batch number for one shift date and one shift, or '' when either is
 * missing.
 *
 * The empty string is a real answer and the callers check it. A run cannot be
 * started without both, and generating `undefined-day` rather than refusing is
 * how a lot nobody can find gets into the yard.
 */
export function mouldingBatchNo({ shiftDate, shift } = {}) {
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
 * unfinished piece in the mould, not two thirds of one. Null rather than zero
 * where the cycle time or the cavities are unset - "nothing was expected" and
 * "we have no way to say what was expected" are different, and only the second
 * is true of a product the back office has not filled in yet.
 */
export function expectedPieces({ runtimeMin, cyclicMin, cavities } = {}) {
  const minutes = Number(runtimeMin);
  const cycle = Number(cyclicMin);
  const moulds = Number(cavities);
  if (!(minutes > 0) || !(cycle > 0) || !(moulds > 0)) return null;
  return Math.floor(minutes / cycle) * moulds;
}

/**
 * How far the actual count sits from the expected one, as a signed percentage -
 * negative for a run that made fewer than it should have. Null where either
 * figure is missing, or where nothing was expected at all: a percentage of zero
 * is not a number, and reporting one would flag every unmeasured product.
 */
export function variancePct(actual, expected) {
  const made = Number(actual);
  const due = Number(expected);
  if (!Number.isFinite(made) || !(due > 0)) return null;
  return Math.round(((made - due) / due) * 1000) / 10;
}

/** Whether that gap is wide enough to be worth somebody looking at. */
export const overVariance = (pct) =>
  pct != null && Math.abs(Number(pct)) > PIECES_VARIANCE_PCT;

export default { mouldingBatchNo, plantDate, expectedPieces, variancePct, overVariance };
