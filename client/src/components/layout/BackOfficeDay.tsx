import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchShiftOptions } from '@/features/reports/reportsSlice';
import { setBackOfficeDay, setBackOfficeShift } from '@/features/ui/uiSlice';
import { dayLong } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { Shift } from '@/types/models';

/**
 * The day and shift the back office is reading, picked once above the tabs.
 *
 * It used to live inside each tab, which meant three copies of the same
 * question. A manager looking at 20 August on Efficiency switched to History and
 * was put back on "all days"; switched to the ideals and back and was on the
 * newest shift again. The thing being analysed changed underneath them halfway
 * through analysing it, and nothing on the screen said it had.
 *
 * So it sits above the tab strip, where what it governs is visible: everything
 * below it is about this day. It is loaded from the shift list rather than a
 * free date box because only some days have runs, and a manager typing a date
 * the plant did not work should get the answer "nothing here" from a picker that
 * never offered it rather than from an empty screen.
 */
export function BackOfficeDay() {
  const dispatch = useAppDispatch();
  const shifts = useAppSelector((s) => s.reports.shifts);
  const day = useAppSelector((s) => s.ui.backOfficeDay);
  const shift = useAppSelector((s) => s.ui.backOfficeShift);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  useEffect(() => {
    void dispatch(fetchShiftOptions());
  }, [dispatch, refreshTick]);

  /*
   * Open on the newest shift on record, once, and never again. The guard is the
   * whole point: without it every arrival on a tab would drag the picker back to
   * today, which is the behaviour this replaced.
   */
  useEffect(() => {
    if (day || !shifts.length) return;
    const first = shifts[0];
    if (!first) return;
    dispatch(setBackOfficeDay(first.date));
    dispatch(setBackOfficeShift(first.shifts.includes('Day') ? 'Day' : (first.shifts[0] ?? 'Day')));
  }, [dispatch, shifts, day]);

  /** Which shifts that day actually holds, so the picker can say "no data". */
  const available = shifts.find((s) => s.date === day)?.shifts ?? [];

  return (
    <div className="daybar">
      <label htmlFor="bo-day">Reading</label>
      <select
        id="bo-day"
        value={day}
        onChange={(e) => dispatch(setBackOfficeDay(e.target.value))}
      >
        {shifts.length ? (
          shifts.map((s) => (
            <option key={s.date} value={s.date}>
              {dayLong(s.date)}
            </option>
          ))
        ) : (
          <option value="">No data</option>
        )}
      </select>

      <div className="chips">
        {(['Day', 'Night'] as Shift[]).map((s) => (
          <button
            key={s}
            type="button"
            className={cn('chip', shift === s && 'on')}
            onClick={() => dispatch(setBackOfficeShift(s))}
          >
            {s}
            {available.length > 0 && !available.includes(s) && (
              <span className="muted font-normal"> ·no data</span>
            )}
          </button>
        ))}
      </div>

      <span className="muted text-[11px]">every tab below reads this shift</span>
    </div>
  );
}

export default BackOfficeDay;
