import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDashboard } from '@/features/reports/reportsSlice';
import { PageLoader, StatTile } from '@/components/ui';
import { FIREWOOD_KG_PER_LOAD } from '@/config/constants';
import { lastNDays } from '@/utils/date';
import { num, rupees } from '@/utils/format';

/** Firewood per load and dispatch revenue for a chosen window. */
export function CostingPage() {
  const dispatch = useAppDispatch();
  const { costing, production, loading } = useAppSelector((s) => s.reports);
  const [days, setDays] = useState(30);

  useEffect(() => {
    void dispatch(fetchDashboard(lastNDays(days)));
  }, [dispatch, days]);

  if (loading && !costing) return <PageLoader label="Building costing" />;

  const perKg = production?.outKg ? (costing?.revenue ?? 0) / production.outKg : 0;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">Costing</h1>
        <select
          className="field-input w-auto"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Window"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Revenue" value={rupees(costing?.revenue ?? 0)} />
        <StatTile label="Autoclave loads" value={costing?.autoclaveLoads ?? 0} />
        <StatTile
          label="Firewood"
          value={num(costing?.firewoodKg ?? 0, 0)}
          unit="kg"
          hint={`${FIREWOOD_KG_PER_LOAD} kg per load`}
        />
        <StatTile label="Revenue / kg" value={num(perKg, 2)} hint="Dispatched value over produced weight" />
      </div>
    </div>
  );
}

export default CostingPage;
