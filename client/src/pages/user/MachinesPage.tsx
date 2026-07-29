import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchMachines } from '@/features/machines/machinesSlice';
import {
  fetchActiveRuns,
  fetchShiftRuns,
  pauseRun,
  startRun,
  stopRun,
} from '@/features/machines/runsSlice';
import {
  cancelDown,
  fetchBearingsDue,
  fetchOpenBreakdowns,
  logBearings,
  logRepair,
  markDown,
} from '@/features/maintenance/maintenanceSlice';
import { setSupervisor } from '@/features/ui/uiSlice';
import { MachineCard } from '@/features/machines/MachineCard';
import {
  BottomSheet,
  Button,
  EmptyState,
  PageLoader,
  Pick,
  PickGrid,
  Readout,
  SelectField,
  SheetLabel,
  TextAreaField,
  TextField,
  ViewHead,
} from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { QUALITIES, SUPERVISORS } from '@/config/constants';
import { currentShift, todayISO } from '@/utils/date';
import { ago, elapsed } from '@/utils/format';
import type { BearingDue, MaintenanceLog, Machine, Quality, Run } from '@/types/models';

type Sheet =
  | { kind: 'start'; machine: Machine }
  | { kind: 'stop'; run: Run }
  | { kind: 'breakdown'; machine: Machine }
  | { kind: 'repair'; log: MaintenanceLog }
  | { kind: 'bearing'; machine: Machine; due: BearingDue }
  | { kind: 'supervisor' }
  | null;

const blankRepair = { rootCause: '', resolution: '', prevention: '' };

