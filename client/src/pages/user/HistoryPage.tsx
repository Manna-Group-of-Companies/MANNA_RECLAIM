import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchShiftRuns } from '@/features/machines/runsSlice';
import { DataTable, PageLoader, type Column } from '@/components/ui';
import { clock, currentShift, todayISO } from '@/utils/date';
import { elapsed, kg } from '@/utils/format';
import type { Run } from '@/types/models';

const columns: Column<Run>[] = [
  { key: 'machine', header: 'Machine', render: (r) => r.machine_id },
  { key: 'quality', header: 'Quality', render: (r) => r.quality ?? '--' },
  { key: 'start', header: 'Start', render: (r) => <span className="tnum">{clock(r.started_at)}</span> },
  {
    key: 'run',
    header: 'Run',
    render: (r) => <span className="tnum">{r.stopped_at ? elapsed(r.started_at, r.stopped_at) : 'live'}</span>,
  },
  { key: 'out', header: 'Out', align: 'right', render: (r) => <span className="tnum">{kg(r.out_weight)}</span> },
];

/** This shift's runs. The admin side has the full searchable ledger. */
export function HistoryPage() {
  const dispatch = useAppDispatch();
  const { shift, loading } = useAppSelector((s) => s.runs);

  useEffect(() => {
    void dispatch(fetchShiftRuns({ date: todayISO(), shift: currentShift() }));
  }, [dispatch]);

  if (loading && !shift.length) return <PageLoader label="Loading history" />;

  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h1 className="text-xs font-bold uppercase tracking-[0.22em] text-ink-dim">This shift</h1>
        <span className="tnum text-xs text-ink-faint">
          {todayISO()} - {currentShift()}
        </span>
      </header>
      <DataTable columns={columns} rows={shift} rowKey={(r) => r.id} empty="No runs logged this shift" />
    </section>
  );
}

export default HistoryPage;
