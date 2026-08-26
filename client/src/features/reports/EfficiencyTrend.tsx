import { useState } from 'react';
import { BoModal } from '@/components/ui';
import { OperatorChip } from '@/features/operators/OperatorChip';
import { useEfficiencyTrend } from '@/features/reports/useEfficiencyTrend';
import { TREND_WINDOWS, pointName, spanNoun } from '@/features/reports/trendText';
import { dayLong, todayISO } from '@/utils/date';
import { num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { TrendMetric, TrendPoint, TrendSummary } from '@/types/models';

/**
 * One line, grade or vessel followed across a period.
 *
 * The shift view answers "how did last night go", and the question that always
 * follows it is "is that normal" - which nothing in this app could ask. A single
 * shift against a benchmark says hit or miss and nothing about whether the line
 * has been drifting for a fortnight, and the plant pays an incentive on these
 * figures: one bad shift is an argument, ten in a row is a fact.
 *
 * Read at two depths on purpose. The band at the top is the answer - how often
 * the figure was met, what it averaged, and the best and worst shifts by name,
 * so somebody can go and ask about them. The list under it is the working, for
 * when the answer is disputed, which with money attached it will be.
 */


/**
 * A figure in the table, and the point it came off.
 *
 * Both, because neither answers on its own. The arithmetic says how the
 * number was reached; the point says what else was true that shift - what it
 * weighed, who was on it, how long it ran - and "why was Tuesday night 3.15"
 * is nearly always answered by the second.
 */
type Detail = { metric: TrendMetric; point: TrendPoint } | null;

/** How far off, and whether that is the good side. */
function Delta({ metric }: { metric: TrendMetric }) {
  if (metric.ideal == null) return <span className="effnote">no target</span>;
  const good = !metric.offTarget;
  return (
    <span className={good ? 'effhit' : 'effmiss'}>
      {metric.variance != null && metric.variance > 0 ? '+' : ''}
      {metric.variance ?? '—'}
      {metric.variancePct != null && ` · ${metric.variancePct > 0 ? '+' : ''}${metric.variancePct}%`}
    </span>
  );
}

/** What the window says about one figure: the answer, before the working. */
function Band({ metric, points }: { metric: TrendSummary; points: number }) {
  const hit =
    metric.count && metric.onTarget != null
      ? Math.round((metric.onTarget / metric.count) * 100)
      : 0;

  return (
    <div className={cn('effcard', (metric.offTarget ?? 0) > 0 && 'flag')}>
      <div className="row">
        <div>
          <b>{metric.label}</b>
          <div className="muted text-[11px]">
            {metric.ideal == null ? 'no target set' : `target ${metric.ideal} ${metric.unit}`}
            {' · '}
            {metric.lowerIsBetter ? '↓ lower is better' : '↑ higher is better'}
          </div>
        </div>
        <div className="cardaside">
          <div>
            averaged <b>{metric.average}</b> {metric.unit}
          </div>
        </div>
      </div>

      <div className="kpis">
        {/*
          Nothing to be on target against is not the same as being on target.
          A figure whose benchmark nobody has filled in has offTarget false on
          every point, so counting hits would have reported an unmeasured line
          as a perfect one - batch yield, which carries no ideal today, read
          "2 of 2 on target" while being held to nothing at all.
        */}
        <div className="kpi">
          {metric.ideal == null ? (
            <>
              <b>{metric.count}</b>
              <span>measured · no target set</span>
            </>
          ) : (
            <>
              <b style={metric.offTarget ? { color: 'var(--err)' } : undefined}>
                {metric.onTarget}/{metric.count}
              </b>
              {/*
                Of the ones that measured it, which is not always all of them -
                a shift with no meter reading has no electricity figure, and
                counting it as a zero would report the line as twice as good as
                it ran. Said out loud where the two differ, so the denominator
                is never a puzzle.
              */}
              <span>
                on target · {hit}%
                {metric.count < points && ` · ${points - metric.count} not measured`}
              </span>
            </>
          )}
        </div>
        <div className="kpi">
          <b>{metric.best?.value ?? '—'}</b>
          {/* Best by which way is good, not by which number is bigger - see the
              note on the server. The shift is named because the point of a best
              is somebody to go and ask what they did differently. */}
          <span>best · {pointName(metric.best)}</span>
        </div>
        <div className="kpi">
          <b>{metric.worst?.value ?? '—'}</b>
          <span>worst · {pointName(metric.worst)}</span>
        </div>
      </div>
    </div>
  );
}

export function EfficiencyTrend() {
  const {
    from,
    to,
    subject,
    data,
    loading,
    error,
    isWindow,
    pickWindow,
    setFrom,
    setTo,
    setSubject,
  } = useEfficiencyTrend();

  /** The figure whose working is open, if any. */
  const [detail, setDetail] = useState<Detail>(null);

  const span = data?.subject?.span;

  return (
    <>
      <div className="panel">
        <div className="chips">
          {TREND_WINDOWS.map((n) => (
            <button
              key={n}
              type="button"
              className={cn('chip', isWindow(n) && 'on')}
              onClick={() => pickWindow(n)}
            >
              Last {n} days
            </button>
          ))}
        </div>

        <div className="bar mt-2.5">
          <div className="f">
            <label htmlFor="t-from">From</label>
            <input
              id="t-from"
              type="date"
              value={from}
              max={to || todayISO()}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="f">
            <label htmlFor="t-to">To</label>
            <input
              id="t-to"
              type="date"
              value={to}
              min={from || undefined}
              max={todayISO()}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="bar mt-2.5">
          <div className="f">
            <label htmlFor="t-subject">Compare</label>
            {/*
              The subjects the window actually holds, sent with the series rather
              than listed from the machine table. A picker offering the whole
              plant and answering half of it with a blank page reads as a broken
              screen rather than as a line that did not run that week.
            */}
            <select id="t-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">— pick a line or grade —</option>
              {data?.subjects.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} · {s.points}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sub mt-2">
          The same figures the shift view holds against a benchmark, followed across the period
          instead of read one shift at a time. Every point is measured the way its own card is:
          {' '}
          {spanNoun(span).why}
        </div>
      </div>

      {error && <div className="errbox">Couldn’t work out the period: {error}</div>}
      {loading && <div className="spin">Working out the period…</div>}

      {!loading && !error && data && !data.subjects.length && (
        <div className="empty">Nothing was logged in this period.</div>
      )}

      {!loading && !error && data?.subject && (
        <>
          <div className="grouphead">
            {data.subject.label} · {dayLong(from)} to {dayLong(to)} · {data.points.length}{' '}
            {spanNoun(span).plural}
          </div>

          {data.summary.length ? (
            data.summary.map((m) => <Band key={m.key} metric={m} points={data.points.length} />)
          ) : (
            <div className="empty">
              Nothing on this line carried a measurable figure in the period.
            </div>
          )}

          <div className="grouphead">Every one of them</div>
          <div className="panel scroll-x mt-0 p-0">
            <table className="tt min-w-[520px]">
              <thead>
                <tr>
                  <th>{spanNoun(span).column}</th>
                  {data.points[0]?.metrics.map((m) => (
                    <th key={m.key} className="tnum">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.points.map((p) => (
                  <tr key={`${p.date}|${p.shift ?? ''}|${p.label ?? ''}`}>
                    <td>
                      <b>{p.label ?? dayLong(p.date)}</b>
                      {p.shift && <div className="muted text-[10px]">{p.shift} shift</div>}
                      {p.label && <div className="muted text-[10px]">{dayLong(p.date)}</div>}
                      <OperatorChip operator={p.operator} />
                      {p.out != null && (
                        <div className="muted text-[10px]">{num(p.out, 0)} kg out</div>
                      )}
                    </td>
                    {/*
                      Keyed off the first point's metrics so the columns line up,
                      and looked up per row rather than mapped in order: a shift
                      that never recorded its meter has one metric fewer, and
                      mapping positionally would have slid its output figure into
                      the electricity column.
                    */}
                    {data.points[0]?.metrics.map((col) => {
                      const m = p.metrics.find((x) => x.key === col.key);
                      return (
                        <td key={col.key} className="tnum">
                          {m ? (
                            /*
                              Every figure opens its own working, the way the
                              shift cards do. Over a period it matters more
                              rather than less: a table of bare numbers ends
                              every "why was that one low" with somebody going
                              back to the paper.
                            */
                            <button
                              type="button"
                              className="figure"
                              onClick={() => setDetail({ metric: m, point: p })}
                              title="How this was worked out"
                            >
                              <b>{m.value}</b>
                              <div className="text-[10px]">
                                <Delta metric={m} />
                              </div>
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <BoModal
        open={Boolean(detail)}
        title={detail?.metric.calc?.title ?? detail?.metric.label ?? ''}
        subtitle={
          detail
            ? `${detail.point.label ?? dayLong(detail.point.date)}${
              detail.point.shift ? ` · ${detail.point.shift} shift` : ''
            }`
            : ''
        }
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <div className="calc">
              {detail.metric.calc ? (
                <>
                  <div>
                    <b>Formula:</b> {detail.metric.calc.formula}
                  </div>
                  {detail.metric.calc.lines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                  <div>
                    = <b className="res">{detail.metric.calc.result}</b>
                  </div>
                </>
              ) : (
                <div>
                  {detail.metric.value} {detail.metric.unit}
                </div>
              )}
            </div>

            {/* Against the manager's figure, and which way is the good way. */}
            <div className="roRow">
              <span className="k">Target</span>
              <span className="v">
                {detail.metric.ideal == null ? 'none set' : `${detail.metric.ideal} ${detail.metric.unit}`}
                {detail.metric.ideal != null && (
                  <span className="muted">
                    {' · '}
                    {detail.metric.lowerIsBetter ? 'lower is better' : 'higher is better'}
                  </span>
                )}
              </span>
            </div>
            {detail.metric.ideal != null && (
              <div className="roRow">
                <span className="k">Against it</span>
                <span className="v">
                  <Delta metric={detail.metric} />
                </span>
              </div>
            )}

            {/*
              What else was true that shift. The arithmetic says how the number
              was reached and this says why it was that number - the crew, the
              hours, the batches on the line. It is the half somebody actually
              goes looking for.
            */}
            <div className="grouphead">That shift</div>
            {detail.point.out != null && (
              <div className="roRow">
                <span className="k">Weighed out</span>
                <span className="v">{num(detail.point.out, 0)} kg</span>
              </div>
            )}
            {detail.point.labour != null && (
              <div className="roRow">
                <span className="k">Man-hours</span>
                <span className="v">
                  <b>{num(detail.point.labour, 2)}</b>
                  <span className="muted">
                    {' over '}
                    {detail.point.parts?.length ?? 0} record
                    {(detail.point.parts?.length ?? 0) === 1 ? '' : 's'}
                  </span>
                </span>
              </div>
            )}
            {detail.point.kwh != null && (
              <div className="roRow">
                <span className="k">Energy</span>
                <span className="v">{num(detail.point.kwh, 1)} kWh</span>
              </div>
            )}
            {detail.point.charge != null && (
              <div className="roRow">
                <span className="k">Charge</span>
                <span className="v">{num(detail.point.charge, 0)} kg</span>
              </div>
            )}
            {Boolean(detail.point.batches?.length) && (
              <div className="roRow">
                <span className="k">Batches</span>
                <span className="v">{detail.point.batches?.join(', ')}</span>
              </div>
            )}
            <div className="roRow">
              <span className="k">Operator</span>
              <span className="v">
                {detail.point.operator === undefined
                  ? 'not a line'
                  : (detail.point.operator ?? 'nobody set')}
              </span>
            </div>

            {/*
              And the shift opened up, record by record.

              A shift on the special line is two to four passes, often on
              different machines and sometimes across two batches, and every
              figure above is their sum. This is what it was added up from - the
              hours each pass took, the crew on it, and the man-hours that came
              to. Without it the answer to "why was that one low" stops at a
              total, and the next place to look is the paper.

              Split by record rather than by batch, because a pass can name two
              - the plant writes "3134,3140" on one that worked both. Splitting
              by batch would mean cutting a pass in two and inventing the
              proportion, which is a worse answer than showing where the two
              actually met.
            */}
            {Boolean(detail.point.parts?.length) && (
              <>
                <div className="grouphead">
                  Every record · {detail.point.parts?.length}
                </div>
                <div className="scroll-x">
                  <table className="tt min-w-[420px]">
                    <thead>
                      <tr>
                        <th>Machine</th>
                        <th>Batch</th>
                        <th className="tnum">Crew</th>
                        <th className="tnum">Hours</th>
                        <th className="tnum">Man-hours</th>
                        <th className="tnum">Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.point.parts?.map((part) => (
                        <tr key={part.runId}>
                          <td>{part.machine ?? part.machineId ?? '—'}</td>
                          <td>
                            {part.batch ? (
                              <span className="batchref text-xs">{part.batch}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="tnum">{part.workers ?? '—'}</td>
                          <td className="tnum">{num(part.hours, 2)}</td>
                          <td className="tnum">
                            <b>{num(part.labour, 2)}</b>
                          </td>
                          {/*
                            Blank where the pass weighed nothing, which is most
                            of them: on the special line only the finishing pass
                            is weighed, and the ones before it are the same
                            material moving on. A nought there would read as a
                            pass that produced nothing.
                          */}
                          <td className="tnum">
                            {part.out == null ? (
                              <span className="muted">not weighed</span>
                            ) : (
                              `${num(part.out, 0)} kg`
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {detail.metric.calc?.note && <div className="sub mt-2">{detail.metric.calc.note}</div>}
          </>
        )}
      </BoModal>
    </>
  );
}

export default EfficiencyTrend;
