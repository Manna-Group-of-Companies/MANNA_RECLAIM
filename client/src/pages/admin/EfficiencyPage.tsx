import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addEfficiencyNote,
  addVarianceReason,
  fetchShiftEfficiency,
  fetchShiftOptions,
  fetchVarianceReasons,
  updateVarianceReason,
} from '@/features/reports/reportsSlice';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { dayLong } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { EfficiencyCard, EfficiencyMetric, Shift, VarianceReason } from '@/types/models';

type CalcTarget = EfficiencyMetric['calc'];
type NoteTarget = { line: 'refiner' | 'grind'; metric: string } | null;
/** Which figure the manager is being asked to explain, and against what. */
type VarianceTarget = { card: string; metric: EfficiencyMetric } | null;

/** "−240 kg (−12%)" — the gap, in the unit and as a proportion of the target. */
function varianceText(metric: EfficiencyMetric): string {
  if (metric.variance == null) return '';
  const sign = metric.variance > 0 ? '+' : '';
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const pct = metric.variancePct == null ? '' : ` (${sign}${metric.variancePct}%)`;
  return `${sign}${metric.variance}${unit}${pct}`;
}

/**
 * One measured value against the manager's target for it.
 *
 * One comparison, not two. This used to show the plant's own median beside the
 * ideal, and a supervisor asked to explain a figure could reasonably ask which
 * of the two lines they were being held to - and the median answer changed every
 * month as the plant's history moved. What is drawn now is the figure, what it
 * was meant to be, and the gap.
 *
 * Three states a figure can be in, and they are deliberately different sentences:
 * off its ideal, on its ideal, or carrying no target at all. The third is not a
 * pass and is not drawn like one. It splits two ways, and the card tells them
 * apart: a figure that should have a target and does not says "no ideal set", so
 * somebody goes and sets it; a figure benchmarked over the whole day says which
 * card down the page does the comparing.
 */
function Metric({ metric, onCalc }: { metric: EfficiencyMetric; onCalc: (c: CalcTarget) => void }) {
  const shown =
    metric.value == null ? '—' : `${metric.value}${metric.unit ? ` ${metric.unit}`.trim() : ''}`;
  const onTarget = metric.ideal != null && metric.value != null && !metric.offTarget;
  // A key with nothing behind it: a target belongs on this figure and nobody has
  // set one. Said out loud rather than left as a missing line, because an
  // unbenchmarked figure reading as a clean card is how a sheet stays half
  // filled for a year.
  const noTarget = metric.parameter != null && metric.ideal == null;

  const body = (
    <>
      <span>
        {metric.label}
        {metric.calc && <span className="muted ml-1 text-[10px]">ⓘ how?</span>}
        {metric.warn && <span className="warnpill">{metric.warnLabel ?? 'flagged'}</span>}
        {metric.offTarget && <span className="warnpill">off ideal</span>}
        {onTarget && <span className="okpill">on ideal</span>}
        {noTarget && <span className="muted ml-1 text-[10px]">no ideal set</span>}
      </span>
      <span className="text-right">
        <span className="mv" style={metric.warn || metric.offTarget ? { color: 'var(--err)' } : undefined}>
          {shown}
        </span>
        {metric.context && <div className="mb">{metric.context}</div>}
        {metric.ideal != null && (
          <div className="mb" style={metric.offTarget ? { color: 'var(--err)' } : undefined}>
            ideal {metric.ideal}
            {metric.variance != null ? ` · ${varianceText(metric)}` : ''}
          </div>
        )}
      </span>
    </>
  );

  return metric.calc ? (
    <button type="button" className="metric" onClick={() => onCalc(metric.calc)}>
      {body}
    </button>
  ) : (
    <div className="metric">{body}</div>
  );
}

