import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchRunFilters } from '@/features/reports/reportsSlice';
import { runService } from '@/api/services/run.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import {
  buildPayload,
  changedFields,
  draftOf,
  round2,
  runMath,
  text,
  type Draft,
} from '@/features/history/runDraft';
import { QUALITIES, SHIFTS } from '@/config/constants';
import { clock, dayLong } from '@/utils/date';
import { hours, kwhOf, num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Run } from '@/types/models';

const SHIFT_CHIPS = [
  { value: '', label: 'Both shifts' },
  { value: 'Day', label: 'Day shift' },
  { value: 'Night', label: 'Night shift' },
];

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
  const { isAuto, isPress, isTod, elecStart, elecEnd, hourStart, hourEnd } = math;
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
      await runService.remove(run.id);
      onDeleted(run.id);
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
        {field('Crew', numberInput('workers'))}

        {/* No meters on a press, and no energy or hours to correct against them. */}
        {!isAuto && !isPress && (
          <>
            <div className="grouphead">Electricity{isTod && <span className="muted font-normal"> (TOD meter, one phase)</span>}</div>
            {field(<>Reading at start <span className="muted font-normal">(units)</span></>, numberInput('elecStart'))}
            {field(
              <>Reading at stop <span className="muted font-normal">(units)</span></>,
              numberInput('elecEnd'),
              elecDelta != null ? (
                <div className={cn('diffout show mt-1.5', elecDelta < 0 && 'bad')}>
                  Consumed: <b>{elecEnd}</b> − {elecStart} = <b>{elecDelta}</b> units
                  {isTod && elecDelta >= 0 && (
                    <>
                      {' '}
                      × 3 = <b>{round2(elecDelta * 3)}</b> kWh
                    </>
                  )}
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
 * Every run, filtered by day / machine / shift.
 *
 * The rows come back already filtered rather than being pulled down whole and
 * sifted in the browser - the plant has well over a thousand runs on record,
 * and that number only grows.
 */
export function AdminHistoryPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.reports.filters);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [date, setDate] = useState('');
  const [machineId, setMachineId] = useState('');
  const [shift, setShift] = useState('');
  const [rows, setRows] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Run | null>(null);

  useEffect(() => {
    void dispatch(fetchRunFilters());
  }, [dispatch, refreshTick]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    runService
      .list({
        date: date || undefined,
        machineId: machineId || undefined,
        shift: shift || undefined,
        limit: 200,
      })
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
  }, [date, machineId, shift, refreshTick]);

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
        <div className="bar">
          <div className="f">
            <label htmlFor="h-day">Day</label>
            <select id="h-day" value={date} onChange={(e) => setDate(e.target.value)}>
              <option value="">All days</option>
              {filters?.days.map((d) => (
                <option key={d} value={d}>
                  {dayLong(d)}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="h-machine">Machine</label>
            <select id="h-machine" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
              <option value="">All machines</option>
              {filters?.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="chips mt-2.5">
          {SHIFT_CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              className={cn('chip', shift === c.value && 'on')}
              onClick={() => setShift(c.value)}
            >
              {c.label}
            </button>
          ))}
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
            Showing the {rows.length} most recent of {total} matching runs — narrow the day or
            machine to see the rest.
          </div>
        )}
      </div>

      {error && <div className="errbox">Couldn’t load runs: {error}</div>}
      {loading && <div className="spin">Loading plant data…</div>}
      {!loading && !error && !rows.length && <div className="empty">No runs match these filters.</div>}

      {!loading && rows.length > 0 && (
        <>
          <div className="sub mx-0.5 mb-1.5 mt-3">Tap any row for the full run details.</div>
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
                    <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer">
                      <td>
                        <b>{dayLong(r.shift_date)}</b>
                        {r.shift && <div className="muted text-[10px]">{r.shift} shift</div>}
                        {r.supervisor && <div className="muted text-[10px]">{r.supervisor}</div>}
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

      <RunDetail
        run={selected}
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
