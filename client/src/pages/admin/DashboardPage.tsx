import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDashboard } from '@/features/reports/reportsSlice';
import { PlantSummary } from '@/features/reports/PlantSummary';
import { fetchBearingsDue, fetchOpenBreakdowns } from '@/features/maintenance/maintenanceSlice';
import { adminPaths } from '@/config/paths';
import { useBearingDue } from '@/hooks/useBearingDue';
import { lastNDays } from '@/utils/date';

/**
 * Single-request overview: production, costing, and what needs attention.
 *
 * The figures and the per-machine table are PlantSummary, which the managing
 * director's screen shows as well. What is here and not there is the attention
 * list - every row of it is a link into Maintenance or Bearings, which is the
 * back office's work and not an MD's.
 */
export function DashboardPage() {
  const dispatch = useAppDispatch();
  const dueNow = useBearingDue().filter((d) => d.due);
  const openDown = useAppSelector((s) => s.maintenance.open);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  const [days, setDays] = useState(7);

  useEffect(() => {
    void dispatch(fetchDashboard(lastNDays(days)));
    void dispatch(fetchBearingsDue());
    void dispatch(fetchOpenBreakdowns());
  }, [dispatch, days, refreshTick]);

  return (
    <PlantSummary days={days} onDays={setDays}>
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
    </PlantSummary>
  );
}

export default DashboardPage;
