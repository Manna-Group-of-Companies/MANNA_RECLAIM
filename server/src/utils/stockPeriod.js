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
 * `2026-08-H1` back into the dates it covers, or null if it is not a pool
 * label. The inverse of poolFor(), so a row that only carries its label can
 * still be asked when its period ran.
 */
export function periodOf(label) {
  const match = /^(\d{4})-(\d{2})-H([123])$/.exec(String(label ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const n = Number(match[3]);
  const startDay = (n - 1) * 10 + 1;
  const endDay = n === 3 ? lastDay(year, month) : n * 10;
  return {
    year,
    month,
    n,
    startDay,
    endDay,
    periodStart: `${year}-${pad(month)}-${pad(startDay)}`,
    periodEnd: `${year}-${pad(month)}-${pad(endDay)}`,
  };
}

/** A coarse pool is sampled three times across its period. */
export const SLOT_COUNT = 3;

/**
 * The three sample points a coarse pool is tested at, as date ranges.
 *
 * Coarse is not batch-identified, so there is no lot to certify and nothing for
 * the lab to test one of. What it gets instead is the period sampled three
 * times across its ten days - so the record is "the line was running to
 * specification through this pool" rather than "this pallet passed".
 *
 * The days are split as evenly as the period allows, with the remainder going
 * to the middle slot and then the last. A ten-day pool therefore reads 3 / 4 /
 * 3 - days 1-3, 4-7, 8-10 - which puts a sample near each end and one in the
 * middle. H3 is whatever the month leaves, eight days in February and eleven in
 * a long month, and divides the same way rather than being padded to ten.
 *
 * Fixed ranges rather than "three samples whenever" on purpose: a slot nobody
 * filled is then a visible gap on the tab, which is the whole reason for
 * numbering them. A sample is filed against its own date and the slot is worked
 * out from it - see slotOf() - so the lab never picks a slot number and cannot
 * file the 2nd against the 9th.
 */
export function slotsOf(label) {
  const period = periodOf(label);
  if (!period) return [];
  const { year, month, startDay, endDay } = period;

  const span = endDay - startDay + 1;
  const base = Math.floor(span / SLOT_COUNT);
  const extra = span % SLOT_COUNT;
  const sizes = [base, base, base];
  if (extra >= 1) sizes[1] += 1;
  if (extra >= 2) sizes[2] += 1;

  const slots = [];
  let day = startDay;
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const to = day + sizes[i] - 1;
    slots.push({
      slot: i + 1,
      from: `${year}-${pad(month)}-${pad(day)}`,
      to: `${year}-${pad(month)}-${pad(to)}`,
    });
    day = to + 1;
  }
  return slots;
}

/**
 * Which of the three slots a sample date falls in, or null if the date is not
 * inside that pool's period at all.
 *
 * Derived from the date rather than taken from the request, for the same reason
 * the pool label is: a client that could name its own slot could file today's
 * sample as the one nobody took last week, and the empty slot is the only thing
 * that says a sample was missed.
 */
export function slotOf(label, date) {
  const day = String(date ?? '').slice(0, 10);
  if (!day) return null;
  const found = slotsOf(label).find((slot) => day >= slot.from && day <= slot.to);
  return found ? found.slot : null;
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

/**
 * A moulded group's label: the product, and the pack it is boxed in.
 *
 * `LOOP-50` is loops, fifty to a pack. The pack size is part of the key rather
 * than only a column beside it, because the same product boxed two ways is two
 * different things to sell and to count - a customer orders packs, and a yard
 * that pooled both into one row could not say how many of either it had.
 *
 * A product with no pack size set is `LOOP-LOOSE`. It is a real state and not an
 * error: the presses run whether or not the back office has filled the pack in,
 * and stranding a shift's moulding for want of a settings field would be the
 * worse failure. The label says which it is, so the two never merge.
 */
export const productLabel = (productId, packSize) => {
  const product = String(productId ?? '').trim();
  const size = Number(packSize);
  return `${product}-${Number.isFinite(size) && size > 0 ? size : 'LOOSE'}`;
};

export default {
  poolFor,
  periodOf,
  slotsOf,
  slotOf,
  displayLabel,
  batchLabel,
  productLabel,
  halfIndex,
  SLOT_COUNT,
};
