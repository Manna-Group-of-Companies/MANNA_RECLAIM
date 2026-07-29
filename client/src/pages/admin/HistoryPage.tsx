import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchRunFilters } from '@/features/reports/reportsSlice';
import { runService } from '@/api/services/run.service';
import { toRequestError } from '@/api/axiosClient';
import { BoModal } from '@/components/ui';
import { clock, dayLong } from '@/utils/date';
import { hours, kwhOf, num } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Run } from '@/types/models';

const SHIFT_CHIPS = [
  { value: '', label: 'Both shifts' },
  { value: 'Day', label: 'Day shift' },
  { value: 'Night', label: 'Night shift' },
];

/** Everything recorded about one run, as the prototype's tap-through. */
function RunDetail({ run, onClose }: { run: Run | null; onClose: () => void }) {
  if (!run) return null;
  const isAuto = run.kind === 'autoclave';
  const h = hours(run);
  const k = kwhOf(run);
  const w = run.weight_kg ?? run.out_weight ?? null;

  const rows: [string, ReactNode][] = [
    ['Machine', run.machine ?? run.machine_id],
    ['Type', `${run.kind ?? ''}${run.line ? ` · ${run.line} line` : ''}`],
  ];
  if (run.batch_no) rows.push(['Batch', <span className="batchref">{run.batch_no}</span>]);
  if (run.quality) rows.push(['Grade', <span className="qchip">{run.quality}</span>]);
  if (run.formulation) rows.push(['Formulation', run.formulation]);
  if (run.capacity != null) rows.push(['Charge', `${run.capacity} kg`]);
  rows.push(['Shift', `${run.shift ?? '—'} shift · ${dayLong(run.shift_date)}`]);
  if (run.supervisor) rows.push(['Supervisor', run.supervisor]);
  rows.push([
    'Run time',
    <>
      {h != null ? `${num(h, 2)} h` : '—'}
      {run.runtime_min != null && <span className="muted"> · {run.runtime_min} min</span>}
    </>,
  ]);
  if (!isAuto && (run.elec_start != null || run.elec_end != null)) {
    rows.push([
      'Electricity meter',
      `${run.elec_start ?? '—'} → ${run.elec_end ?? '—'}${run.machine_id === 'GRD_O' ? ' (TOD ×3)' : ''}`,
    ]);
  }
  if (!isAuto && (run.hour_start != null || run.hour_end != null)) {
    rows.push(['Hour meter', `${run.hour_start ?? '—'} → ${run.hour_end ?? '—'}`]);
  }
  if (k != null) {
    rows.push([
      'Energy',
      <>
        {num(k, 1)} kWh{h ? <span className="muted"> · {num(k / h, 1)} kWh/h</span> : null}
      </>,
    ]);
  }
  if (run.firewood_kg != null) rows.push(['Firewood', `${run.firewood_kg} kg`]);
  if (run.workers != null) rows.push(['Crew', run.workers]);
  if (w != null) {
    rows.push([
      'Output',
      <>
        {w} kg{k != null && w > 0 ? <span className="muted"> · {num(k / w, 3)} kWh/kg</span> : null}
      </>,
    ]);
  }
  if ((run.passes ?? 1) > 1) rows.push(['Passes merged', run.passes]);

  return (
    <BoModal
      open
      title={`${run.machine ?? run.machine_id}${run.batch_no ? ` · Batch ${run.batch_no}` : ''}`}
      subtitle={`${run.shift ?? ''} shift · ${dayLong(run.shift_date)}${run.quality ? ` · ${run.quality}` : ''}`}
      onClose={onClose}
    >
      <div className="mt-3">
        {rows.map(([label, value], i) => (
          <div key={`${label}-${i}`} className="roRow">
            <span className="k">{label}</span>
            <span className="v">{value}</span>
          </div>
        ))}
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

      <RunDetail run={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export default AdminHistoryPage;
