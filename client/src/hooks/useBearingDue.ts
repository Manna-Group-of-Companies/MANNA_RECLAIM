import { useAppSelector } from '@/app/hooks';
import { useTicker } from './useTicker';
import type { BearingDue } from '@/types/models';

/**
 * How often the countdown is re-worked.
 *
 * `dueInMin` is read out to the minute, so anything under a minute is redrawing
 * the same figure; anything much over it and a machine sits a visible while
 * past its interval before the button admits it. Thirty seconds means the amber
 * arrives within half a minute of the machine actually falling due, on a screen
 * that is glanced at rather than watched.
 */
const TICK_MS = 30_000;

/**
 * One row's freshness, worked against the clock now rather than the clock the
 * server answered on.
 *
 * The arithmetic is deliberately the same line as `dueList` in
 * server/src/services/maintenance.service.js, the "never logged counts as due"
 * rule included. The server still decides `lastAt` - when the temperatures were
 * actually taken is a fact only it holds - and this only re-asks the question
 * that fact answers, which is "is that long ago yet".
 *
 * The row is returned unchanged when nothing about it has moved, so a card that
 * is not near its interval keeps its identity across a tick instead of being
 * rebuilt every thirty seconds.
 */
export const freshenDue = (row: BearingDue, now = Date.now()): BearingDue => {
  if (row.lastAt == null) {
    return row.due && row.dueInMin === 0 ? row : { ...row, dueInMin: 0, due: true };
  }
  const dueInMin = Math.round((row.lastAt + row.intervalH * 3.6e6 - now) / 60000);
  const due = dueInMin <= 0;
  if (dueInMin === row.dueInMin && due === row.due) return row;
  return { ...row, dueInMin, due };
};

/**
 * What is due for temperatures, kept true as the shift goes on.
 *
 * The bug this exists for: `due` and `dueInMin` are worked out on the server at
 * the moment the list is fetched, and on the floor that list is fetched once -
 * when the tablet lands on a tab. A tablet is then left open on Machines for a
 * whole shift. So a machine logged at 09:00 on a three-hour interval was 180
 * minutes off at mount, and stayed 180 minutes off: noon came and went, the
 * button never turned amber, the pulse never started and the tab badge never
 * counted it. The one thing that made it appear was a reload, which is the one
 * thing nobody does mid-shift.
 *
 * Derived on render rather than memoised against the rows, for the same reason
 * useOnApp is: this is a comparison against the clock, so the answer changes as
 * time passes and not only when the rows do. The ticker is what re-renders it,
 * and the work is a subtraction over a dozen machines.
 *
 * Note what this does not fix: temperatures logged on *another* tablet still
 * need a re-read before this device stops asking for them. That is a fetch, and
 * it is on UserLayout.
 */
export function useBearingDue(): BearingDue[] {
  const rows = useAppSelector((s) => s.maintenance.due);
  useTicker(TICK_MS);
  return rows.map((row) => freshenDue(row));
}

export default useBearingDue;
