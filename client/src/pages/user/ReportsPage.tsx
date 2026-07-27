import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchProduction } from '@/features/reports/reportsSlice';
import { PageLoader, StatTile } from '@/components/ui';
import { lastNDays } from '@/utils/date';
import { num } from '@/utils/format';

/** Production headline for the last seven days. */
export function ReportsPage() {
  const dispatch = useAppDispatch();
  const production = useAppSelector((s) => s.reports.production);

  useEffect(() => {
    void dispatch(fetchProduction(lastNDays(7)));
  }, [dispatch]);

  if (!production) return <PageLoader label="Building report" />;

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-xs font-bold uppercase tracking-[0.22em] text-ink-dim">Last 7 days</h1>
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Output" value={num(production.outKg, 0)} unit="kg" />
        <StatTile label="Runs" value={production.runs} />
        <StatTile label="Run hours" value={num(production.runHours)} unit="h" />
        <StatTile label="Rate" value={num(production.kgPerHour)} unit="kg/h" />
      </div>
    </div>
  );
}

export default ReportsPage;
