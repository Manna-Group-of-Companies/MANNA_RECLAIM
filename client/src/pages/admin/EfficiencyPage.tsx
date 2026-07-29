import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  addEfficiencyNote,
  fetchShiftEfficiency,
  fetchShiftOptions,
} from '@/features/reports/reportsSlice';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { dayLong } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { EfficiencyCard, EfficiencyMetric, Shift } from '@/types/models';

type CalcTarget = EfficiencyMetric['calc'];
type NoteTarget = { line: 'refiner' | 'grind'; metric: string } | null;

/** One measured value with the plant's usual figure under it. */
function Metric({ metric, onCalc }: { metric: EfficiencyMetric; onCalc: (c: CalcTarget) => void }) {
  const shown =
    metric.value == null ? '—' : `${metric.value}${metric.unit ? ` ${metric.unit}`.trim() : ''}`;
  const baseline =
    metric.baselineLabel ?? `usual ${metric.baseline == null ? '—' : metric.baseline}`;

  const body = (
    <>
      <span>
        {metric.label}
        {metric.calc && <span className="muted ml-1 text-[10px]">ⓘ how?</span>}
        {metric.warn && <span className="warnpill">below usual</span>}
      </span>
      <span className="text-right">
        <span className="mv" style={metric.warn ? { color: 'var(--err)' } : undefined}>
          {shown}
        </span>
        <div className="mb">{baseline}</div>
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
  const { shifts, shiftEfficiency, loading, error } = useAppSelector((s) => s.reports);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const user = useAppSelector((s) => s.auth.user);

  const [date, setDate] = useState('');
  const [shift, setShift] = useState<Shift>('Day');
  const [calc, setCalc] = useState<CalcTarget>(null);
  const [noteFor, setNoteFor] = useState<NoteTarget>(null);
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

  const available = useMemo(
    () => shifts.find((s) => s.date === date)?.shifts ?? [],
    [shifts, date],
  );

  const notesFor = (line: string, metric: string) =>
    (shiftEfficiency?.notes ?? []).filter((n) => n.line === line && n.metric === metric);

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

  /** Refiner, grinder and yield cards all render the same way. */
  const renderCard = (card: EfficiencyCard, line: 'refiner' | 'grind', title: React.ReactNode, aside?: React.ReactNode) => {
    const metric = card.quality
      ? `Refiner ${card.quality}`
      : card.batch
        ? `Yield Batch ${card.batch}`
        : (card.machine ?? card.machineId ?? '');
    const flagged = card.metrics.some((m) => m.warn);
    const notes = notesFor(line, metric);

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
        </div>

        <button
          type="button"
          className="btn ghost block mt-2.5"
          onClick={() => {
            setReason('');
            setNoteFor({ line, metric });
          }}
        >
          {flagged ? '⚠ Record reason for the dip' : '+ Add a note'}
        </button>
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
        </div>

        <div className="sub mt-2">
          Each parameter is compared with the plant’s usual value — the median of every shift so
          far, so the plant is measured against itself. Below-usual values are flagged; tap one to
          see the arithmetic, or record why it dipped.
        </div>
      </div>

      {error && <div className="errbox">Couldn’t load the shift: {error}</div>}
      {loading && <div className="spin">Working out the baselines…</div>}

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

      {/* why it dipped */}
      <BoModal
        open={Boolean(noteFor)}
        title="Reason for the dip"
        subtitle={`${noteFor?.metric ?? ''} · ${dayLong(date)} · ${shift}`}
        onClose={() => setNoteFor(null)}
        footer={
          <button type="button" className="btn" onClick={saveNote} disabled={saving}>
            {saving ? 'Saving…' : 'Save reason'}
          </button>
        }
      >
        <div className="mt-3">
          <label htmlFor="eff-reason">What caused the efficiency to drop?</label>
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
    </>
  );
}

export default EfficiencyPage;
