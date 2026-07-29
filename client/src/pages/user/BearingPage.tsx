import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchMachines } from '@/features/machines/machinesSlice';
import { fetchActiveRuns } from '@/features/machines/runsSlice';
import {
  fetchBearingLogs,
  fetchBearingsDue,
  logBearings,
} from '@/features/maintenance/maintenanceSlice';
import {
  BottomSheet,
  Button,
  EmptyState,
  PageLoader,
  Readout,
  TextField,
  ViewHead,
} from '@/components/ui';
import { icons } from '@/config/icons';
import { useToast } from '@/hooks/useToast';
import { ago, minutes } from '@/utils/format';
import { currentShift, todayISO } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { BearingDue } from '@/types/models';

/**
 * The greasing schedule in one place. A machine is only *due* while it is
 * actually turning - an idle machine shows as idle rather than nagging - so
 * this reads the active runs alongside the schedule.
 */
export function BearingPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const due = useAppSelector((s) => s.maintenance.due);
  const logs = useAppSelector((s) => s.maintenance.bearings);
  const active = useAppSelector((s) => s.runs.active);
  const machines = useAppSelector((s) => s.machines.items);
  const supervisor = useAppSelector((s) => s.ui.supervisor);
  const loading = useAppSelector((s) => s.machines.loading);

  const [target, setTarget] = useState<BearingDue | null>(null);
  const [temps, setTemps] = useState<Record<string, string>>({});

  useEffect(() => {
    void dispatch(fetchMachines());
    void dispatch(fetchActiveRuns());
    void dispatch(fetchBearingsDue());
    void dispatch(fetchBearingLogs(undefined));
  }, [dispatch]);

  const runningIds = useMemo(() => new Set(active.map((r) => r.machine_id)), [active]);
  const lastByMachinePosition = useMemo(() => {
    const map = new Map<string, { temp: number | null; ts: string }>();
    for (const log of logs) {
      const key = `${log.machine_id}|${log.position}`;
      if (!map.has(key)) map.set(key, { temp: log.temp_c ?? null, ts: log.ts });
    }
    return map;
  }, [logs]);

  const statusOf = (row: BearingDue) => {
    if (!runningIds.has(row.machineId)) return { cls: 'idle', label: 'idle' } as const;
    if (row.lastAt == null) return { cls: 'miss', label: 'never logged' } as const;
    if (row.due) return { cls: 'due', label: `overdue ${minutes(row.dueInMin)}` } as const;
    return { cls: 'ok', label: `due in ${minutes(row.dueInMin)}` } as const;
  };

  const open = (row: BearingDue) => {
    setTarget(row);
    setTemps({});
  };

  const save = async () => {
    if (!target) return;
    const readings = target.positions
      .filter((p) => temps[p]?.trim())
      .map((position) => ({ position, tempC: Number(temps[position]) }));
    if (!readings.length) {
      notify('Enter at least one temperature', 'warn');
      return;
    }
    if (readings.some((r) => Number.isNaN(r.tempC) || r.tempC <= 0)) {
      notify('Temperatures must be above zero', 'warn');
      return;
    }
    const result = await dispatch(
      logBearings({
        machineId: target.machineId,
        machine: target.machine,
        kind: target.bearingType,
        readings,
        supervisor: supervisor || null,
        shiftDate: todayISO(),
        shift: currentShift(),
      }),
    );
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? `${target.machine} temps logged` : 'Could not log the temperatures', okay ? 'ok' : 'err');
    if (okay) {
      void dispatch(fetchBearingLogs(undefined));
      setTarget(null);
    }
  };

  if (loading && !machines.length) return <PageLoader label="Loading schedule" />;

  if (!due.length) {
    return (
      <>
        <ViewHead title="Bearing" />
        <EmptyState
          icon={icons.bearing}
          title="No greasing schedule"
          hint="Machines with bearings or bushes appear here once they are configured."
        />
      </>
    );
  }

  const overdue = due.filter((d) => d.due && runningIds.has(d.machineId)).length;

  return (
    <>
      <ViewHead title="Bearing" meta={overdue ? `${overdue} overdue` : 'all logged'} />

      <div className="stack">
        {due.map((row) => {
          const status = statusOf(row);
          return (
            <div key={row.machineId} className="bcard">
              <div className="bhead">
                <div className="l">
                  <b className="text-[15px]">{row.machine ?? row.machineId}</b>
                  <span className="formchip">
                    {row.positions.length} {row.bearingType}s · every {row.intervalH}h
                  </span>
                </div>
                <span className={cn('bstat', status.cls)}>{status.label}</span>
              </div>

              {row.positions.map((position) => {
                const last = lastByMachinePosition.get(`${row.machineId}|${position}`);
                return (
                  <div key={position} className="brow">
                    <span>
                      {row.bearingType === 'bush' ? 'Bush' : 'Bearing'} {position}
                    </span>
                    <span className="bt">
                      {last ? `${last.temp ?? '--'}°C · ${ago(last.ts)}` : 'no reading'}
                    </span>
                  </div>
                );
              })}

              <Button
                variant={status.cls === 'due' || status.cls === 'miss' ? 'primary' : 'ghost'}
                className="bclose"
                onClick={() => open(row)}
              >
                Log temperatures
              </Button>
            </div>
          );
        })}
      </div>

      <BottomSheet
        open={Boolean(target)}
        title={
          target ? `${target.bearingType === 'bush' ? 'Bush' : 'Bearing'} temps — ${target.machine}` : ''
        }
        subtitle={
          target
            ? `${target.positions.length} ${target.bearingType}s · every ${target.intervalH} hours while running · ${
                target.lastAt ? `last ${ago(target.lastAt)}` : 'not logged yet'
              }`
            : undefined
        }
        led="radial-gradient(circle at 35% 30%,#9fe0ea,var(--elec))"
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Log temperatures
            </Button>
          </>
        }
      >
        {target && (
          <>
            {target.positions.map((position) => {
              const last = lastByMachinePosition.get(`${target.machineId}|${position}`);
              return (
                <TextField
                  key={position}
                  label={`${target.bearingType === 'bush' ? 'Bush' : 'Bearing'} ${position}`}
                  note={last ? `— last ${last.temp}°C, ${ago(last.ts)}` : undefined}
                  type="number"
                  inputMode="decimal"
                  suffix="°C"
                  placeholder="temperature"
                  value={temps[position] ?? ''}
                  onChange={(e) => setTemps({ ...temps, [position]: e.target.value })}
                />
              );
            })}
            <Readout label="Supervisor" value={supervisor || '—'} />
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default BearingPage;
