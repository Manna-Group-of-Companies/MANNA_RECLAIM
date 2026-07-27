import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchShiftRuns } from '@/features/machines/runsSlice';
import { DataTable, type Column } from '@/components/ui';
import { SHIFTS } from '@/config/constants';
import { clock, todayISO } from '@/utils/date';
import { elapsed, kg } from '@/utils/format';
import type { Run, Shift } from '@/types/models';

const columns: Column<Run>[] = [
  { key: 'machine', header: 'Machine', render: (r) => r.machine_id },
  { key: 'shift', header: 'Shift', render: (r) => `${r.shift_date} ${r.shift}` },
  { key: 'supervisor', header: 'Supervisor', render: (r) => r.supervisor ?? '--' },
  { key: 'quality', header: 'Quality', render: (r) => r.quality ?? '--' },
  { key: 'start', header: 'Start', render: (r) => <span className="tnum">{clock(r.started_at)}</span> },
  { key: 'stop', header: 'Stop', render: (r) => <span className="tnum">{clock(r.stopped_at)}</span> },
  {
    key: 'dur',
    header: 'Duration',
    render: (r) => <span className="tnum">{r.stopped_at ? elapsed(r.started_at, r.stopped_at) : 'live'}</span>,
  },
  { key: 'workers', header: 'Crew', align: 'center', render: (r) => r.workers ?? '--' },
  { key: 'out', header: 'Out', align: 'right', render: (r) => <span className="tnum">{kg(r.out_weight)}</span> },
];

/** The searchable run ledger - the first tab of back.html. */
export function AdminHistoryPage() {
  const dispatch = useAppDispatch();
  const { shift: rows, loading } = useAppSelector((s) => s.runs);
  const [date, setDate] = useState(todayISO());
  const [shift, setShift] = useState<Shift>('Day');

  useEffect(() => {
    void dispatch(fetchShiftRuns({ date, shift }));
  }, [dispatch, date, shift]);

  return (
    <section className="panel p-4">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label-caps" htmlFor="hist-date">Date</label>
          <input
            id="hist-date"
            type="date"
            className="field-input w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="hist-shift">Shift</label>
          <select
            id="hist-shift"
            className="field-input w-auto"
            value={shift}
            onChange={(e) => setShift(e.target.value as Shift)}
          >
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </header>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} empty="No runs for that shift" />
    </section>
  );
}

export default AdminHistoryPage;
