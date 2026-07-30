import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchBearingLogs, fetchBearingsDue } from '@/features/maintenance/maintenanceSlice';
import { fetchMachines } from '@/features/machines/machinesSlice';
import { BEARING_TEMP_LIMIT_C } from '@/config/constants';
import { dayLong } from '@/utils/date';
import { ago, minutes } from '@/utils/format';
import type { BearingDue, BearingLog } from '@/types/models';

interface Point {
  t: number;
  v: number;
}

/**
 * Temperature against time for one bearing position, with the limit drawn
 * across it. Hand-built SVG rather than a chart library: it is one series on a
 * fixed viewBox, and the threshold line is the whole point of looking.
 */
function TrendChart({ points }: { points: Point[] }) {
  if (!points.length) return <div className="empty">No readings.</div>;

  const W = 680;
  const H = 200;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 24;

  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t === t0 ? t0 + 1 : points[points.length - 1]!.t;
  const vmax = Math.max(BEARING_TEMP_LIMIT_C + 10, ...points.map((p) => p.v)) + 8;
  const vmin = Math.max(0, Math.min(20, ...points.map((p) => p.v)) - 5);

  const X = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - (v - vmin) / (vmax - vmin)) * (H - padT - padB);

  const gridlines: number[] = [];
  for (let g = Math.ceil(vmin / 20) * 20; g <= vmax; g += 20) gridlines.push(g);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const limitY = Y(BEARING_TEMP_LIMIT_C);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {gridlines.map((g) => (
        <g key={g}>
          <line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke="var(--rule)" />
          <text x="2" y={Y(g) + 3} fill="var(--ink-faint)" fontSize="9">
            {g}
          </text>
        </g>
      ))}
      <line
        x1={padL}
        y1={limitY}
        x2={W - padR}
        y2={limitY}
        stroke="var(--err)"
        strokeWidth="1.2"
        strokeDasharray="5 4"
      />
      <text x={W - padR} y={limitY - 4} fill="var(--err)" fontSize="9" textAnchor="end">
        {BEARING_TEMP_LIMIT_C}°
      </text>
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="1.8" />
      {points.map((p, i) => {
        const hot = p.v >= BEARING_TEMP_LIMIT_C;
        return (
          <circle
            key={`${p.t}-${i}`}
            cx={X(p.t).toFixed(1)}
            cy={Y(p.v).toFixed(1)}
            r={hot ? 3.2 : 2.2}
            fill={hot ? 'var(--err)' : 'var(--brand)'}
          />
        );
      })}
      <text x={padL} y={H - 6} fill="var(--ink-faint)" fontSize="9">
        {dayLong(new Date(t0).toISOString().slice(0, 10))}
      </text>
      <text x={W - padR} y={H - 6} fill="var(--ink-faint)" fontSize="9" textAnchor="end">
        {dayLong(new Date(t1).toISOString().slice(0, 10))}
      </text>
    </svg>
  );
}

/**
 * Greasing schedule and temperature history. Read-only: a reading is taken at
 * the machine with a thermometer, so it is logged from the shop-floor Bearing
 * tab, not clicked off from a desk.
 */
export function BearingsPage() {
  const dispatch = useAppDispatch();
  const due = useAppSelector((s) => s.maintenance.due);
  const logs = useAppSelector((s) => s.maintenance.bearings);
  const machines = useAppSelector((s) => s.machines.items);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [selected, setSelected] = useState<BearingDue | null>(null);

  useEffect(() => {
    void dispatch(fetchMachines());
    void dispatch(fetchBearingsDue());
    void dispatch(fetchBearingLogs({ limit: 500 }));
  }, [dispatch, refreshTick]);

  const countByMachine = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of logs) map.set(log.machine_id, (map.get(log.machine_id) ?? 0) + 1);
    return map;
  }, [logs]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, BearingDue[]>();
    for (const row of due) {
      const machine = machines.find((m) => m.id === row.machineId);
      const key = machine?.group_name ?? 'Other';
      byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
    }
    return [...byGroup];
  }, [due, machines]);

  const seriesByPosition = useMemo(() => {
    if (!selected) return [];
    const mine = logs.filter((l: BearingLog) => l.machine_id === selected.machineId);
    const byPosition = new Map<string, Point[]>();
    for (const log of mine) {
      const position = log.position ?? '—';
      const t = new Date(log.ts).getTime();
      const v = log.temp_c;
      if (v == null || Number.isNaN(t)) continue;
      byPosition.set(position, [...(byPosition.get(position) ?? []), { t, v }]);
    }
    return [...byPosition]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([position, points]) => ({ position, points: points.sort((a, b) => a.t - b.t) }));
  }, [logs, selected]);

  if (selected) {
    const mineCount = countByMachine.get(selected.machineId) ?? 0;
    return (
      <>
        <button type="button" className="back" onClick={() => setSelected(null)}>
          ‹ Back to bearings
        </button>
        <div className="panel">
          <div className="row">
            <div>
              <h1 className="text-lg">{selected.machine}</h1>
              <div className="sub">
                {mineCount} readings · every {selected.intervalH} h · threshold{' '}
                {BEARING_TEMP_LIMIT_C} °C
              </div>
            </div>
            <span className={`badge ${selected.due ? 'warn' : 'ok'}`}>
              {selected.due ? 'due now' : `in ${minutes(selected.dueInMin)}`}
            </span>
          </div>
        </div>

        {!seriesByPosition.length && <div className="empty">No bearing readings yet.</div>}

        {seriesByPosition.map(({ position, points }) => {
          const last = points[points.length - 1]?.v ?? null;
          const max = points.reduce((a, p) => Math.max(a, p.v), 0);
          return (
            <div key={position} className="panel">
              <div className="row">
                <div className="font-semibold">
                  {selected.bearingType} {position}
                </div>
                <div className="muted text-xs">
                  last {last == null ? '—' : `${last}°`} · max {max ? `${max}°` : '—'}
                </div>
              </div>
              <TrendChart points={points} />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      <div className="panel">
        <div className="sub">
          Tap a machine to see each bearing / bush temperature trend. Threshold{' '}
          {BEARING_TEMP_LIMIT_C} °C. Readings are logged from the shop-floor Bearing tab.
        </div>
      </div>

      {!groups.length && <div className="empty">No machines on a greasing schedule.</div>}

      {groups.map(([group, rows]) => (
        <div key={group}>
          <div className="grouphead">{group}</div>
          {rows.map((row) => {
            const count = countByMachine.get(row.machineId) ?? 0;
            return (
              <button
                key={row.machineId}
                type="button"
                className="mrow"
                onClick={() => setSelected(row)}
              >
                <div>
                  <div className="mn">{row.machine}</div>
                  <div className="mk">
                    {row.bearingType} · {count ? `${count} readings` : 'no readings'}
                    {row.lastAt ? ` · last ${ago(row.lastAt)}` : ''}
                  </div>
                </div>
                <div className="row gap-2">
                  <span className={`badge ${row.due ? 'warn' : count ? 'ok' : 'none'}`}>
                    {row.due ? 'due' : count ? `in ${minutes(row.dueInMin)}` : '—'}
                  </span>
                  <span className="chev">›</span>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default BearingsPage;
