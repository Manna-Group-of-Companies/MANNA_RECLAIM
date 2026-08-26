import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchRunFilters } from '@/features/reports/reportsSlice';
import { requestRefresh } from '@/features/ui/uiSlice';
import { runService } from '@/api/services/run.service';
import { reportService } from '@/api/services/report.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import {
  buildPayload,
  changedFields,
  deletedSummary,
  draftOf,
  runMath,
  text,
  type Draft,
} from '@/features/history/runDraft';
import { RunRecord } from '@/features/history/RunRecord';
import { QUALITIES, SHIFTS, isReadOnly } from '@/config/constants';
import { clock, dayLong, lastNDays, todayISO } from '@/utils/date';
import { hours, kwhOf, num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Run } from '@/types/models';



/**
 * Everything recorded about one run, and every one of it editable - or, at the
 * bottom of the modal, gone.
 *
 * Energy and hours are shown the way they are worked out - end reading minus
 * start - and recalculated as the readings are typed, so a correction can be
 * seen to be right before it is saved. While both ends of a meter are on the
 * form, the figure derived from them is what gets recorded and the direct box
 * is closed off; it opens as soon as a reading is missing, which is the case it
 * exists for.
 */
function RunDetail({
  run,
  onClose,
  onSaved,
  onDeleted,
}: {
  run: Run | null;
  onClose: () => void;
  onSaved: (run: Run) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const notify = useToast();
  const dispatch = useAppDispatch();

  // A different run in the modal starts a fresh form.
  const runId = run?.id ?? '';
  useEffect(() => {
    setDraft(run ? draftOf(run) : null);
    setConfirming(false);
    setError('');
  }, [runId, run]);

  if (!run || !draft) return null;

  const base = draftOf(run);
  const set = (field: keyof Draft, value: string) => setDraft({ ...draft, [field]: value });

  const math = runMath(run, draft);
  const { isAuto, isPress, isCracker, pickingLabourHours } = math;
  const { elecStart, elecEnd, hourStart, hourEnd } = math;
  const { elecPair, hourPair, elecDelta, hourDelta, energy, runHours, output, issues } = math;

  const changed = changedFields(draft, base);
  const dirty = changed.length > 0;

  const save = async () => {
    const payload = buildPayload(draft, changed, math);
    if (!Object.keys(payload).length) {
      setError(dirty ? 'Nothing left to save once the meter readings are applied.' : '');
      return;
    }

    setSaving(true);
    setError('');
    try {
      onSaved(await runService.update(run.id, payload));
      // The reports, the costing and the dashboard are all added up from this
      // row, and `onSaved` only swaps it in the table behind this modal - the
      // same gap the delete below closes, and the same fix.
      dispatch(requestRefresh());
      onClose();
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      // The row is the smaller half of what a delete moves - the sacks come off
      // the yard and the samples off the lab's table with it, and the back
      // office is the side that reconciles the yard, so it is told which.
      const { message, warn } = deletedSummary(await runService.remove(run.id));
      onDeleted(run.id);
      // The yard, the costing and the dashboard are all added up from this row.
      // `onDeleted` only takes it out of the table behind this modal - see the
      // note on the shop floor's copy of this.
      dispatch(requestRefresh());
      notify(message, warn ? 'warn' : 'ok');
      onClose();
    } catch (err) {
      setError(toRequestError(err).message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: ReactNode, input: ReactNode, hint?: ReactNode) => (
    <div className="field">
      <label>{label}</label>
      {input}
      {hint}
    </div>
  );

  const numberInput = (f: keyof Draft, placeholder = '—') => (
    <input
      type="number"
      inputMode="decimal"
      placeholder={placeholder}
      value={draft[f]}
      onChange={(e) => set(f, e.target.value)}
    />
  );

  return (
    <BoModal
      open
      title={`${run.machine ?? run.machine_id}${run.batch_no ? ` · Batch ${run.batch_no}` : ''}`}
      subtitle={`${run.kind ?? ''}${run.line ? ` · ${run.line} line` : ''} · ${dayLong(run.shift_date)}${
        (run.passes ?? 1) > 1 ? ` · ${run.passes} start/stops combined` : ''
      }`}
      onClose={onClose}
      footer={
        <>
          {confirming ? (
            <button type="button" className="btn danger mr-auto" onClick={remove} disabled={saving}>
              {saving ? 'Deleting…' : 'Yes, delete it'}
            </button>
          ) : (
            <button
              type="button"
              className="btn mr-auto"
              onClick={() => setConfirming(true)}
              disabled={saving}
            >
              Delete run
            </button>
          )}
          <button type="button" className="btn" onClick={save} disabled={!dirty || saving || issues.length > 0}>
            {saving ? 'Saving…' : dirty ? `Save ${changed.length} change${changed.length > 1 ? 's' : ''}` : 'Saved'}
          </button>
        </>
      }
    >
      <div className="mt-3">
        <div className="grouphead mt-0">What ran</div>
        {field('Batch', <input value={draft.batchNo} onChange={(e) => set('batchNo', e.target.value)} />)}
        {/* A press moulds finished goods, so it carries neither a grade nor a
            formulation - what it was set up for is the product. */}
        {!isPress &&
          field(
            'Grade',
            <select value={draft.quality} onChange={(e) => set('quality', e.target.value)}>
              <option value="">— none —</option>
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>,
          )}
        {!isPress &&
          field(
            'Formulation',
            <input value={draft.formulation} onChange={(e) => set('formulation', e.target.value)} />,
          )}
        {isPress && (
          <>
            <div className="roRow">
              <span className="k">Product</span>
              <span className="v">{run.product ?? '—'}</span>
            </div>
            <div className="roRow">
              <span className="k">Moulded at</span>
              <span className="v">
                {run.cure_temp_c != null ? `${run.cure_temp_c} °C` : 'temp not set'}
                <span className="muted">
                  {' · '}
                  {run.compound_rate != null ? `₹${run.compound_rate}/kg compound` : 'no compound rate'}
                </span>
              </span>
            </div>
            {field(<>Cyclic time <span className="muted font-normal">(min)</span></>, numberInput('cyclicMin'))}
            {field('Cavities', numberInput('cavities'))}
          </>
        )}
        {isAuto && field(<>Charge <span className="muted font-normal">(kg)</span></>, numberInput('capacity'))}

        <div className="grouphead">Shift</div>
        {field(
          'Shift date',
          <input type="date" value={draft.shiftDate} onChange={(e) => set('shiftDate', e.target.value)} />,
        )}
        {field(
          'Shift',
          <select value={draft.shift} onChange={(e) => set('shift', e.target.value)}>
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>,
        )}
        {field('Supervisor', <input value={draft.supervisor} onChange={(e) => set('supervisor', e.target.value)} />)}
        {/* Who was signed in when the machine was started. Read-only where the
            signed name above is not: it comes off the access token, so nothing
            on the floor sets it and nothing in the back office corrects it -
            which is the only reason it is worth reading beside the other. Blank
            on a run started before the column existed. */}
        <div className="roRow">
          <span className="k">Logged by</span>
          <span className="v">{run.entered_by ?? '—'}</span>
        </div>
        {field('Crew', numberInput('workers'))}

        {/* No meters on a press, and no energy or hours to correct against them. */}
        {!isAuto && !isPress && (
          <>
            <div className="grouphead">Electricity</div>
            {field(<>Reading at start <span className="muted font-normal">(units)</span></>, numberInput('elecStart'))}
            {field(
              <>Reading at stop <span className="muted font-normal">(units)</span></>,
              numberInput('elecEnd'),
              elecDelta != null ? (
                <div className={cn('diffout show mt-1.5', elecDelta < 0 && 'bad')}>
                  Consumed: <b>{elecEnd}</b> − {elecStart} = <b>{elecDelta}</b> units
                </div>
              ) : undefined,
            )}
            {field(
              <>Energy <span className="muted font-normal">(kWh)</span></>,
              <input
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={elecPair ? text(energy) : draft.kwh}
                onChange={(e) => set('kwh', e.target.value)}
                disabled={elecPair}
              />,
              <div className="sub mt-1">
                {elecPair
                  ? 'Worked out from the two readings above — clear one of them to enter it directly.'
                  : 'Entered directly, for a run whose meter readings were never written down.'}
              </div>,
            )}

            <div className="grouphead">Hour meter</div>
            {field(<>Reading at start <span className="muted font-normal">(hrs)</span></>, numberInput('hourStart'))}
            {field(
              <>Reading at stop <span className="muted font-normal">(hrs)</span></>,
              numberInput('hourEnd'),
              hourDelta != null ? (
                <div className={cn('diffout show mt-1.5', hourDelta < 0 && 'bad')}>
                  Run: <b>{hourEnd}</b> − {hourStart} = <b>{hourDelta}</b> hrs
                </div>
              ) : undefined,
            )}
            {field(
              <>Hours run <span className="muted font-normal">(hrs)</span></>,
              <input
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={hourPair ? text(hourDelta) : draft.hoursRun}
                onChange={(e) => set('hoursRun', e.target.value)}
                disabled={hourPair}
              />,
              <div className="sub mt-1">
                {hourPair
                  ? 'Worked out from the two readings above — clear one of them to enter it directly.'
                  : 'Entered directly, for a run whose meter readings were never written down.'}
              </div>,
            )}
          </>
        )}

        <div className="grouphead">Output</div>
        {field(
          isPress ? (
            <>Weight <span className="muted font-normal">(kg)</span></>
          ) : (
            <>Output weight <span className="muted font-normal">(kg)</span></>
          ),
          numberInput('outWeight'),
        )}
        {/* A press is counted in pieces, and the flash trimmed off is charged
            with them - nothing off a press is bagged, so no sacks. */}
        {isPress ? (
          <>
            {field(<>How many <span className="muted font-normal">(nos)</span></>, numberInput('pieces'))}
            {field(<>Flash <span className="muted font-normal">(kg)</span></>, numberInput('flashKg'))}
            <div className="roRow">
              <span className="k">Material</span>
              <span className="v">
                {math.material != null ? `₹${num(math.material, 2)}` : '—'}
                {math.perPiece != null && (
                  <span className="muted"> · ₹{num(math.perPiece, 2)} a piece</span>
                )}
              </span>
            </div>
          </>
        ) : (
          field('Packed sacks', numberInput('packedSacks'))
        )}
        {isAuto && field(<>Firewood <span className="muted font-normal">(kg)</span></>, numberInput('firewoodKg'))}

        {/* The yard gang that fed the cracker. What was entered at the machine
            was an estimate at the end of a shift, so it is correctable here -
            and correcting it re-prices the crumb that window made, because the
            costing works the figure out from the runs rather than storing it. */}
        {isCracker && (
          <>
            <div className="grouphead">Picking — scrap yard</div>
            {field('Labourers', numberInput('pickingLabourers'))}
            {field(
              <>Time worked <span className="muted font-normal">(hrs)</span></>,
              numberInput('pickingHours'),
              pickingLabourHours != null ? (
                <div className="diffout show mt-1.5">
                  <b>{pickingLabourHours}</b> labourer-hours — costed into ₹/kg crumb, and from there
                  into the reclaim.
                </div>
              ) : undefined,
            )}
          </>
        )}
        {field(
          'Remarks',
          <textarea rows={2} value={draft.remarks} onChange={(e) => set('remarks', e.target.value)} />,
        )}

        <div className="grouphead">As this run will read</div>
        <div className="roRow">
          <span className="k">Run time</span>
          <span className="v">
            {runHours != null ? `${num(runHours, 2)} h` : '—'}
            {runHours != null && <span className="muted"> · {Math.round(runHours * 60)} min</span>}
          </span>
        </div>
        <div className="roRow">
          <span className="k">Energy</span>
          <span className="v">
            {energy != null ? `${num(energy, 1)} kWh` : '—'}
            {energy != null && runHours ? <span className="muted"> · {num(energy / runHours, 1)} kWh/h</span> : null}
          </span>
        </div>
        <div className="roRow">
          <span className="k">Output</span>
          <span className="v">
            {output != null ? `${num(output, 0)} kg` : '—'}
            {energy != null && output ? (
              <span className="muted"> · {num(energy / output, 3)} kWh/kg</span>
            ) : null}
          </span>
        </div>

        {confirming && (
          <div className="errbox mt-3">
            <b>Delete this run for good?</b>
            <div className="mt-1">
              {dayLong(run.shift_date)} · {run.shift} shift · {run.machine ?? run.machine_id}
              {run.batch_no ? ` · batch ${run.batch_no}` : ''}
              {output != null ? ` · ${num(output, 0)} kg` : ''}. It leaves the record altogether,
              and the production, energy and cost figures it counts towards drop with it. A run
              that merely reads wrong is better corrected above.
            </div>
            <button type="button" className="btn mt-2" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        )}
        {issues.length > 0 && (
          <div className="errbox mt-3">
            {issues.map((issue) => (
              <div key={issue}>{issue}</div>
            ))}
          </div>
        )}
        {error && <div className="errbox mt-3">Couldn’t save: {error}</div>}
      </div>
    </BoModal>
  );
}

/**
 * The record with no controls on it, for the managing director.
 *
 * A row used not to open at all for that account, on the reasoning that a
 * correction sheet with every button disabled is worse than no sheet. That was
 * half right: a disabled form is a bad answer and no answer is a worse one. The
 * one account that only ever reads was the one account that could not see what
 * it was reading - seven columns of a table and nothing underneath them.
 *
 * Reading a run and correcting it are two acts, so they are two components. The
 * guard is unchanged and is not here: the PATCH and the DELETE are refused at
 * the routes whatever any screen offers.
 */
function RunReadOnly({ run, onClose }: { run: Run | null; onClose: () => void }) {
  if (!run) return null;
  return (
    <BoModal
      open
      title={`${run.machine ?? run.machine_id}${run.batch_no ? ` · Batch ${run.batch_no}` : ""}`}
      subtitle={`${run.kind ?? ""}${run.line ? ` · ${run.line} line` : ""} · ${dayLong(run.shift_date)}${
        (run.passes ?? 1) > 1 ? ` · ${run.passes} start/stops combined` : ""
      }`}
      onClose={onClose}
    >
      <RunRecord run={run} />
    </BoModal>
  );
}

/**
 * Every run, cut by day or period, machine or category, shift and grade.
 *
 * The rows come back already filtered rather than being pulled down whole and
 * sifted in the browser - the plant has well over a thousand runs on record,
 * and that number only grows.
 */
export function AdminHistoryPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.reports.filters);
  /**
   * The managing director reads this page at /md/history.
   *
   * Two things come off it. A row no longer opens the correction sheet -
   * every control on that sheet writes, and a modal whose buttons are all
   * disabled is a worse answer than not opening one. And the CSV export goes:
   * it is served by /reports/machine-log.csv, which stays the back office
   * alone because it carries every run the plant has ever logged with a price
   * against it, so the button could only ever have come back 403.
   *
   * Neither is the guard. The correction is a PATCH and the delete a DELETE,
   * both refused at the routes for this account whatever the screen offers.
   */
  const readOnly = isReadOnly(useAppSelector((s) => s.auth.user?.role));
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  /*
   * The day is the back office's, picked once above the tab strip - see
   * BackOfficeDay. It used to be this page's own, defaulting to "All days",
   * so a manager reading 20 August on Efficiency and switching here was
   * silently handed five months of runs instead of the shift they were on.
   */
  const day = useAppSelector((s) => s.ui.backOfficeDay);

  /*
   * One day, or a window of them.
   *
   * Two questions and two modes rather than one control that tries to be both:
   * the office corrects last night by the shift, and anybody comparing wants a
   * fortnight. A single date that quietly meant "from here" would have made the
   * first question unaskable.
   *
   * The window opens on the week ending at the day already picked above the tab
   * strip, so switching to it is a widening of what is on screen rather than a
   * jump to somewhere else.
   */
  const [span, setSpan] = useState<'day' | 'period'>('day');
  const [from, setFrom] = useState(() => lastNDays(7).from);
  const [to, setTo] = useState(() => todayISO());

  const [machineId, setMachineId] = useState('');
  const [category, setCategory] = useState('');
  const [quality, setQuality] = useState('');
  /**
   * The shift is the one picked above the tab strip, not a second choice.
   *
   * It used to be its own filter starting on "Both shifts", which made the
   * bar's own promise - "every tab below reads this shift" - false on this
   * tab: the day shift could be selected up there and the night shift down
   * here, both on screen at once, disagreeing. Two controls for one question
   * is worse than either of them alone.
   *
   * What is kept is the widening, because the bar cannot express it: a day
   * has two shifts and sometimes the question is about the day. That is a
   * span, not a shift, so it is a single toggle rather than a third option
   * pretending to be one.
   */
  const pickedShift = useAppSelector((s) => s.ui.backOfficeShift);
  const [bothShifts, setBothShifts] = useState(false);
  const shift = bothShifts ? '' : pickedShift;
  const [rows, setRows] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Run | null>(null);

  useEffect(() => {
    void dispatch(fetchRunFilters());
  }, [dispatch, refreshTick]);

  /**
   * What is being asked for, in one object.
   *
   * The table and the export read the same one on purpose. The button is
   * offered as "everything matching what is on screen", and two lists of
   * parameters built separately is exactly how an export comes to cover a
   * different set from the panel above it - which is the worst kind of wrong,
   * because it looks like it worked.
   */
  const cut: {
    date?: string;
    from?: string;
    to?: string;
    machineId?: string;
    category?: string;
    quality?: string;
    shift?: string;
  } = useMemo(
    () => ({
      ...(span === 'day' ? { date: day || undefined } : { from: from || undefined, to: to || undefined }),
      machineId: machineId || undefined,
      category: category || undefined,
      quality: quality || undefined,
      shift: shift || undefined,
    }),
    [span, day, from, to, machineId, category, quality, shift],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    runService
      .list({ ...cut, limit: 200 })
      .then(({ rows: got, meta }) => {
        if (!live) return;
        setRows(got);
        setTotal(meta?.total ?? got.length);
      })
      .catch((err) => {
        if (live) setError(toRequestError(err).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [cut, refreshTick]);

  /**
   * The export, and whether it is in flight.
   *
   * A month of runs is not instant, so the button says so rather than sitting
   * there looking unpressed - the failure mode without it is somebody pressing
   * it four times and getting four identical files. A failure is shown in the
   * same place a failed load is: this is the back office, and a download that
   * silently did nothing is worse than one that says why.
   */
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      // A single day is both ends of the window, which is what the export takes.
      const { date: one, ...rest } = cut;
      await reportService.machineLogCsv(one ? { ...rest, from: one, to: one } : rest);
    } catch (err) {
      setError(toRequestError(err).message);
    } finally {
      setExporting(false);
    }
  };

  const totals = useMemo(() => {
    let kwh = 0;
    let out = 0;
    for (const r of rows) {
      kwh += kwhOf(r) ?? 0;
      out += r.weight_kg ?? r.out_weight ?? 0;
    }
    return { kwh: Math.round(kwh), out: Math.round(out) };
  }, [rows]);

  return (
    <>
      <div className="panel">
        {/*
          A span, not a date. The day and the shift are picked once above the
          tab strip and every tab reads them - this only says whether to read
          that one day or a stretch of them, and the date itself is never
          shown twice. It used to echo the day beside these chips, which read
          as a second date picker disagreeing with the first.
        */}
        <div className="chips">
          <button
            type="button"
            className={cn('chip', span === 'day' && 'on')}
            onClick={() => setSpan('day')}
          >
            The day above
          </button>
          <button
            type="button"
            className={cn('chip', span === 'period' && 'on')}
            onClick={() => setSpan('period')}
          >
            A period of days
          </button>
          <button
            type="button"
            className={cn('chip', bothShifts && 'on')}
            onClick={() => setBothShifts(!bothShifts)}
            aria-pressed={bothShifts}
          >
            {bothShifts ? 'Both shifts' : `${pickedShift} shift only`}
          </button>
        </div>

        {span === 'period' && (
          <>
            {/*
              Said out loud, because the bar above stays on screen and goes on
              showing a day. Without this somebody changes it and waits for a
              list that is never going to move.
            */}
            <div className="sub mt-2">
              The day above does not apply while a period is showing — these two dates do.
            </div>
          <div className="bar mt-2.5">
            <div className="f">
              <label htmlFor="h-from">From</label>
              <input
                id="h-from"
                type="date"
                value={from}
                max={to || todayISO()}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="f">
              <label htmlFor="h-to">To</label>
              <input
                id="h-to"
                type="date"
                value={to}
                min={from || undefined}
                max={todayISO()}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          </>
        )}

        <div className="bar mt-2.5">
          <div className="f">
            <label htmlFor="h-machine">Machine</label>
            {/*
              The categories and the machines in one control, because they are
              one question - "which machines" - asked at two widths. Two selects
              would have needed a rule for what a category and a machine mean
              together, and the honest rule is that nobody asks both.
            */}
            <select
              id="h-machine"
              value={category ? `cat:${category}` : machineId}
              onChange={(e) => {
                const picked = e.target.value;
                setCategory(picked.startsWith('cat:') ? picked.slice(4) : '');
                setMachineId(picked.startsWith('cat:') ? '' : picked);
              }}
            >
              <option value="">All machines</option>
              {Boolean(filters?.categories?.length) && (
                <optgroup label="Groups">
                  {filters?.categories?.map((c) => (
                    <option key={c.key} value={`cat:${c.key}`}>
                      {c.label} · {c.machineIds.length}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="One machine">
                {filters?.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="f">
            <label htmlFor="h-grade">Grade</label>
            {/*
              Across every machine that made it. The question the office asks is
              "the Fine runs over these days", not "the Fine runs on R4" - a
              grade is refined on whichever machine was free.
            */}
            <select id="h-grade" value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="">All grades</option>
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="chips mt-2.5">
          {/*
            The machine log as a spreadsheet, over whatever is filtered above.

            Over the filters rather than over the rows on screen, and the
            difference matters: the table shows the most recent page of a match
            that may run to thousands, and an export of what happens to be
            rendered would quietly be a different answer from the one the panel
            says it is showing. Every logged run matching the day, the machine
            and the shift goes into the file.
          */}
          {!readOnly && (
          <button
            type="button"
            className="chip"
            disabled={exporting}
            onClick={exportCsv}
            title="Every logged run matching these filters, as a CSV"
          >
            {exporting ? 'Preparing…' : '↓ Export CSV'}
          </button>
          )}
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{rows.length}</b>
            <span>runs shown</span>
          </div>
          <div className="kpi">
            <b>{totals.kwh}</b>
            <span>kWh</span>
          </div>
          <div className="kpi">
            <b>{totals.out}</b>
            <span>kg out</span>
          </div>
        </div>

        {total > rows.length && (
          <div className="sub mt-2">
            Showing the {rows.length} most recent of {total} matching runs, and the totals above
            are of those {rows.length} — narrow the period, the machine or the grade to bring the
            rest in. The export covers all {total} whatever is on screen.
          </div>
        )}
      </div>

      {error && <div className="errbox">Couldn’t load runs: {error}</div>}
      {loading && <div className="spin">Loading plant data…</div>}
      {!loading && !error && !rows.length && <div className="empty">No runs match these filters.</div>}

      {!loading && rows.length > 0 && (
        <>
          <div className="sub mx-0.5 mb-1.5 mt-3">
            Tap any row for the full run details{readOnly ? "" : " — and to correct them"}.
          </div>
          <div className="panel scroll-x mt-0 p-0">
            <table className="tt min-w-[560px]">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Machine</th>
                  <th>Batch / grade</th>
                  <th className="tnum">Run</th>
                  <th className="tnum">Energy</th>
                  <th className="tnum">Crew</th>
                  <th className="tnum">Out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const h = hours(r);
                  const k = kwhOf(r);
                  const w = r.weight_kg ?? r.out_weight ?? null;
                  return (
                    // Every account opens the run. What opens differs: the
                    // office gets the correction sheet, the managing director
                    // gets the record with no controls on it.
                    <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer">
                      <td>
                        <b>{dayLong(r.shift_date)}</b>
                        {r.shift && <div className="muted text-[10px]">{r.shift} shift</div>}
                        {/* Who was signed in when the machine was started, which
                            the floor cannot switch, and under it the name the
                            record was signed with where that is somebody else.
                            The signed name stands alone on a run from before the
                            account was recorded. */}
                        {(r.entered_by ?? r.supervisor) && (
                          <div className="muted text-[10px]">{r.entered_by ?? r.supervisor}</div>
                        )}
                        {r.entered_by && r.supervisor && r.supervisor !== r.entered_by && (
                          <div className="muted text-[10px]">signed as {r.supervisor}</div>
                        )}
                      </td>
                      <td>
                        <b>{r.machine ?? r.machine_id}</b>
                        {r.kind === 'autoclave' && r.ended_at && (
                          <div className="muted text-[9px]">⤒ {clock(r.ended_at)}</div>
                        )}
                      </td>
                      <td>
                        {r.batch_no ? <span className="batchref text-xs">{r.batch_no}</span> : '—'}
                        {r.quality && <span className="qchip ml-1">{r.quality}</span>}
                        {r.formulation && <div className="muted text-[10px]">{r.formulation}</div>}
                      </td>
                      <td className="tnum">
                        {h != null ? `${num(h, 2)} h` : '—'}
                        {(r.hour_start != null || r.hour_end != null) && (
                          <div className="muted text-[9px]">
                            hr {r.hour_start ?? '—'}→{r.hour_end ?? '—'}
                          </div>
                        )}
                      </td>
                      <td className="tnum">
                        {k != null ? `${num(k, 1)} kWh` : '—'}
                        {(r.elec_start != null || r.elec_end != null) && (
                          <div className="muted text-[9px]">
                            {r.elec_start ?? '—'}→{r.elec_end ?? '—'}
                            {r.machine_id === 'GRD_O' ? ' ×3' : ''}
                          </div>
                        )}
                        {r.firewood_kg != null && (
                          <div className="muted text-[9px]">{r.firewood_kg} fw</div>
                        )}
                      </td>
                      <td className="tnum">{r.workers ?? '—'}</td>
                      <td className="tnum">{w != null ? `${w} kg` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {readOnly && <RunReadOnly run={selected} onClose={() => setSelected(null)} />}

      <RunDetail
        run={readOnly ? null : selected}
        onClose={() => setSelected(null)}
        onSaved={(saved) => {
          // The table and its totals follow the correction straight away,
          // rather than waiting for the next fetch.
          setRows((current) => current.map((r) => (r.id === saved.id ? saved : r)));
          setSelected(null);
        }}
        onDeleted={(id) => {
          setRows((current) => current.filter((r) => r.id !== id));
          setTotal((n) => Math.max(0, n - 1));
          setSelected(null);
        }}
      />
    </>
  );
}

export default AdminHistoryPage;
