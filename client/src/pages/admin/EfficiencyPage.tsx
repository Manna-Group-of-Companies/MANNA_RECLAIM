import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchDashboard } from '@/features/reports/reportsSlice';
import { DataTable, type Column } from '@/components/ui';
import { lastNDays } from '@/utils/date';
import { num } from '@/utils/format';
import type { EfficiencyRow } from '@/types/models';

const columns: Column<EfficiencyRow>[] = [
  { key: 'machine', header: 'Machine', render: (r) => r.machineId },
  { key: 'runs', header: 'Runs', align: 'right', render: (r) => <span className="tnum">{r.runs}</span> },
  { key: 'hours', header: 'Hours', align: 'right', render: (r) => <span className="tnum">{num(r.hours)}</span> },
  { key: 'out', header: 'Output kg', align: 'right', render: (r) => <span className="tnum">{num(r.outKg, 0)}</span> },
  { key: 'rate', header: 'kg / h', align: 'right', render: (r) => <span className="tnum text-brand">{num(r.kgPerHour)}</span> },
  {
    key: 'crew',
    header: 'kg / worker-h',
    align: 'right',
    render: (r) => <span className="tnum">{num(r.kgPerWorkerHour)}</span>,
  },
];

export function EfficiencyPage() {
  const dispatch = useAppDispatch();
  const { efficiency, loading } = useAppSelector((s) => s.reports);

  useEffect(() => {
    void dispatch(fetchDashboard(lastNDays(30)));
  }, [dispatch]);

  return (
    <section className="panel p-4">
      <h1 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">
        Machine efficiency - last 30 days
      </h1>
      <DataTable
        columns={columns}
        rows={efficiency}
        rowKey={(r) => r.machineId}
        loading={loading}
        empty="No completed runs in this window"
      />
    </section>
  );
}

export default EfficiencyPage;
