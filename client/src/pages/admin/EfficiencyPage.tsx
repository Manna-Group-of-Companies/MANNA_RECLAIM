import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addEfficiencyNote,
  addVarianceReason,
  approveVarianceReason,
  fetchShiftEfficiency,
  fetchShiftOptions,
  fetchVarianceReasons,
  updateVarianceReason,
} from '@/features/reports/reportsSlice';
import { markDown } from '@/features/maintenance/maintenanceSlice';
import { BoModal } from '@/components/ui';
import { isReadOnly } from '@/config/constants';
import { EfficiencyTrend } from '@/features/reports/EfficiencyTrend';
import { UtilisationTable } from '@/features/reports/Utilisation';
import { OperatorChip } from '@/features/operators/OperatorChip';
import { useToast } from '@/hooks/useToast';
import { dayLong } from '@/utils/date';
import { cn } from '@/utils/cn';
import type {
  EfficiencyCard,
  EfficiencyMetric,
  UnloggedMachine,
  VarianceReason,
} from '@/types/models';

type CalcTarget = EfficiencyMetric['calc'];
type NoteTarget = { line: 'refiner' | 'grind'; metric: string } | null;
/** Which figure the manager is being asked to explain, and against what. */
type VarianceTarget = { card: string; metric: EfficiencyMetric } | null;

/**
 * What the picked shift did on this card's line, said in the corner of it.
 *
 * A grade's shift output lives here rather than as a metric row. It is real and
 * a manager wants it, but nobody sets a target against it - one charge is worked
 * into several grades at once and the split follows demand, so a kg/shift target
 * per grade would ask a supervisor to explain having made what he was told to
 * make. As a row it was a permanently blank verdict column, and a row that never
 * has an answer teaches people to skim the rows that do.
 *
 * The other half of the sentence is for a card whose line worked the day but not
 * this shift. Those exist because the two comparisons on them are the day's; the
 * card says so plainly rather than showing noughts.
 */
function shiftAside(card: EfficiencyCard): ReactNode {
  const batches = card.batches?.length ? `Batch ${card.batches.join(', ')}` : null;
  const worked = [
    card.out == null ? null : `${card.out} kg`,
    card.workers == null ? null : `${card.workers} crew`,
    card.hours == null ? null : `${card.hours} h`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="cardaside">
      {batches && <div>{batches}</div>}
      {worked && <div>this shift: {worked}</div>}
      {/*
        What the two day-measured figures are folded out of. Said once, here,
        rather than under each of them - it was under both and in this corner at
        the same time, which put one sentence on a card three times.
      */}
      {card.dayNote && <div className="muted">whole day: {card.dayNote}</div>}
    </div>
  );
}

/**
 * "−240 kg (−12%) short of target" — the gap, and which side of it that is.
 *
 * The words are the point. A sign on its own is not a verdict: +2.7% on labour
 * productivity is a crew beating its benchmark and +5.8% on energy is the same
 * rubber costing more electricity to make, and drawn as bare numbers the two are
 * indistinguishable. `lowerIsBetter` is what tells them apart, so it is what
 * picks the wording.
 */
