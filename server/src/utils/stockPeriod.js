/**
 * Which ten-day pool a coarse sack belongs to.
 *
 * The coarse line runs for a shift, not for a batch, so its sacks carry no batch
 * number and there is nothing to identify a pallet of them by. They are pooled
 * instead by the third of the month they were packed in - H1 is days 1-10, H2
 * is 11-20, H3 is 21 to the end - which is short enough that a pool turns over
 * and long enough that the yard is not tracking a new label every day.
 *
 * The label is derived from the packing date on the server and never taken from
 * the request. A client that could name its own pool could file today's sacks
 * into last month's, and the whole point of the pool is that it says when the
 * stock was made.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const pad = (n) => String(n).padStart(2, '0');

/** A `YYYY-MM-DD` string or a Date, as the three numbers the rules need. */
function partsOf(date) {
  if (date instanceof Date) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  const [year, month, day] = String(date).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Not a date: ${date}`);
  return { year, month, day };
}

/** 1-10 -> 1, 11-20 -> 2, 21-31 -> 3. The 31st stays in H3, hence the cap. */
export const halfIndex = (day) => Math.min(3, Math.floor((day - 1) / 10) + 1);

/** The last day of a month, so H3 can end on the 28th, 29th, 30th or 31st. */
const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The pool a packing date falls in: the stored label, the one the yard reads,
 * and the dates it runs between.
 *
 *   poolFor('2026-08-07')  ->  { label: '2026-08-H1', display: 'AUG-H1', ... }
 */
export function poolFor(date) {
  const { year, month, day } = partsOf(date);
  const n = halfIndex(day);
  const startDay = (n - 1) * 10 + 1;
  const endDay = n === 3 ? lastDay(year, month) : n * 10;
  return {
    label: `${year}-${pad(month)}-H${n}`,
    display: `${MONTHS[month - 1]}-H${n}`,
    periodStart: `${year}-${pad(month)}-${pad(startDay)}`,
    periodEnd: `${year}-${pad(month)}-${pad(endDay)}`,
  };
}

/**
 * `2026-08-H1` -> `AUG-H1`, for a label already on a row. Anything that is not
 * a pool label is handed back untouched, which is what a batch group's label
 * needs - it is already the thing to show.
 */
export const displayLabel = (label) => {
  const match = /^(\d{4})-(\d{2})-H([123])$/.exec(String(label ?? ''));
  if (!match) return label ?? '';
  return `${MONTHS[Number(match[2]) - 1]}-H${match[3]}`;
};

/**
 * A batch group's label. One batch yields several grades and each is its own
 * stock, so the grade is part of the label rather than only a column beside it -
 * `label` is unique, and two grades off one batch would otherwise collide.
 */
export const batchLabel = (batchNo, quality) =>
  `${String(batchNo).trim()}-${String(quality).trim()}`;

export default { poolFor, displayLabel, batchLabel, halfIndex };
