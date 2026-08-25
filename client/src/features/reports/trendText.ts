import { dayLong } from '@/utils/date';
import type { TrendSubject } from '@/types/models';

/**
 * The words both trend screens use, in one place.
 *
 * The back office and the tablet draw this question with different markup - they
 * have to, since nearly every class the back office uses is declared under
 * `.back-office` - but they must not answer it in different words. A point that
 * reads "shift" on one screen and "day" on the other is the same figure being
 * described two ways to two people who are about to argue over it.
 */

/** The windows worth a chip. Longer than a fortnight is what a picker is for. */
export const TREND_WINDOWS = [7, 14, 30, 90];

/**
 * What one point of a series is, and why it is that and not a shift.
 *
 * Each subject is measured over the span its own card is measured over: a vessel
 * per day because a charge crosses the shift change, a yield per batch because
 * that is what a yield belongs to. Forcing all of them onto one span would make
 * the series tidier and three of them wrong - see the note on the server.
 */
export const spanNoun = (span?: TrendSubject['span'] | null) => {
  if (span === 'day') {
    return {
      one: 'day',
      plural: 'days',
      column: 'Day',
      why: 'a vessel is counted per day, because a charge crosses the shift change.',
    };
  }
  if (span === 'batch') {
    return {
      one: 'batch',
      plural: 'batches',
      column: 'Batch',
      why: 'a yield belongs to its batch, not to a shift.',
    };
  }
  return {
    one: 'shift',
    plural: 'shifts',
    column: 'When',
    why: 'a line or grade is measured per shift.',
  };
};

/**
 * What to call one point - the batch where it has a name, the day and shift
 * otherwise. Used for the best and worst of a window, which are named rather
 * than left as bare numbers: the point of a best is somebody to go and ask what
 * they did differently.
 */
export const pointName = (
  point?: { date: string; shift?: string | null; label?: string | null } | null,
) => {
  if (!point) return '—';
  if (point.label) return point.label;
  return `${dayLong(point.date)}${point.shift ? ` · ${point.shift}` : ''}`;
};
