import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchShiftEfficiency, fetchShiftOptions } from '@/features/reports/reportsSlice';
import { setBackOfficeDay, setBackOfficeShift } from '@/features/ui/uiSlice';
import { PageLoader, ViewHead } from '@/components/ui';
import { dayLong } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { EfficiencyCard, EfficiencyMetric, Shift } from '@/types/models';

/**
 * How the shift did, on the tablet, for the crew that worked it.
 *
 * The plant pays an incentive on these figures. A target somebody is paid
 * against and cannot see is not a target - it is a surprise at the end of the
 * month - so the supervisor closes the shift and reads the same numbers the
 * office will read, on the same day, off the same arithmetic.
 *
 * What this is not is the back office's Efficiency tab shrunk down. That screen
 * asks a supervisor to explain a miss and keeps the answer; this one only
 * reports. No reason buttons, no notes, no month's review - a hit or a miss
 * against a number, per machine, and the date it was.
 */

/** Hit or miss, in the plainest words the screen has. */
function Verdict({ metric }: { metric: EfficiencyMetric }) {
  if (metric.ideal == null) return <span className="effnote">no target set</span>;
  if (metric.offTarget) return <span className="effmiss">off target</span>;
  return <span className="effhit">on target</span>;
}

function Row({ metric }: { metric: EfficiencyMetric }) {
  const shown =
    metric.value == null ? '—' : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
  return (
    <div className={cn('effline', metric.offTarget && 'miss')}>
      <div className="effname">
        {metric.label}
        {metric.span && <span className="effspan">{metric.span}</span>}
      </div>
      <div className="effnums">
        <b>{shown}</b>
        {metric.ideal != null && (
          <span className="efftarget">
            target {metric.ideal}
            {/*
              Which way is good, said on the row. Two figures here can both sit
              above their target with only one of them in trouble - more kg per
              man-hour is better, more kWh per kg is worse - and a crew paid on
              these should never have to work out which is which.
            */}
            <span className="muted"> · {metric.lowerIsBetter ? 'lower is better' : 'higher is better'}</span>
          </span>
        )}
        <Verdict metric={metric} />
      </div>
    </div>
  );
}

function Card({ card, title }: { card: EfficiencyCard; title: string }) {
  const missed = card.metrics.filter((m) => m.offTarget).length;
  return (
    <div className={cn('effblock', missed > 0 && 'flag')}>
      <div className="effhead">
        <b>{title}</b>
        {missed > 0 ? (
          <span className="effmiss">
            {missed} off target
          </span>
        ) : (
          <span className="effhit">all on target</span>
        )}
      </div>
      {card.metrics.map((m) => (
        <Row key={m.key} metric={m} />
      ))}
    </div>
  );
}

export function UserEfficiencyPage() {
  const dispatch = useAppDispatch();
  const { shifts, shiftEfficiency, loading, error } = useAppSelector((s) => s.reports);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  /*
   * The same day the rest of the app is reading, so a supervisor who picked a
   * shift on History finds it picked here too. Shared through the store rather
   * than kept per page - see BackOfficeDay for what that fixed.
   */
  const date = useAppSelector((s) => s.ui.backOfficeDay);
  const shift = useAppSelector((s) => s.ui.backOfficeShift);

  useEffect(() => {
    void dispatch(fetchShiftOptions());
  }, [dispatch, refreshTick]);

  // Open on the newest shift on record if nothing has been picked anywhere yet.
  useEffect(() => {
    if (date || !shifts.length) return;
    const first = shifts[0];
    if (!first) return;
    dispatch(setBackOfficeDay(first.date));
    dispatch(setBackOfficeShift(first.shifts.includes('Day') ? 'Day' : (first.shifts[0] ?? 'Day')));
  }, [dispatch, shifts, date]);

  useEffect(() => {
    if (!date) return;
    void dispatch(fetchShiftEfficiency({ date, shift }));
  }, [dispatch, date, shift, refreshTick]);

  /** Every card on the screen, with the heading it is read under. */
  const cards = useMemo(() => {
    const s = shiftEfficiency;
    if (!s) return [];
    return [
      ...(s.refiners ?? []).map((c) => ({ card: c, title: `Special line · ${c.quality}` })),
      ...(s.grinders ?? []).map((c) => ({ card: c, title: c.machine ?? 'Grinder' })),
      ...(s.coarse ?? []).map((c) => ({ card: c, title: c.label ?? 'Coarse line' })),
      ...(s.autoclaves ?? []).map((c) => ({ card: c, title: c.label ?? 'Autoclave' })),
      ...(s.yields ?? []).map((c) => ({ card: c, title: `Batch ${c.batch} · yield` })),
    ];
  }, [shiftEfficiency]);

  const missed = cards.reduce(
    (n, { card }) => n + card.metrics.filter((m) => m.offTarget).length,
    0,
  );
  const measured = cards.reduce(
    (n, { card }) => n + card.metrics.filter((m) => m.ideal != null).length,
    0,
  );

  const available = shifts.find((s) => s.date === date)?.shifts ?? [];

  return (
    <>
      <ViewHead title="Efficiency" meta={date ? dayLong(date) : 'no data'} />

      <div className="panel">
        <div className="field">
          <label htmlFor="ue-day">Shift day</label>
          <select
            id="ue-day"
            value={date}
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
        </div>

        <div className="chips">
          {(['Day', 'Night'] as Shift[]).map((s) => (
            <button
              key={s}
              type="button"
              className={cn('chip', shift === s && 'on')}
              onClick={() => dispatch(setBackOfficeShift(s))}
            >
              {s} shift
              {available.length > 0 && !available.includes(s) && (
                <span className="muted font-normal"> ·no data</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="errbox">Couldn’t load the shift: {error}</div>}
      {loading && <PageLoader label="Working out the shift" />}

      {!loading && shiftEfficiency && (
        <>
          {/*
            The headline first, because it is the one the incentive turns on and
            the crew should not have to add the cards up themselves.
          */}
          <div className={cn('effsum', missed > 0 && 'flag')}>
            <b>{measured - missed}</b> of <b>{measured}</b> figures on target
            {missed > 0 && <div className="effnote">{missed} to look at below</div>}
          </div>

          {cards.length ? (
            cards.map(({ card, title }) => <Card key={card.key} card={card} title={title} />)
          ) : (
            <div className="empty">Nothing was logged on this shift.</div>
          )}
        </>
      )}
    </>
  );
}

export default UserEfficiencyPage;
