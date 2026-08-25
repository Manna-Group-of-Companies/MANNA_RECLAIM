import { useState } from 'react';
import { FieldRow, SelectField, TextField } from '@/components/ui';
import { OperatorChip } from '@/features/operators/OperatorChip';
import { useEfficiencyTrend } from '@/features/reports/useEfficiencyTrend';
import { TREND_WINDOWS, pointName, spanNoun } from '@/features/reports/trendText';
import { dayLong, todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { TrendMetric, TrendSummary } from '@/types/models';

/**
 * How a line has been running, on the tablet, for the crew that runs it.
 *
 * The shift view above this answers "how did last night go". This answers the
 * one that follows it - "is that normal" - and the crew has more reason to ask
 * it than anyone: the plant pays an incentive on these figures, and a shift told
 * only that it missed cannot tell whether it had a bad night or the line has
 * been drifting for a fortnight. Somebody about to lose money on a number is
 * entitled to see the run of it.
 *
 * The back office asks the same question of the same endpoint and draws it as a
 * table. This is not that component and could not be: nearly every class the
 * back office draws with is declared under `.back-office`, so the same markup
 * here renders as bare text. What the two share is the hook and the wording -
 * see trendText - because a point that reads "shift" on one screen and "day" on
 * the other is the same figure described two ways to two people who are about to
 * argue over it.
 *
 * Folded away until it is opened, and costing no request until then. The shift
 * is what the crew came to this tab for; the period is a question they ask
 * sometimes.
 */

/** Hit or miss on one point, in the plainest words the screen has. */
function Verdict({ metric }: { metric: TrendMetric }) {
  if (metric.ideal == null) return <span className="effnote">no target</span>;
  return metric.offTarget ? (
    <span className="effmiss">off target</span>
  ) : (
    <span className="effhit">on target</span>
  );
}

/**
 * What the period says about one figure - the answer, before the working.
 *
 * The count of hits leads, because that is what an incentive is settled on. The
 * best and worst are named rather than left as bare numbers: the point of a best
 * shift is somebody to go and ask what they did differently.
 */
function Band({ metric, points }: { metric: TrendSummary; points: number }) {
  /*
   * Nothing to be on target against is not the same as being on target. A
   * figure whose benchmark nobody has filled in has offTarget false on every
   * point, so counting hits would report an unmeasured line as a perfect one -
   * batch yield, which carries no ideal today, read "2 of 2 on target" while
   * being held to nothing at all. On a screen an incentive is argued from, that
   * is the worst sentence it could print.
   */
  const untargeted = metric.ideal == null;
  return (
    <div className={cn('effsum', (metric.offTarget ?? 0) > 0 && 'flag')}>
      {untargeted ? (
        <>
          <b>{metric.count}</b> measured · {metric.label.toLowerCase()}
        </>
      ) : (
        <>
          <b>{metric.onTarget}</b> of <b>{metric.count}</b> on target ·{' '}
          {metric.label.toLowerCase()}
        </>
      )}
      <div className="effnote">
        averaged {metric.average} {metric.unit}
        {untargeted
          ? ' — nobody has set a target for this yet'
          : ` against a target of ${metric.ideal}, where ${
              metric.lowerIsBetter ? 'lower is better' : 'higher is better'
            }`}
      </div>
      {/*
        Where a figure was not recorded on every point it is said out loud. A
        shift with no meter reading has no electricity figure, it is left out of
        the average rather than counted as a nought, and a denominator that
        silently disagreed with the number of shifts above would be read as a
        mistake in the screen.
      */}
      {metric.count < points && (
        <div className="effnote">{points - metric.count} not measured, and left out</div>
      )}
      <div className="effnote">
        best {metric.best?.value} on {pointName(metric.best)} · worst {metric.worst?.value} on{' '}
        {pointName(metric.worst)}
      </div>
    </div>
  );
}

export function ShiftTrend() {
  const [open, setOpen] = useState(false);
  const { from, to, subject, data, loading, error, isWindow, pickWindow, setFrom, setTo, setSubject } =
    useEfficiencyTrend({ enabled: open });

  const span = data?.subject?.span;
  const words = spanNoun(span);

  return (
    <>
      <div className="msec">
        <b>Over a period</b>
        <div className="ln" />
        <button
          type="button"
          className="ct underline underline-offset-4"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? 'hide' : 'how has this line been running?'}
        </button>
      </div>

      {open && (
        <>
          <div className="panel">
            {/*
              Two selects and two dates, the way every other sheet on this tab
              asks for a span. The named windows are a select rather than chips
              because `.chip` is declared under `.back-office` and draws here as
              bare text with nothing between the buttons.
            */}
            <SelectField
              label="How far back"
              value={TREND_WINDOWS.find((n) => isWindow(n)) ?? ''}
              onChange={(e) => e.target.value && pickWindow(Number(e.target.value))}
            >
              {TREND_WINDOWS.map((n) => (
                <option key={n} value={n}>
                  Last {n} days
                </option>
              ))}
              <option value="">A period of my own</option>
            </SelectField>

            <FieldRow>
              <TextField
                label="From"
                type="date"
                value={from}
                max={to || todayISO()}
                onChange={(e) => setFrom(e.target.value)}
              />
              <TextField
                label="To"
                type="date"
                value={to}
                min={from || undefined}
                max={todayISO()}
                onChange={(e) => setTo(e.target.value)}
              />
            </FieldRow>

            <SelectField
              label="Which line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              note={data?.subject ? `— ${data.points.length} ${words.plural}` : undefined}
            >
              <option value="">— pick a line or grade —</option>
              {data?.subjects.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} · {s.points}
                </option>
              ))}
            </SelectField>

            <div className="sub">
              The same figures as above, followed across the period instead of read one shift at a
              time. {words.why}
            </div>
          </div>

          {error && <div className="hint" style={{ color: 'var(--err)' }}>Couldn’t work it out: {error}</div>}
          {loading && <div className="empty">Working out the period…</div>}

          {!loading && !error && data && !data.subjects.length && (
            <div className="empty">Nothing was logged in this period.</div>
          )}

          {!loading && !error && data?.subject && (
            <>
              {data.summary.length ? (
                data.summary.map((m) => <Band key={m.key} metric={m} points={data.points.length} />)
              ) : (
                <div className="empty">Nothing here carried a measurable figure in the period.</div>
              )}

              {data.points.map((p) => (
                <div
                  key={`${p.date}|${p.shift ?? ''}|${p.label ?? ''}`}
                  className={cn('effblock', p.metrics.some((m) => m.offTarget) && 'flag')}
                >
                  <div className="effhead">
                    <b>
                      {p.label ?? dayLong(p.date)}
                      <OperatorChip operator={p.operator} />
                    </b>
                    {/*
                      What the title does not already say. A batch is named, so
                      the day goes here; a shift point says which shift; and a
                      point counted over a whole day says so rather than leaving
                      the reader to notice that the shift is missing.
                    */}
                    <span className="effnote">
                      {p.label
                        ? dayLong(p.date)
                        : p.shift
                          ? `${p.shift} shift`
                          : 'whole day'}
                      {p.out != null && ` · ${p.out} kg`}
                    </span>
                  </div>
                  {p.metrics.map((m) => (
                    <div key={m.key} className={cn('effline', m.offTarget && 'miss')}>
                      <div className="effname">
                        <div>{m.label}</div>
                      </div>
                      <div className="effnums">
                        <b>
                          {m.value} {m.unit}
                        </b>
                        {m.ideal != null && (
                          <span className="efftarget">
                            target {m.ideal}
                            <span className="muted">
                              {' '}
                              · {m.lowerIsBetter ? 'lower is better' : 'higher is better'}
                            </span>
                          </span>
                        )}
                        <Verdict metric={m} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

export default ShiftTrend;
