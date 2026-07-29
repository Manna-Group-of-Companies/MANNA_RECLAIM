import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  clearDowntimeDetail,
  fetchDowntime,
  fetchDowntimeDetail,
} from '@/features/reports/reportsSlice';
import { logRepair } from '@/features/maintenance/maintenanceSlice';
import { BoModal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { clock, dayLong, monthLong } from '@/utils/date';
import { num } from '@/utils/format';
import type { DowntimeDetail } from '@/types/models';

const blankRepair = { rootCause: '', resolution: '', prevention: '' };

const asHours = (minutes?: number | null) => (minutes == null ? '—' : `${num(minutes / 60, 2)} h`);

/**
 * Downtime, by month and then by machine, with each breakdown's write-up.
 *
 * The list is ordered worst-first rather than by date: the question this page
 * answers is which machine is costing the plant its hours, not what happened
 * most recently.
 */
export function MaintenancePage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { downtime, downtimeDetail, loading } = useAppSelector((s) => s.reports);
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);

  const [month, setMonth] = useState('');
  const [machine, setMachine] = useState<{ id: string; name: string } | null>(null);
  const [closing, setClosing] = useState<DowntimeDetail | null>(null);
  const [form, setForm] = useState(blankRepair);

  useEffect(() => {
    void dispatch(fetchDowntime(month ? { month } : undefined));
  }, [dispatch, month, refreshTick]);

  // Follow whichever month the server resolved to, so the picker is not blank.
  useEffect(() => {
    if (!month && downtime?.month) setMonth(downtime.month);
  }, [downtime, month]);

  useEffect(() => {
    if (!machine) {
      dispatch(clearDowntimeDetail());
      return;
    }
    void dispatch(fetchDowntimeDetail({ month, machineId: machine.id }));
  }, [dispatch, machine, month, refreshTick]);

  const closeBreakdown = async () => {
    if (!closing) return;
    if (!form.rootCause.trim() || !form.resolution.trim() || !form.prevention.trim()) {
      notify('Fill in all three answers', 'warn');
      return;
    }
    const result = await dispatch(logRepair({ id: closing.id, ...form }));
    const okay = logRepair.fulfilled.match(result);
    notify(okay ? 'Closed' : 'Could not close it', okay ? 'ok' : 'err');
    if (okay) {
      setClosing(null);
      setForm(blankRepair);
      if (machine) void dispatch(fetchDowntimeDetail({ month, machineId: machine.id }));
      void dispatch(fetchDowntime({ month }));
    }
  };

  if (machine) {
    const total = downtimeDetail.reduce((s, e) => s + (e.downtime_min ?? 0), 0);
    return (
      <>
        <button type="button" className="back" onClick={() => setMachine(null)}>
          ‹ Back to {monthLong(month)}
        </button>
        <div className="panel">
          <div className="row">
            <div>
              <h1 className="text-lg">{machine.name}</h1>
              <div className="sub">
                {monthLong(month)} · {asHours(total)} down · {downtimeDetail.length} event
                {downtimeDetail.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </div>

        {!downtimeDetail.length && <div className="empty">Nothing logged for this machine.</div>}

        {downtimeDetail.map((e) => (
          <div key={e.id} className="runcard">
            <div className="top">
              <div className="ttl">
                {e.repaired_at ? asHours(e.downtime_min) + ' down' : 'Still down'}
              </div>
              <div className="when">
                {dayLong(e.down_start?.slice(0, 10))} · {clock(e.down_start)} →{' '}
                {e.repaired_at ? clock(e.repaired_at) : '—'}
              </div>
            </div>
            <div className="reasons">
              {e.root_cause && (
                <div>
                  <span className="lab">Root cause</span>
                  <br />
                  {e.root_cause}
                </div>
              )}
              {e.resolution && (
                <div>
                  <span className="lab">How it was resolved</span>
                  <br />
                  {e.resolution}
                </div>
              )}
              {e.prevention && (
                <div>
                  <span className="lab">Prevention</span>
                  <br />
                  {e.prevention}
                </div>
              )}
              {!e.root_cause && !e.resolution && !e.prevention && (
                <div className="muted">No reason recorded.</div>
              )}
            </div>
            {!e.repaired_at && (
              <button
                type="button"
                className="btn ghost block mt-2.5"
                onClick={() => {
                  setForm(blankRepair);
                  setClosing(e);
                }}
              >
                Close this breakdown
              </button>
            )}
          </div>
        ))}

        <BoModal
          open={Boolean(closing)}
          title={`Close breakdown — ${machine.name}`}
          subtitle="The same three answers the shop floor gives; nothing is filed without them."
          onClose={() => setClosing(null)}
          footer={
            <button type="button" className="btn" onClick={closeBreakdown}>
              Mark repaired
            </button>
          }
        >
          <div className="mt-3">
            <div className="field">
              <label htmlFor="m-cause">1 · Root cause</label>
              <textarea
                id="m-cause"
                rows={2}
                value={form.rootCause}
                onChange={(e) => setForm({ ...form, rootCause: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="m-fix">2 · How it was resolved</label>
              <textarea
                id="m-fix"
                rows={2}
                value={form.resolution}
                onChange={(e) => setForm({ ...form, resolution: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="m-prev">3 · Steps so it does not recur</label>
              <textarea
                id="m-prev"
                rows={2}
                value={form.prevention}
                onChange={(e) => setForm({ ...form, prevention: e.target.value })}
              />
            </div>
          </div>
        </BoModal>
      </>
    );
  }

  return (
    <>
      <div className="panel">
        <label htmlFor="mt-month">Month</label>
        <select id="mt-month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {downtime?.months.length ? (
            downtime.months.map((m) => (
              <option key={m} value={m}>
                {monthLong(m)}
              </option>
            ))
          ) : (
            <option value="">No data</option>
          )}
        </select>

        <div className="kpis">
          <div className="kpi">
            <b>{asHours(downtime?.totalMinutes ?? 0)}</b>
            <span>total downtime</span>
          </div>
          <div className="kpi">
            <b>{downtime?.events ?? 0}</b>
            <span>breakdowns</span>
          </div>
        </div>
      </div>

      {loading && <div className="spin">Loading maintenance…</div>}

      <div className="grouphead">Downtime by machine</div>
      {!downtime?.byMachine.length ? (
        <div className="empty">No breakdowns logged in {monthLong(month)}.</div>
      ) : (
        downtime.byMachine.map((m) => (
          <button
            key={m.machineId}
            type="button"
            className="mrow"
            onClick={() => setMachine({ id: m.machineId, name: m.machine })}
          >
            <div>
              <div className="mn">{m.machine}</div>
              <div className="mk">
                {m.events} breakdown{m.events > 1 ? 's' : ''}
              </div>
            </div>
            <div className="row gap-2">
              <span className="badge hot">{num(m.hours, 2)} h</span>
              <span className="chev">›</span>
            </div>
          </button>
        ))
      )}
    </>
  );
}

export default MaintenancePage;
