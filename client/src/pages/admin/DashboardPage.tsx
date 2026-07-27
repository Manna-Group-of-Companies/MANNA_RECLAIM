import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDashboard } from '@/features/reports/reportsSlice';
import { fetchBearingsDue } from '@/features/maintenance/maintenanceSlice';
import { PageLoader, StatTile } from '@/components/ui';
import { lastNDays } from '@/utils/date';
import { num, rupees } from '@/utils/format';

/** Single-request overview: production, costing and greasing alerts. */
export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { production, costing, loading } = useAppSelector((s) => s.reports);
  const due = useAppSelector((s) => s.maintenance.due.filter((d) => d.due).length);

  useEffect(() => {
    void dispatch(fetchDashboard(lastNDays(7)));
    void dispatch(fetchBearingsDue());
  }, [dispatch]);

  if (loading && !production) return <PageLoader label="Building dashboard" />;

  return (
    <div className="space-y-4">
      <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">Last 7 days</h1>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Output" value={num(production?.outKg ?? 0, 0)} unit="kg" />
        <StatTile label="Runs" value={production?.runs ?? 0} />
        <StatTile label="Rate" value={num(production?.kgPerHour ?? 0)} unit="kg/h" />
        <StatTile label="Revenue" value={rupees(costing?.revenue ?? 0)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Autoclave loads" value={costing?.autoclaveLoads ?? 0} />
        <StatTile label="Firewood" value={num(costing?.firewoodKg ?? 0, 0)} unit="kg" />
        <StatTile label="Run hours" value={num(production?.runHours ?? 0)} unit="h" />
        <StatTile
          label="Greasing due"
          value={due}
          hint={due ? 'Machines waiting on bearings or bushes' : 'All machines within interval'}
        />
      </div>
    </div>
  );
}

export default DashboardPage;