function varianceText(metric: EfficiencyMetric): string {
  if (metric.variance == null) return '';
  const sign = metric.variance > 0 ? '+' : '';
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const pct = metric.variancePct == null ? '' : ` (${sign}${metric.variancePct}%)`;
  const above = metric.variance > 0;
  const sense = metric.lowerIsBetter
    ? above
      ? 'over target'
      : 'under target'
    : above
      ? 'above target'
      : 'short of target';
  return `${sign}${metric.variance}${unit}${pct} ${sense}`;
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
 * somebody goes and sets it; a figure nobody sets a target against - a grade's
 * output, whose split follows demand - says what it is instead.
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
      <span className="mlabel">
        <span className="mname">
          {metric.label}
          {/*
            Which span the figure covers, as a tag rather than a suffix on the
            label. A grinder card carries both - two figures measured over the
            day and two over the shift - and "· day" trailing the label read as
            part of the name rather than as the answer to "of what?".
          */}
          {metric.span && <span className={`spantag ${metric.span}`}>{metric.span}</span>}
          {/*
            Said on the row, not left to be inferred from the unit. Somebody
            reading this screen should not have to know that kWh/kg is the one
            figure here you want to go down.
          */}
          {metric.ideal != null && (
            <span className="dirtag" title="which side of the ideal is the good side">
              {metric.lowerIsBetter ? '↓ lower is better' : '↑ higher is better'}
            </span>
          )}
        </span>
        {metric.calc && <span className="muted text-[10px]">ⓘ how?</span>}
        {metric.warn && <span className="warnpill">{metric.warnLabel ?? 'flagged'}</span>}
        {metric.offTarget && <span className="warnpill">off ideal</span>}
        {onTarget && <span className="okpill">on ideal</span>}
        {noTarget && <span className="muted text-[10px]">no ideal set</span>}
      </span>
      <span className="mright">
        <span className="mv" style={metric.warn || metric.offTarget ? { color: 'var(--err)' } : undefined}>
          {shown}
        </span>
        {metric.ideal != null && (
          <div className="mcmp">
            <span className="muted">ideal</span> {metric.ideal}
            {metric.variance != null && (
              <>
                {' '}&nbsp;·&nbsp;{' '}
                {/*
                  Green when the figure is on the good side of its target, red
                  when it is not - rather than muted grey for everything that is
                  not a miss. A shift that beat its benchmark was being told so
                  in the same colour as a shift nobody had set a target for.
                */}
                <span className={metric.offTarget ? 'gapbad' : 'gapgood'}>
                  {varianceText(metric)}
                </span>
              </>
            )}
          </div>
        )}
        {metric.context && <div className="mb">{metric.context}</div>}
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

/** Which question is being asked: how did that shift go, or is that normal. */
function ViewToggle({
  view,
  onView,
}: {
  view: 'shift' | 'period';
  onView: (v: 'shift' | 'period') => void;
}) {
  return (
    <div className="chips mt-3 mx-0.5">
      <button
        type="button"
        className={cn('chip', view === 'shift' && 'on')}
        onClick={() => onView('shift')}
      >
        One shift
      </button>
      <button
        type="button"
        className={cn('chip', view === 'period' && 'on')}
        onClick={() => onView('period')}
      >
        Compare a period
      </button>
    </div>
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
  /**
   * The managing director opens this same page at /md/efficiency and reads it
   * rather than writes it: no "why is this off the ideal?", no note, no edit on
   * a reason somebody else recorded.
   *
   * The reasons themselves stay on the card, which is the point of letting that
   * account in at all - the figure says a shift came in short and the reason
   * says why, and an MD reading the first without the second would be the worst
   * version of this screen. The three buttons are the whole difference, so this
   * is one page and not two: a copy would drift from the one the manager sees,
   * and the two would disagree about the same shift.
   *
   * Hiding a button is not the guard. Every write behind them is adminOnly at
   * the routes, so an MD posting the request by hand is refused there.
   */
  const readOnly = isReadOnly(user?.role);

  /*
   * The day and the shift are the back office's, not this page's - picked
   * once above the tab strip and read by every tab. See BackOfficeDay.
   */
  const date = useAppSelector((s) => s.ui.backOfficeDay);
  const shift = useAppSelector((s) => s.ui.backOfficeShift);
  /*
   * One shift, or the same figures across a period.
   *
   * Two views rather than a period picker bolted onto the shift view: the shift
   * view is where a miss is explained and signed off, and every control on it
   * belongs to one shift. A period has no single shift to write a reason
   * against, so it carries none of them and says so by being its own screen.
   */
  const [view, setView] = useState<'shift' | 'period'>('shift');
  const [calc, setCalc] = useState<CalcTarget>(null);
  const [noteFor, setNoteFor] = useState<NoteTarget>(null);
  const [varianceFor, setVarianceFor] = useState<VarianceTarget>(null);
  const [editing, setEditing] = useState<VarianceReason | null>(null);
  const [reason, setReason] = useState('');
  const [enteredBy, setEnteredBy] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  /** The machine being reported down from this screen, and what is said about it. */
  const [downFor, setDownFor] = useState<UnloggedMachine | null>(null);
  const [downCause, setDownCause] = useState('');
  /** The reason being signed off, and whatever the office wants to add to it. */
  const [approving, setApproving] = useState<VarianceReason | null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [downAt, setDownAt] = useState('');

  const unlogged = useMemo(
    () =>
      [...(shiftEfficiency?.unlogged ?? [])].sort(
        (a, b) => Number(b.needsAnswer) - Number(a.needsAnswer) || a.machine.localeCompare(b.machine),
      ),
    [shiftEfficiency],
  );

  useEffect(() => {
    void dispatch(fetchShiftOptions());
  }, [dispatch, refreshTick]);


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
      // The whole-day cards used to be counted here as well. Their two figures
      // are on the refiner and grinder cards above now, so they are still in
      // this total and counted exactly once - which is the point of the merge.
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
  /**
   * Files the breakdown that answers for a machine nobody logged.
   *
   * `downStart` is asked for rather than stamped now, because the manager is
   * usually filling this in a day or two after the fact and "now" would put the
   * machine down at the moment somebody noticed the hole rather than at the
   * moment it stopped - and the whole point of the record is the downtime
   * between those two. The shift's own day is offered as the default.
   *
   * The repair itself is not written here: that needs the cause, the fix and
   * what stops it recurring, and it is the person who repaired it who knows.
   * This marks the machine down and leaves it down, which is what makes it show
   * as down on the shop floor until somebody closes it out.
   */
  const reportBreakdown = async () => {
    if (!downFor) return;
    if (!downCause.trim()) {
      notify('Say what happened to it', 'warn');
      return;
    }
    setSaving(true);
    const result = await dispatch(
      markDown({
        machineId: downFor.machineId,
        machine: downFor.machine,
        downStart: downAt ? new Date(downAt).toISOString() : undefined,
        rootCause: downCause.trim(),
      }),
    );
    setSaving(false);
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? `${downFor.machine} marked down` : 'Could not mark it down', okay ? 'ok' : 'err');
    if (okay) {
      setDownFor(null);
      setDownCause('');
      // Re-read the shift so the machine moves out of "still to answer" without
      // the manager having to work out that the screen is now stale.
      if (date) void dispatch(fetchShiftEfficiency({ date, shift }));
    }
  };

  /**
   * Accepting a reason the shift wrote, with the office's own note beside it.
   *
   * The note is optional and most sign-offs will not have one - the
   * supervisor's sentence stands and the manager agrees with it. When there is
   * one it goes in its own column, never over the supervisor's words.
   *
   * There is no un-approve, here or on the server. A sign-off that can be
   * quietly withdrawn is not a sign-off; one given in error is corrected by
   * the note beside it saying so.
   */
  const approve = async () => {
    if (!approving) return;
    setSaving(true);
    const result = await dispatch(
      approveVarianceReason({ id: approving.id, managerNote: managerNote.trim() || null }),
    );
    setSaving(false);
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? 'Reason approved' : 'Could not approve it', okay ? 'ok' : 'err');
    if (okay) {
      setApproving(null);
      setManagerNote('');
      if (date) void dispatch(fetchShiftEfficiency({ date, shift }));
    }
  };

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
          {/*
            The name beside the title, because this screen is where a miss is
            argued about and the argument is with somebody. A card that is not a
            line - a batch yield - carries no name and is given none, see
            OperatorChip.
          */}
          <div>
            {title}
            <OperatorChip operator={card.operator} />
          </div>
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
                {!readOnly && (
                  <button
                    type="button"
                    className="muted underline text-[11px]"
                    onClick={() => openEdit(r)}
                  >
                    edit
                  </button>
                )}
                {/*
                  The office's own words, on their own line and never merged into
                  the sentence above. A manager who edits a supervisor's reason
                  leaves a record that reads as the supervisor's and is not, and
                  these are read back exactly when that matters - months later,
                  with an incentive being argued over.
                */}
                {r.manager_note && (
                  <div className="mgrnote">
                    <span className="muted">{r.approved_by || 'office'} added:</span>{' '}
                    {r.manager_note}
                  </div>
                )}
                {r.approved_at ? (
                  <span className="okpill">
                    approved{r.approved_by ? ` · ${r.approved_by}` : ''}
                  </span>
                ) : readOnly ? (
                  <span className="muted ml-1 text-[10px]">not approved yet</span>
                ) : (
                  <button
                    type="button"
                    className="btn ghost block mt-1.5"
                    onClick={() => {
                      setManagerNote('');
                      setApproving(r);
                    }}
                  >
                    ✓ Approve this reason
                  </button>
                )}
              </div>
            )),
          )}
        </div>

        {!readOnly &&
          missed.map((m) => (
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

        {line && !readOnly && (
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

  /*
   * The period view is its own screen rather than a section under the shift.
   *
   * Everything above this point is one shift's - the cards, the reasons, the
   * approvals, the breakdown sheet - and none of it has a meaning across a
   * fortnight. Drawing both would have put two answers to two different
   * questions on one page and left the reader to work out which figure belonged
   * to which.
   */
  if (view === 'period') {
    return (
      <>
        <ViewToggle view={view} onView={setView} />
        <EfficiencyTrend />
      </>
    );
  }

  return (
    <>
      <ViewToggle view={view} onView={setView} />
      <div className="panel">
        {/* Picked above the tabs - see BackOfficeDay. This only says which. */}
        <div className="sub">
          {date ? dayLong(date) : 'No data'} · {shift} shift
          {date && available.length > 0 && !available.includes(shift) && (
            <span className="muted"> · nothing logged on this shift</span>
          )}
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
          Every figure here carries a comparison — there are no rows on this screen that are shown
          without one. Each is compared at the granularity it is set at, and says which: production
          per shift, autoclave charges and batch yield per batch, and the energy and labour figures
          over the whole day. Those two are marked “· day” and carry the shift’s own figure
          underneath, which is also why a grade or machine the other shift worked still has a card
          here. A figure marked “no ideal set” is not a pass — it is a target nobody has filled in.
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
          {/*
            One card per grade, and the grades are the day's rather than the
            shift's - both figures on them are measured over the day, so a grade
            the other shift worked belongs here too. Its card says which.
          */}
          <div className="grouphead">
            Special line · {dayLong(shiftEfficiency.date)} · by grade
          </div>
          {shiftEfficiency.refiners.length ? (
            shiftEfficiency.refiners.map((card) =>
              renderCard(
                card,
                'refiner',
                <span className="qchip">{card.quality}</span>,
                shiftAside(card),
              ),
            )
          ) : (
            <div className="empty">Nothing came off the special line on this day.</div>
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
            Grinding line · {dayLong(shiftEfficiency.date)} · by machine
          </div>
          {shiftEfficiency.grinders.length ? (
            shiftEfficiency.grinders.map((card) =>
              renderCard(card, 'grind', <b>{card.machine}</b>, shiftAside(card)),
            )
          ) : (
            <div className="empty">No grinder output on this day.</div>
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
            How much of the twelve hours each machine ran - every machine,
            above the list of the ones that ran none of them, because the two
            are the same question at two levels. This one answers it for the
            whole plant; the next names the machines nobody has answered for.
          */}
          <UtilisationTable
            rows={shiftEfficiency.utilisation ?? []}
            totals={shiftEfficiency.utilisationTotals}
          />

          {/*
            Every machine is meant to be accounted for on every shift - it ran,
            or it was down. This is the list that is neither, and it is on the
            manager's screen because nobody else is looking for it: a machine
            that was never logged has no card, and a screen with no card on it
            reads exactly like a plant with nothing to answer for.
          */}
          {unlogged.length > 0 && (
            <>
              <div className="grouphead">
                Not accounted for · {unlogged.filter((m) => m.needsAnswer).length} of{' '}
                {unlogged.length} still to answer
              </div>
              {unlogged.map((m) => (
                <div key={m.machineId} className={cn('effcard', m.needsAnswer && 'flag')}>
                  <div className="row">
                    <div>
                      <b>{m.machine}</b>
                      <span className="muted ml-2 text-[11px]">{m.group}</span>
                    </div>
                    <div className="cardaside">
                      {m.breakdown ? (
                        <>
                          <div>{m.breakdown.open ? 'down — not yet repaired' : 'was down'}</div>
                          <div className="muted">
                            {m.breakdown.rootCause || 'no cause written up yet'}
                          </div>
                        </>
                      ) : (
                        <div className="offshift">nothing logged, and no breakdown against it</div>
                      )}
                    </div>
                  </div>
                  {m.needsAnswer && !readOnly && (
                    <button
                      type="button"
                      className="btn ghost block mt-2.5"
                      onClick={() => {
                        setDownCause('');
                        setDownAt(`${shiftEfficiency.date}T08:30`);
                        setDownFor(m);
                      }}
                    >
                      ⚠ Report {m.machine} as broken down
                    </button>
                  )}
                </div>
              ))}
            </>
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

      {/* the office signing off what the shift said about a miss */}
      <BoModal
        open={Boolean(approving)}
        title="Approve this reason"
        subtitle={approving?.label ?? ''}
        onClose={() => setApproving(null)}
        footer={
          <button type="button" className="btn" onClick={approve} disabled={saving}>
            {saving ? 'Saving…' : 'Approve'}
          </button>
        }
      >
        {approving && (
          <>
            <div className="calc">
              <div>
                <b>{approving.entered_by || 'The shift'} said:</b> {approving.reason}
              </div>
              <div className="muted">
                ideal {approving.ideal ?? '—'} · actual {approving.actual ?? '—'}
              </div>
            </div>
            <div className="field">
              <label htmlFor="mgr-note">Anything to add? (optional)</label>
              <textarea
                id="mgr-note"
                rows={3}
                value={managerNote}
                onChange={(e) => setManagerNote(e.target.value)}
                placeholder="agreed, the feed was short all week…"
              />
            </div>
            <div className="sub">
              Your note is kept beside the shift’s words, not over them. Approving cannot be
              undone — if it was given in error, say so in the note.
            </div>
          </>
        )}
      </BoModal>

      {/* the breakdown that answers for a machine nobody logged this shift */}
      <BoModal
        open={Boolean(downFor)}
        title={`Report ${downFor?.machine ?? ''} as broken down`}
        subtitle={`${dayLong(date)} · ${shift} shift`}
        onClose={() => setDownFor(null)}
        footer={
          <button type="button" className="btn" onClick={reportBreakdown} disabled={saving}>
            {saving ? 'Saving…' : 'Mark it down'}
          </button>
        }
      >
        <div className="field">
          <label htmlFor="down-at">When did it stop?</label>
          <input
            id="down-at"
            type="datetime-local"
            value={downAt}
            onChange={(e) => setDownAt(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="down-cause">What happened to it?</label>
          <textarea
            id="down-cause"
            rows={3}
            value={downCause}
            onChange={(e) => setDownCause(e.target.value)}
            placeholder="bearing seized, belt snapped, waiting on a part…"
          />
        </div>
        <div className="sub">
          This marks the machine down and leaves it down. It shows as down on the shop floor until a
          supervisor writes up the repair — the cause, the fix, and what stops it happening again —
          which is what closes it and lets the machine be logged again.
        </div>
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
