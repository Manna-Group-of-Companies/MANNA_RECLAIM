import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDashboard } from '@/features/reports/reportsSlice';
import { fetchBearingsDue, fetchOpenBreakdowns } from '@/features/maintenance/maintenanceSlice';
import { adminPaths } from '@/config/paths';
import { lastNDays } from '@/utils/date';
import { num, rupees } from '@/utils/format';
import { cn } from '@/utils/cn';

const WINDOWS = [7, 30, 90];

/** Single-request overview: production, costing, and what needs attention. */
export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { production, costing, efficiency, loading } = useAppSelector((s) => s.reports);
  const dueNow = useAppSelector((s) => s.maintenance.due.filter((d) => d.due));
  const openDown = useAppSelector((s) => s.maintenance.open);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [days, setDays] = useState(7);

  useEffect(() => {
    void dispatch(fetchDashboard(lastNDays(days)));
    void dispatch(fetchBearingsDue());
    void dispatch(fetchOpenBreakdowns());
  }, [dispatch, days, refreshTick]);

  return (
    <>
      <div className="panel">
        <div className="chips">
          {WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              className={cn('chip', days === d && 'on')}
              onClick={() => setDays(d)}
            >
              Last {d} days
            </button>
          ))}
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{num(production?.outKg ?? 0, 0)}</b>
            <span>kg out</span>
          </div>
          <div className="kpi">
            <b>{production?.runs ?? 0}</b>
            <span>runs</span>
          </div>
          <div className="kpi">
            <b>{num(production?.kgPerHour ?? 0)}</b>
            <span>kg / h</span>
          </div>
          <div className="kpi">
            <b>{num(production?.kwh ?? 0, 0)}</b>
            <span>kWh</span>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi">
            <b>{costing?.autoclaveLoads ?? 0}</b>
            <span>autoclave loads</span>
          </div>
          <div className="kpi">
            <b>{rupees(costing?.conversionCost ?? 0)}</b>
            <span>conversion cost</span>
          </div>
          <div className="kpi">
            <b>{num(costing?.dispatchedKg ?? 0, 0)}</b>
            <span>kg dispatched</span>
          </div>
          <div className="kpi">
            <b>{rupees(costing?.revenue ?? 0)}</b>
            <span>dispatched value</span>
          </div>
        </div>
      </div>

      {(openDown.length > 0 || dueNow.length > 0) && (
        <>
          <div className="grouphead">Needs attention</div>
          {openDown.map((log) => (
            <Link key={log.id} to={adminPaths.maintenance} className="mrow">
              <div>
                <div className="mn">{log.machine ?? log.machine_id} is down</div>
                <div className="mk">{log.root_cause || 'no cause recorded yet'}</div>
              </div>
              <span className="badge warn">open</span>
            </Link>
          ))}
          {dueNow.length > 0 && (
            <Link to={adminPaths.bearings} className="mrow">
              <div>
                <div className="mn">
                  {dueNow.length} machine{dueNow.length > 1 ? 's' : ''} due for bearing temps
                </div>
                <div className="mk">{dueNow.map((d) => d.machine ?? d.machineId).join(', ')}</div>
              </div>
              <span className="badge hot">due</span>
            </Link>
          )}
        </>
      )}

      {loading && <div className="spin">Loading plant data…</div>}

      <div className="grouphead">Output by machine</div>
      {!efficiency.length ? (
        <div className="empty">No runs in this window.</div>
      ) : (
        <div className="panel scroll-x mt-0 p-0">
          <table className="tt min-w-[480px]">
            <thead>
              <tr>
                <th>Machine</th>
                <th className="tnum">Runs</th>
                <th className="tnum">Hours</th>
                <th className="tnum">Out</th>
                <th className="tnum">kg / h</th>
              </tr>
            </thead>
            <tbody>
              {efficiency.map((row) => (
                <tr key={row.machineId}>
                  <td>{row.machine ?? row.machineId}</td>
                  <td className="tnum">{row.runs}</td>
                  <td className="tnum">{num(row.hours, 1)}</td>
                  <td className="tnum">{num(row.outKg, 0)} kg</td>
                  <td className="tnum">{num(row.kgPerHour)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default DashboardPage;
