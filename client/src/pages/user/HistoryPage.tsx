import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchShiftRuns } from '@/features/machines/runsSlice';
import {
  DataTable,
  PageLoader,
  QualityChip,
  SelectField,
  TextField,
  ViewHead,
  type Column,
} from '@/components/ui';
import { SHIFTS } from '@/config/constants';
import { currentShift, dayMonth, todayISO } from '@/utils/date';
import { duration, kg } from '@/utils/format';
import type { Run, Shift } from '@/types/models';

const columns: Column<Run>[] = [
  { key: 'machine', header: 'Machine', render: (r) => r.machine ?? r.machine_id },
  {
    key: 'quality',
    header: 'Quality',
    render: (r) => (r.quality ? <QualityChip quality={r.quality} /> : (r.mesh ?? '--')),
  },
  {
    key: 'run',
    header: 'Run',
    render: (r) => (
      <span className="tnum">{r.status === 'running' ? 'live' : duration(r.runtime_min, r.hours_run)}</span>
    ),
  },
  {
    key: 'out',
    header: 'Out',
    align: 'right',
    render: (r) => <span className="tnum">{kg(r.out_weight ?? r.weight_kg)}</span>,
  },
];

/**
 * One shift's runs, with a date and shift picker. Asked for nothing, the
 * server answers with the most recent shift that actually has runs - a plant
 * that has not started today would otherwise open on an empty table.
 */
export function HistoryPage() {
  const dispatch = useAppDispatch();
  const { shift, shiftDate, shiftName, loading } = useAppSelector((s) => s.runs);
  const [date, setDate] = useState('');
  const [name, setName] = useState<Shift | ''>('');

  useEffect(() => {
    void dispatch(fetchShiftRuns(date ? { date, shift: name || undefined } : undefined));
  }, [dispatch, date, name]);

  // Track back whatever the server resolved to, so the pickers show the shift
  // actually on screen rather than sitting blank.
  useEffect(() => {
    if (!date && shiftDate) setDate(shiftDate);
    if (!name && shiftName) setName(shiftName);
  }, [shiftDate, shiftName, date, name]);

  const isNow = shiftDate === todayISO() && shiftName === currentShift();
  const outTotal = shift.reduce((sum, r) => sum + (r.out_weight ?? r.weight_kg ?? 0), 0);

  if (loading && !shift.length) return <PageLoader label="Loading history" />;

  return (
    <>
      <ViewHead
        title="History"
        meta={shiftDate ? `${dayMonth(shiftDate)} · ${shiftName ?? ''}` : '--'}
      />

      <div className="histbar">
        <TextField
          label="Date"
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          fieldClassName="!mb-0"
        />
        <SelectField
          label="Shift"
          value={name}
          onChange={(e) => setName(e.target.value as Shift)}
          fieldClassName="!mb-0"
        >
          {SHIFTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="histsum">
        <b>{shift.length}</b> run{shift.length === 1 ? '' : 's'} · <b>{kg(outTotal)}</b> out
        {isNow ? ' · this shift' : ''}
      </div>

      <section className="panel">
        <DataTable
          columns={columns}
          rows={shift}
          rowKey={(r) => r.id}
          empty="No runs logged this shift"
        />
      </section>
    </>
  );
}

export default HistoryPage;