export function EfficiencyPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { shifts, shiftEfficiency, varianceReasons, loading, error } = useAppSelector(
    (s) => s.reports,
  );
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const user = useAppSelector((s) => s.auth.user);

  const [date, setDate] = useState('');
  const [shift, setShift] = useState<Shift>('Day');
  const [calc, setCalc] = useState<CalcTarget>(null);
  const [noteFor, setNoteFor] = useState<NoteTarget>(null);
  const [varianceFor, setVarianceFor] = useState<VarianceTarget>(null);
  const [editing, setEditing] = useState<VarianceReason | null>(null);
  const [reason, setReason] = useState('');
  const [enteredBy, setEnteredBy] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void dispatch(fetchShiftOptions());
  }, [dispatch, refreshTick]);

  // Open on the newest shift on record, and follow the day picker after that.
  useEffect(() => {
    if (date || !shifts.length) return;
    const first = shifts[0];
    if (!first) return;
    setDate(first.date);
    setShift(first.shifts.includes('Day') ? 'Day' : (first.shifts[0] ?? 'Day'));
  }, [shifts, date]);

  useEffect(() => {
    if (!date) return;
    void dispatch(fetchShiftEfficiency({ date, shift }));
  }, [dispatch, date, shift, refreshTick]);

  /**
   * The month the picked day falls in, for the review list underneath. Not the
   * whole record: a plant with years of these would be scrolling past two of
   * them to reach this month's, which is the one anybody is looking for.
   */
  const month = date.slice(0, 7);

  useEffect(() => {
    if (!month) return;
    void dispatch(fetchVarianceReasons({ from: `${month}-01`, to: `${month}-31` }));
  }, [dispatch, month, refreshTick]);

  const available = useMemo(
    () => shifts.find((s) => s.date === date)?.shifts ?? [],
    [shifts, date],
  );

  /**
   * How many figures in the shift came in off the manager's target. The one
   * number on this page that says whether the shift is answerable for anything,
   * so it counts misses against ideals and nothing else.
   */
  const offTarget = useMemo(() => {
    if (!shiftEfficiency) return 0;
    const cards = [
      ...shiftEfficiency.refiners,
      ...shiftEfficiency.grinders,
      ...(shiftEfficiency.coarse ?? []),
      ...(shiftEfficiency.autoclaves ?? []),
      ...(shiftEfficiency.days ?? []),
    ];
    return cards.reduce((n, c) => n + c.metrics.filter((m) => m.offTarget).length, 0);
  }, [shiftEfficiency]);

  const notesFor = (line: string, metric: string) =>
    (shiftEfficiency?.notes ?? []).filter((n) => n.line === line && n.metric === metric);

  const reasonsFor = (parameter?: string | null) =>
    (shiftEfficiency?.varianceReasons ?? []).filter((r) => r.parameter === parameter);

  const saveNote = async () => {
    if (!noteFor || !date) return;
    if (!reason.trim()) {
      notify('Say what caused the drop', 'warn');
      return;
    }
    setSaving(true);
    const result = await dispatch(
      addEfficiencyNote({
        date,
        shift,
        line: noteFor.line,
        metric: noteFor.metric,
        reason: reason.trim(),
        enteredBy: enteredBy.trim() || null,
      }),
    );
    setSaving(false);
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Reason recorded' : 'Could not save the reason', okay ? 'ok' : 'err');
    if (okay) {
      setNoteFor(null);
      setReason('');
    }
  };

  /**
   * Why this figure missed its target. Filed against the benchmark's own key
   * rather than the card's title, and with the two numbers that prompted it, so
   * a target raised next month leaves this record saying what it said.
   */
  const saveVarianceReason = async () => {
    if (!varianceFor || !date) return;
    if (!reason.trim()) {
      notify('Say why it came in off the ideal', 'warn');
      return;
    }
    setSaving(true);
    const result = await dispatch(
      addVarianceReason({
        date,
        shift,
        parameter: varianceFor.metric.parameter ?? varianceFor.metric.key,
        label: `${varianceFor.card} · ${varianceFor.metric.label}`,
        ideal: varianceFor.metric.ideal ?? null,
        actual: varianceFor.metric.value ?? null,
        reason: reason.trim(),
        enteredBy: enteredBy.trim() || null,
      }),
    );
    setSaving(false);
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Reason recorded' : 'Could not save the reason', okay ? 'ok' : 'err');
    if (okay) {
      setVarianceFor(null);
      setReason('');
    }
  };

  /** Corrects the wording of one already recorded. What it is about cannot move. */
  const saveEditedReason = async () => {
    if (!editing) return;
    if (!reason.trim()) {
      notify('A reason cannot be blank', 'warn');
      return;
    }
    setSaving(true);
    const result = await dispatch(
      updateVarianceReason({
        id: editing.id,
        reason: reason.trim(),
        enteredBy: enteredBy.trim() || null,
      }),
    );
    setSaving(false);
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Reason updated' : 'Could not update the reason', okay ? 'ok' : 'err');
    if (okay) {
      setEditing(null);
      setReason('');
    }
  };

  const openEdit = (row: VarianceReason) => {
    setReason(row.reason);
    setEnteredBy(row.entered_by ?? user?.name ?? '');
    setEditing(row);
  };

  /**
   * Refiner, grinder, coarse, autoclave and yield cards all render the same way.
   *
   * `line` is what an efficiency note is filed under, and the two cards that
   * have no place in that pair - coarse and the autoclaves - pass null and get
   * no note button. They are not left without a way to be explained: every card
   * here offers a reason against any figure that missed its ideal, which is the
   * record this screen was extended for.
   */
  const renderCard = (
    card: EfficiencyCard,
    line: 'refiner' | 'grind' | null,
    title: React.ReactNode,
    aside?: React.ReactNode,
  ) => {
    const metric = card.quality
      ? `Refiner ${card.quality}`
      : card.batch
        ? `Yield Batch ${card.batch}`
        : (card.machine ?? card.machineId ?? '');
    // What the card is called on a saved reason. `batch` is in the chain because
    // a yield card is named by nothing else - it has no machine, no grade and no
    // label - and yield only started carrying an ideal when the median it used
    // to be judged against was taken away. Without it a recorded reason reads
    // " · Yield" and the reader cannot tell which batch it was about.
    const name =
      card.label ?? card.machine ?? card.quality ?? card.machineId ??
      (card.batch ? `Batch ${card.batch}` : '');
    const missed = card.metrics.filter((m) => m.offTarget);
    const flagged = card.metrics.some((m) => m.warn) || missed.length > 0;
    const notes = line ? notesFor(line, metric) : [];

    return (
      <div key={card.key} className={cn('effcard', flagged && 'flag')}>
        <div className="row">
          <div>{title}</div>
          {aside && <div className="muted text-[11px]">{aside}</div>}
        </div>

        {card.metrics.map((m) => (
          <Metric key={m.key} metric={m} onCalc={setCalc} />
        ))}

        <div className="reasons">
          {notes.map((n) => (
            <div key={n.id}>
              <span className="muted">
                {n.created_at ? dayLong(n.created_at.slice(0, 10)) : ''}
                {n.entered_by ? ` · ${n.entered_by}` : ''}:
              </span>{' '}
              {n.reason}
            </div>
          ))}
          {card.metrics.flatMap((m) =>
            reasonsFor(m.parameter).map((r) => (
              <div key={r.id}>
                <span className="muted">
                  off ideal · {m.label}
                  {r.entered_by ? ` · ${r.entered_by}` : ''}:
                </span>{' '}
                {r.reason}{' '}
                <button
                  type="button"
                  className="muted underline text-[11px]"
                  onClick={() => openEdit(r)}
                >
                  edit
                </button>
              </div>
            )),
          )}
        </div>

        {missed.map((m) => (
          <button
            key={`why-${m.key}`}
            type="button"
            className="btn ghost block mt-2.5"
            onClick={() => {
              setReason('');
              setVarianceFor({ card: name, metric: m });
            }}
          >
            ⚠ Why is {m.label.toLowerCase()} off the ideal?
          </button>
        ))}

        {line && (
          <button
            type="button"
            className="btn ghost block mt-2.5"
            onClick={() => {
              setReason('');
              setNoteFor({ line, metric });
            }}
          >
            {/*
              `warn` is only ever the downtime flag now - every other comparison
              on this screen is against an ideal and gets its own "why is this
              off the ideal?" button above. Naming it as downtime rather than as
              "the dip" is the difference between a note somebody can answer and
              one they have to guess the question for.
            */}
            {card.metrics.some((m) => m.warn) ? '⚠ Record reason for the downtime' : '+ Add a note'}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="panel">
        <label htmlFor="eff-day">Shift day</label>
        <select id="eff-day" value={date} onChange={(e) => setDate(e.target.value)}>
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

        <div className="chips mt-2.5">
          {(['Day', 'Night'] as Shift[]).map((s) => (
            <button
              key={s}
              type="button"
              className={cn('chip', shift === s && 'on')}
              onClick={() => setShift(s)}
            >
              {s} shift
              {available.length > 0 && !available.includes(s) && (
                <span className="muted font-normal"> ·no data</span>
              )}
            </button>
          ))}
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{shiftEfficiency?.totals.runs ?? 0}</b>
            <span>runs</span>
          </div>
          <div className="kpi">
            <b>{shiftEfficiency?.totals.outKg ?? 0}</b>
            <span>kg out</span>
          </div>
          <div className="kpi">
            <b>{shiftEfficiency?.totals.kwh ?? 0}</b>
            <span>kWh</span>
          </div>
          <div className="kpi">
            <b style={offTarget ? { color: 'var(--err)' } : undefined}>{offTarget}</b>
            <span>off ideal</span>
          </div>
        </div>

        <div className="sub mt-2">
          Every figure here is compared with the ideal the manager set on the Ideal values tab, and
          with nothing else. Anything short of its ideal is flagged and asks for a reason; tap a
          figure to see the arithmetic.
        </div>
        <div className="sub mt-1">
          Each ideal is compared at the granularity it is set: production per shift, autoclave
          charges and batch yield per batch, and the energy and labour figures over the whole day.
          A figure marked “no ideal set” is not a pass — it is a target nobody has filled in.
        </div>

        {shiftEfficiency && shiftEfficiency.idealsSet === false && (
          <div className="sub mt-2" style={{ color: 'var(--err)' }}>
            No ideal values have been set yet, so nothing here is being compared with a target. Set
            them on the Rates tab.
          </div>
        )}
      </div>

      {error && <div className="errbox">Couldn’t load the shift: {error}</div>}
      {loading && <div className="spin">Working out the shift…</div>}

      {!loading && shiftEfficiency && (
        <>
          <div className="grouphead">
            Refiner line · {dayLong(shiftEfficiency.date)} · {shiftEfficiency.shift} shift
          </div>
          {shiftEfficiency.refiners.length ? (
            shiftEfficiency.refiners.map((card) =>
              renderCard(
                card,
                'refiner',
                <span className="qchip">{card.quality}</span>,
                card.batches?.length ? `Batch ${card.batches.join(', ')}` : null,
              ),
            )
          ) : (
            <div className="empty">No refiner activity in this shift.</div>
          )}

          {shiftEfficiency.yields.length > 0 && (
            <>
              <div className="grouphead">Yield · batches completed this shift</div>
              {shiftEfficiency.yields.map((card) =>
                renderCard(
                  card,
                  'refiner',
                  <b>Batch {card.batch}</b>,
                  `charge ${card.charge ?? '—'} kg`,
                ),
              )}
            </>
          )}

          <div className="grouphead">
            Grinding line · {dayLong(shiftEfficiency.date)} · {shiftEfficiency.shift} shift
          </div>
          {shiftEfficiency.grinders.length ? (
            shiftEfficiency.grinders.map((card) => renderCard(card, 'grind', <b>{card.machine}</b>))
          ) : (
            <div className="empty">No grinder output in this shift.</div>
          )}

          <div className="grouphead">
            Coarse line · {dayLong(shiftEfficiency.date)} · {shiftEfficiency.shift} shift
          </div>
          {shiftEfficiency.coarse?.length ? (
            shiftEfficiency.coarse.map((card) =>
              renderCard(card, null, <b>{card.label}</b>, `${card.workers ?? 0} crew`),
            )
          ) : (
            <div className="empty">No coarse output in this shift.</div>
          )}

          {/*
            Per day, not per shift: a vessel is charged, cooked and emptied across
            whatever shift boundary falls in the middle, so a per-shift count would
            report the same day's work differently depending on when the crew
            changed over. The heading says so rather than leaving it to be noticed.
          */}
          <div className="grouphead">Autoclave charges · {dayLong(shiftEfficiency.date)} · whole day</div>
          {shiftEfficiency.autoclaves?.length ? (
            shiftEfficiency.autoclaves.map((card) => renderCard(card, null, <b>{card.label}</b>))
          ) : (
            <div className="empty">No autoclave charges on this day.</div>
          )}

          {/*
            Energy and labour productivity are set as day figures, so they are
            compared as day figures, and this is the only place either is
            flagged. Both shifts are in each card - the shift cards above show
            the same two figures because that is the span a supervisor works,
            and they say plainly that the comparison is made down here.
          */}
          <div className="grouphead">
            Energy & labour · {dayLong(shiftEfficiency.date)} · whole day, both shifts
          </div>
          {shiftEfficiency.days?.length ? (
            shiftEfficiency.days.map((card) => renderCard(card, null, <b>{card.label}</b>))
          ) : (
            <div className="empty">Nothing weighed on this day.</div>
          )}

          {/*
            The month's reasons in one list. The cards above answer "why did this
            shift miss"; a record of misses is kept for the other question, which
            is what has been going wrong - and that one cannot be read a shift at
            a time.
          */}
          <div className="grouphead">Variance reasons recorded this month</div>
          {varianceReasons.length ? (
            <div className="panel scroll-x mt-0 p-0">
              <table className="tt min-w-[640px]">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Shift</th>
                    <th>Parameter</th>
                    <th className="tnum">Ideal</th>
                    <th className="tnum">Actual</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceReasons.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                      <td>{dayLong(r.shift_date)}</td>
                      <td className="muted">{r.shift ?? '—'}</td>
                      <td>{r.label ?? r.parameter}</td>
                      <td className="tnum">{r.ideal ?? '—'}</td>
                      <td className="tnum">{r.actual ?? '—'}</td>
                      <td>
                        {r.reason}
                        {r.entered_by && <span className="muted"> · {r.entered_by}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Nothing has been recorded off-target this month.</div>
          )}
        </>
      )}

      {/* how a number was arrived at */}
      <BoModal
        open={Boolean(calc)}
        title={calc?.title ?? ''}
        subtitle={`${dayLong(date)} · ${shift} shift`}
        onClose={() => setCalc(null)}
      >
        {calc && (
          <>
            <div className="calc">
              <div>
                <b>Formula:</b> {calc.formula}
              </div>
              {calc.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div>
                = <b className="res">{calc.result}</b>
              </div>
            </div>
            {calc.note && <div className="sub mt-3">{calc.note}</div>}
          </>
        )}
      </BoModal>

      {/* a free note against a card, as against answering for a missed target */}
      <BoModal
        open={Boolean(noteFor)}
        title="Note on this machine"
        subtitle={`${noteFor?.metric ?? ''} · ${dayLong(date)} · ${shift}`}
        onClose={() => setNoteFor(null)}
        footer={
          <button type="button" className="btn" onClick={saveNote} disabled={saving}>
            {saving ? 'Saving…' : 'Save reason'}
          </button>
        }
      >
        <div className="mt-3">
          <label htmlFor="eff-reason">Anything worth recording about this shift?</label>
          <textarea
            id="eff-reason"
            rows={3}
            placeholder="e.g. raw material moisture high, power cut, belt slipping, crew short…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="mt-2.5">
          <label htmlFor="eff-by">Entered by</label>
          <input
            id="eff-by"
            type="text"
            placeholder="manager name"
            value={enteredBy}
            onChange={(e) => setEnteredBy(e.target.value)}
          />
        </div>
      </BoModal>

      {/* why it missed the target the manager set */}
      <BoModal
        open={Boolean(varianceFor)}
        title="Reason for the variance"
        subtitle={`${varianceFor?.card ?? ''} · ${varianceFor?.metric.label ?? ''} · ${dayLong(date)} · ${shift}`}
        onClose={() => setVarianceFor(null)}
        footer={
          <button type="button" className="btn" onClick={saveVarianceReason} disabled={saving}>
            {saving ? 'Saving…' : 'Save reason'}
          </button>
        }
      >
        {varianceFor && (
          <>
            <div className="calc mt-3">
              <div>
                Ideal: <b>{varianceFor.metric.ideal}</b>
                {varianceFor.metric.unit ? ` ${varianceFor.metric.unit}` : ''}
              </div>
              <div>
                Actual: <b>{varianceFor.metric.value ?? '—'}</b>
                {varianceFor.metric.unit ? ` ${varianceFor.metric.unit}` : ''}
              </div>
              <div>
                Variance: <b className="res">{varianceText(varianceFor.metric)}</b>
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="var-reason">Why did it come in off the ideal?</label>
              <textarea
                id="var-reason"
                rows={3}
                placeholder="e.g. autoclave down half the shift, feedstock short, one grinder on maintenance…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="mt-2.5">
              <label htmlFor="var-by">Entered by</label>
              <input
                id="var-by"
                type="text"
                placeholder="manager name"
                value={enteredBy}
                onChange={(e) => setEnteredBy(e.target.value)}
              />
            </div>
          </>
        )}
      </BoModal>

      {/* correcting the wording of one already recorded */}
      <BoModal
        open={Boolean(editing)}
        title="Edit the reason"
        subtitle={
          editing
            ? `${editing.label ?? editing.parameter} · ${dayLong(editing.shift_date)}${editing.shift ? ` · ${editing.shift}` : ''}`
            : ''
        }
        onClose={() => setEditing(null)}
        footer={
          <button type="button" className="btn" onClick={saveEditedReason} disabled={saving}>
            {saving ? 'Saving…' : 'Save reason'}
          </button>
        }
      >
        {editing && (
          <>
            <div className="calc mt-3">
              <div>
                Ideal: <b>{editing.ideal ?? '—'}</b>
              </div>
              <div>
                Actual: <b>{editing.actual ?? '—'}</b>
              </div>
            </div>
            <div className="sub mt-2">
              The wording is what can be corrected — the day, the shift, the parameter and the two
              figures are the record itself.
            </div>
            <div className="mt-3">
              <label htmlFor="edit-reason">Reason</label>
              <textarea
                id="edit-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="mt-2.5">
              <label htmlFor="edit-by">Entered by</label>
              <input
                id="edit-by"
                type="text"
                placeholder="manager name"
                value={enteredBy}
                onChange={(e) => setEnteredBy(e.target.value)}
              />
            </div>
          </>
        )}
      </BoModal>
    </>
  );
}

export default EfficiencyPage;