/** Landing tab: every machine grouped by line, with the whole run lifecycle. */
export function MachinesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { groups, loading } = useAppSelector((s) => s.machines);
  const active = useAppSelector((s) => s.runs.active);
  const shiftRuns = useAppSelector((s) => s.runs.shift);
  const openDown = useAppSelector((s) => s.maintenance.open);
  const due = useAppSelector((s) => s.maintenance.due);
  const supervisor = useAppSelector((s) => s.ui.supervisor);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [quality, setQuality] = useState<Quality>('Special');
  const [batchNo, setBatchNo] = useState('');
  const [outWeight, setOutWeight] = useState('');
  const [downTime, setDownTime] = useState('');
  const [repair, setRepair] = useState(blankRepair);
  const [temps, setTemps] = useState<Record<string, string>>({});
  const [pickedSupervisor, setPickedSupervisor] = useState(supervisor);

  useEffect(() => {
    void dispatch(fetchMachines());
    void dispatch(fetchActiveRuns());
    void dispatch(fetchOpenBreakdowns());
    void dispatch(fetchBearingsDue());
    // Feeds the "last run" line under an idle machine.
    void dispatch(fetchShiftRuns(undefined));
  }, [dispatch]);

  const runByMachine = useMemo(() => new Map(active.map((r) => [r.machine_id, r])), [active]);
  const downByMachine = useMemo(() => new Map(openDown.map((l) => [l.machine_id, l])), [openDown]);
  const dueByMachine = useMemo(() => new Map(due.map((d) => [d.machineId, d])), [due]);
  const lastByMachine = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of shiftRuns) if (run.ended_at && !map.has(run.machine_id)) map.set(run.machine_id, run);
    return map;
  }, [shiftRuns]);

  const dueNow = due.filter((d) => d.due);
  const closeSheet = () => setSheet(null);

  /** Every write goes through here so a failure always says so out loud. */
  const run = async (action: Promise<{ meta: { requestStatus: string } }>, okMsg: string, errMsg: string) => {
    const result = await action;
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? okMsg : errMsg, okay ? 'ok' : 'err');
    if (okay) closeSheet();
    return okay;
  };

  const confirmStart = async () => {
    if (sheet?.kind !== 'start') return;
    const machine = sheet.machine;
    await run(
      dispatch(
        startRun({
          machineId: machine.id,
          quality: machine.needs_quality ? quality : null,
          batchNo: batchNo.trim() || null,
          shiftDate: todayISO(),
          shift: currentShift(),
          supervisor: supervisor || null,
        }),
      ),
      `${machine.name} started`,
      'Could not start the run',
    );
    setBatchNo('');
  };

  const confirmStop = async () => {
    if (sheet?.kind !== 'stop') return;
    const weight = outWeight.trim() ? Number(outWeight) : null;
    if (weight != null && (Number.isNaN(weight) || weight < 0)) {
      notify('Enter a valid weight in kg', 'warn');
      return;
    }
    await run(dispatch(stopRun({ id: sheet.run.id, outWeight: weight })), 'Run stopped', 'Could not stop the run');
    setOutWeight('');
  };

  const confirmBreakdown = async () => {
    if (sheet?.kind !== 'breakdown') return;
    // A blank time means "it just happened"; a time is read as today's clock,
    // rolled back a day if that would put the breakdown in the future.
    let downStart: string | undefined;
    if (downTime) {
      const at = new Date(`${todayISO()}T${downTime}`);
      if (!Number.isNaN(at.getTime())) {
        if (at.getTime() > Date.now()) at.setDate(at.getDate() - 1);
        downStart = at.toISOString();
      }
    }
    await run(
      dispatch(markDown({ machineId: sheet.machine.id, machine: sheet.machine.name, downStart })),
      `${sheet.machine.short ?? sheet.machine.name} marked DOWN`,
      'Could not mark the machine down',
    );
    setDownTime('');
  };

  const confirmRepair = async () => {
    if (sheet?.kind !== 'repair') return;
    if (!repair.rootCause.trim() || !repair.resolution.trim() || !repair.prevention.trim()) {
      notify('Fill in all three questions', 'warn');
      return;
    }
    const okay = await run(
      dispatch(logRepair({ id: sheet.log.id, ...repair })),
      'Back online · logged',
      'Could not log the repair',
    );
    if (okay) setRepair(blankRepair);
  };

  const confirmCancelDown = async () => {
    if (sheet?.kind !== 'repair') return;
    await run(
      dispatch(cancelDown(sheet.log.id)),
      'Breakdown cancelled — nothing logged',
      'Could not cancel the breakdown',
    );
  };

  const confirmBearing = async () => {
    if (sheet?.kind !== 'bearing') return;
    const readings = sheet.due.positions
      .map((position) => ({ position, tempC: Number(temps[position]) }))
      .filter((r) => temps[r.position]?.trim());
    if (!readings.length) {
      notify('Enter at least one temperature', 'warn');
      return;
    }
    if (readings.some((r) => Number.isNaN(r.tempC) || r.tempC <= 0)) {
      notify('Temperatures must be above zero', 'warn');
      return;
    }
    const okay = await run(
      dispatch(
        logBearings({
          machineId: sheet.machine.id,
          machine: sheet.machine.name,
          kind: sheet.due.bearingType,
          readings,
          supervisor: supervisor || null,
          shiftDate: todayISO(),
          shift: currentShift(),
        }),
      ),
      `${sheet.machine.short ?? sheet.machine.name} ${sheet.due.bearingType} temps logged`,
      'Could not log the temperatures',
    );
    if (okay) setTemps({});
  };

  if (loading && !Object.keys(groups).length) return <PageLoader label="Loading machines" />;

  if (!Object.keys(groups).length) {
    return (
      <EmptyState
        title="No machines configured"
        hint="Add machines from the admin side to see them here."
      />
    );
  }

  return (
    <>
      <ViewHead
        title="Machines"
        meta={
          <button type="button" className="shiftchip" onClick={() => setSheet({ kind: 'supervisor' })}>
            {supervisor ? <b>{supervisor}</b> : <span style={{ color: 'var(--amber)' }}>set supervisor</span>}
            <span style={{ opacity: 0.6 }}>▾</span>
          </button>
        }
      />

      {dueNow.length > 0 && (
        <button
          type="button"
          className="duebar"
          onClick={() => {
            const first = dueNow[0];
            const machine = Object.values(groups)
              .flat()
              .find((m) => m.id === first?.machineId);
            if (machine && first) {
              setTemps({});
              setSheet({ kind: 'bearing', machine, due: first });
            }
          }}
        >
          {dueNow.length} machine{dueNow.length > 1 ? 's' : ''} due for bearing temp logging —{' '}
          {dueNow.map((d) => d.machine ?? d.machineId).join(', ')} · tap to log
        </button>
      )}

      {Object.entries(groups).map(([group, machines]) => {
        const runningHere = machines.filter((m) => runByMachine.has(m.id)).length;
        return (
          <section key={group}>
            <div className="msec">
              <b>{group}</b>
              <div className="ln" />
              {runningHere > 0 && <span className="ct">{runningHere} running</span>}
            </div>
            <div className="mlist">
              {machines.map((machine) => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  run={runByMachine.get(machine.id)}
                  down={downByMachine.get(machine.id)}
                  last={lastByMachine.get(machine.id)}
                  bearing={dueByMachine.get(machine.id)}
                  onStart={(m) => {
                    setQuality('Special');
                    setSheet({ kind: 'start', machine: m });
                  }}
                  onStop={(r) => {
                    setOutWeight('');
                    setSheet({ kind: 'stop', run: r });
                  }}
                  onPause={(r, paused) => {
                    void dispatch(pauseRun({ id: r.id, paused })).then((result) =>
                      notify(
                        result.meta.requestStatus === 'fulfilled'
                          ? paused
                            ? 'Run paused'
                            : 'Run resumed'
                          : 'Could not update the run',
                        result.meta.requestStatus === 'fulfilled' ? 'ok' : 'err',
                      ),
                    );
                  }}
                  onBreakdown={(m) => setSheet({ kind: 'breakdown', machine: m })}
                  onRepair={(log) => {
                    setRepair(blankRepair);
                    setSheet({ kind: 'repair', log });
                  }}
                  onBearing={(m) => {
                    const d = dueByMachine.get(m.id);
                    if (d) {
                      setTemps({});
                      setSheet({ kind: 'bearing', machine: m, due: d });
                    }
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* ---- start a run ---- */}
      <BottomSheet
        open={sheet?.kind === 'start'}
        title={sheet?.kind === 'start' ? sheet.machine.name : ''}
        subtitle={
          sheet?.kind === 'start'
            ? `${todayISO()} · ${currentShift()} shift${supervisor ? ` · ${supervisor}` : ''}`
            : undefined
        }
        led="radial-gradient(circle at 35% 30%,#c8f0a0,var(--amber))"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmStart}>
              {sheet?.kind === 'start' && sheet.machine.kind === 'autoclave' ? 'Load' : 'Start run'}
            </Button>
          </>
        }
      >
        {sheet?.kind === 'start' && (
          <>
            {sheet.machine.needs_quality && (
              <>
                <SheetLabel>Quality</SheetLabel>
                <PickGrid>
                  {QUALITIES.map((q) => (
                    <Pick key={q} tone="q" title={q} selected={quality === q} onClick={() => setQuality(q)} />
                  ))}
                </PickGrid>
              </>
            )}
            <TextField
              label="Batch"
              note="— optional"
              placeholder="e.g. B-104"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              fieldClassName="mt-4"
            />
          </>
        )}
      </BottomSheet>

      {/* ---- stop a run ---- */}
      <BottomSheet
        open={sheet?.kind === 'stop'}
        title={sheet?.kind === 'stop' ? `Stop ${sheet.run.machine ?? sheet.run.machine_id}` : ''}
        subtitle={
          sheet?.kind === 'stop'
            ? `Running ${elapsed(sheet.run.started_at)}${sheet.run.batch_no ? ` · ${sheet.run.batch_no}` : ''}`
            : undefined
        }
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              Keep running
            </Button>
            <Button variant="primary" onClick={confirmStop}>
              Stop run
            </Button>
          </>
        }
      >
        {sheet?.kind === 'stop' && (
          <TextField
            label="Out-weight"
            note="— blank sends it to the Weigh tab"
            inputMode="decimal"
            suffix="kg"
            value={outWeight}
            onChange={(e) => setOutWeight(e.target.value.replace(/[^\d.]/g, ''))}
          />
        )}
      </BottomSheet>

      {/* ---- report a breakdown ---- */}
      <BottomSheet
        open={sheet?.kind === 'breakdown'}
        title={sheet?.kind === 'breakdown' ? `Report breakdown — ${sheet.machine.name}?` : ''}
        subtitle="The machine is flagged DOWN in red and cannot be started until the repair is logged. Down-time counts from the time below."
        led="var(--err)"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmBreakdown}>
              Mark down
            </Button>
          </>
        }
      >
        <TextField
          label="Breakdown time"
          note="— leave blank for now"
          type="time"
          value={downTime}
          onChange={(e) => setDownTime(e.target.value)}
        />
      </BottomSheet>

      {/* ---- log the repair ---- */}
      <BottomSheet
        open={sheet?.kind === 'repair'}
        title={sheet?.kind === 'repair' ? `Log repair — ${sheet.log.machine ?? sheet.log.machine_id}` : ''}
        subtitle={
          sheet?.kind === 'repair' && sheet.log.down_start
            ? `Down for ${elapsed(sheet.log.down_start)}. Complete the log to bring it back online.`
            : undefined
        }
        led="var(--err)"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmRepair}>
              Mark repaired
            </Button>
          </>
        }
      >
        <TextAreaField
          label="1 · Root cause of the breakdown"
          rows={2}
          placeholder="What actually caused it?"
          value={repair.rootCause}
          onChange={(e) => setRepair({ ...repair, rootCause: e.target.value })}
        />
        <TextAreaField
          label="2 · How was the issue resolved?"
          rows={2}
          placeholder="What was done to fix it?"
          value={repair.resolution}
          onChange={(e) => setRepair({ ...repair, resolution: e.target.value })}
        />
        <TextAreaField
          label="3 · Steps so it never persists"
          rows={2}
          placeholder="Preventive action / checks added"
          value={repair.prevention}
          onChange={(e) => setRepair({ ...repair, prevention: e.target.value })}
        />
        <Button variant="danger" size="lg" className="mt-2" onClick={confirmCancelDown}>
          Cancel this breakdown (entered by mistake)
        </Button>
      </BottomSheet>

      {/* ---- bearing / bush temperatures ---- */}
      <BottomSheet
        open={sheet?.kind === 'bearing'}
        title={
          sheet?.kind === 'bearing'
            ? `${sheet.due.bearingType === 'bush' ? 'Bush' : 'Bearing'} temps — ${sheet.machine.name}`
            : ''
        }
        subtitle={
          sheet?.kind === 'bearing'
            ? `${sheet.due.positions.length} ${sheet.due.bearingType}s · log every ${sheet.due.intervalH} hours while running · ${
                sheet.due.lastAt ? `last ${ago(sheet.due.lastAt)}` : 'not logged yet'
              }`
            : undefined
        }
        led="radial-gradient(circle at 35% 30%,#9fe0ea,var(--elec))"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmBearing}>
              Log temperatures
            </Button>
          </>
        }
      >
        {sheet?.kind === 'bearing' && (
          <>
            {sheet.due.due && (
              <div className="hint" style={{ color: 'var(--amber)' }}>
                ⚠ Overdue — log now.
              </div>
            )}
            {sheet.due.positions.map((position) => (
              <TextField
                key={position}
                label={`${sheet.due.bearingType === 'bush' ? 'Bush' : 'Bearing'} ${position}`}
                type="number"
                inputMode="decimal"
                suffix="°C"
                placeholder="temperature"
                value={temps[position] ?? ''}
                onChange={(e) => setTemps({ ...temps, [position]: e.target.value })}
              />
            ))}
            <Readout label="Supervisor" value={supervisor || '—'} />
          </>
        )}
      </BottomSheet>

      {/* ---- who is on duty ---- */}
      <BottomSheet
        open={sheet?.kind === 'supervisor'}
        title="Supervisor in charge"
        subtitle="Tagged on everything logged from this device."
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                dispatch(setSupervisor(pickedSupervisor));
                notify(pickedSupervisor ? `Supervisor · ${pickedSupervisor}` : 'Supervisor cleared');
                closeSheet();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <SelectField
          label="Supervisor"
          value={pickedSupervisor}
          onChange={(e) => setPickedSupervisor(e.target.value)}
        >
          <option value="">— select —</option>
          {SUPERVISORS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
      </BottomSheet>
    </>
  );
}

export default MachinesPage;
