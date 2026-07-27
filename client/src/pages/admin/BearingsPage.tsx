import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchBearingsDue, logBearing } from '@/features/maintenance/maintenanceSlice';
import { Badge, Button, DataTable, type Column } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { clock } from '@/utils/date';
import type { BearingDue } from '@/types/models';

/** Greasing schedule: 2 h on the grinding line, 3 h on the refiners. */
export function BearingsPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const due = useAppSelector((s) => s.maintenance.due);

  useEffect(() => {
    void dispatch(fetchBearingsDue());
  }, [dispatch]);

  const columns: Column<BearingDue>[] = [
    { key: 'machine', header: 'Machine', render: (d) => d.machineId },
    { key: 'interval', header: 'Interval', render: (d) => `${d.intervalH} h` },
    {
      key: 'last',
      header: 'Last greased',
      render: (d) => <span className="tnum">{d.lastAt ? clock(new Date(d.lastAt).toISOString()) : 'never'}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (d) =>
        d.due ? <Badge tone="down">Due now</Badge> : <Badge tone="ok">{`in ${d.dueInMin} min`}</Badge>,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (d) => (
        <Button
          size="sm"
          variant={d.due ? 'primary' : 'ghost'}
          onClick={async () => {
            const result = await dispatch(logBearing({ machineId: d.machineId }));
            notify(logBearing.fulfilled.match(result) ? 'Greasing logged' : 'Could not log it', logBearing.fulfilled.match(result) ? 'ok' : 'err');
          }}
        >
          Log greasing
        </Button>
      ),
    },
  ];

  return (
    <section className="panel p-4">
      <h1 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">Bearings and bushes</h1>
      <DataTable columns={columns} rows={due} rowKey={(d) => d.machineId} empty="No machines on a greasing schedule" />
    </section>
  );
}

export default BearingsPage;
