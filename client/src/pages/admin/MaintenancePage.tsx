import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchMaintenance, resolveMaintenance } from '@/features/maintenance/maintenanceSlice';
import { Badge, Button, DataTable, type Column } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { dayMonth } from '@/utils/date';
import type { MaintenanceLog } from '@/types/models';

export function MaintenancePage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { logs, loading } = useAppSelector((s) => s.maintenance);

  useEffect(() => {
    void dispatch(fetchMaintenance(undefined));
  }, [dispatch]);

  const columns: Column<MaintenanceLog>[] = [
    { key: 'machine', header: 'Machine', render: (l) => l.machine_id },
    { key: 'title', header: 'Issue', render: (l) => <span className="font-semibold">{l.title}</span> },
    { key: 'kind', header: 'Kind', render: (l) => l.kind },
    {
      key: 'severity',
      header: 'Severity',
      render: (l) => (
        <Badge tone={l.severity === 'high' ? 'down' : l.severity === 'medium' ? 'warn' : 'neutral'}>
          {l.severity}
        </Badge>
      ),
    },
    { key: 'logged', header: 'Logged', render: (l) => dayMonth(l.logged_at) },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (l) =>
        l.status === 'open' ? (
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const result = await dispatch(resolveMaintenance({ id: l.id }));
              notify(resolveMaintenance.fulfilled.match(result) ? 'Closed' : 'Could not close it', resolveMaintenance.fulfilled.match(result) ? 'ok' : 'err');
            }}
          >
            Close
          </Button>
        ) : (
          <Badge tone="ok">Closed</Badge>
        ),
    },
  ];

  return (
    <section className="panel p-4">
      <h1 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">Maintenance log</h1>
      <DataTable columns={columns} rows={logs} rowKey={(l) => l.id} loading={loading} empty="Nothing logged" />
    </section>
  );
}

export default MaintenancePage;
