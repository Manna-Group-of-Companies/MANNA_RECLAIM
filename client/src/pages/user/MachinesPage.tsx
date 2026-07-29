import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchMachines } from '@/features/machines/machinesSlice';
import {
  cancelRun,
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
import { createBatch, fetchOpenBatches } from '@/features/batches/batchesSlice';
import { setSupervisor } from '@/features/ui/uiSlice';
import { MachineCard } from '@/features/machines/MachineCard';
import {
  BottomSheet,
  Button,
  EmptyState,
  FieldRow,
  QualityChip,
  FormWarning,
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
import { cn } from '@/utils/cn';
import {
  FIREWOOD_KG_PER_COARSE_LOAD,
  FIREWOOD_KG_PER_LOAD,
  QUALITIES,
  SHIFTS,
  SHIFT_HOURS,
  SUPERVISORS,
  TOD_MACHINE_ID,
  TYRES,
  autoclaveFormsFor,
  autoclaveWorkers,
  defaultWorkers,
  type AutoclaveForm,
  type TyreType,
} from '@/config/constants';
import { atLocal, clock24, currentShift, dayMonth, shiftForTime, todayISO } from '@/utils/date';
import { ago, elapsed } from '@/utils/format';
import type { BearingDue, MaintenanceLog, Machine, Quality, Run, Shift } from '@/types/models';

/** The line a run is on, for the machines that can be put on either. */
type Line = 'coarse' | 'special';

type Sheet =
  | { kind: 'line'; machine: Machine }
  | { kind: 'start'; machine: Machine; line: Line | null }
  | { kind: 'stop'; run: Run }
  | { kind: 'cancelLoad'; run: Run }
  | { kind: 'breakdown'; machine: Machine }
  | { kind: 'repair'; log: MaintenanceLog }
  | { kind: 'bearing'; machine: Machine; due: BearingDue }
  | { kind: 'supervisor' }
  | null;

const blankRepair = { rootCause: '', resolution: '', prevention: '' };

/**
 * The refiner line - pre-refiners included, as REFINER_IDS has them. These are
 * the machines whose electricity and hour meters the crew reads off the machine
 * at the start of a run, so their start sheet asks for the whole shift context
 * rather than assuming today's date and the clock's shift.
 */
const isRefiner = (machine: Machine) =>
  machine.kind === 'refiner' || machine.kind === 'prerefiner';

/**
 * The grinding and coarse lines run by the shift rather than by the batch: a
 * machine is started for a shift, and what comes off it is weighed afterwards.
 */
const isShiftwise = (kind?: string | null) => kind === 'grind' || kind === 'coarse';

/**
 * PR1 and Refiner 2 live on the coarse line, but either can be turned onto the
 * special line to refine a batch instead. Which one it is running decides the
 * whole sheet - a shift and its meters, or a batch and its meters - so they ask
 * before anything else rather than assuming the coarse line every time.
 */
const isDualLine = (machine: Machine) => machine.kind === 'coarse';

/**
 * The same question asked of a run already on record. A run carries the line it
 * was started on, so a coarse-line machine's special pass reads back as one.
 */
const lineIsShiftwise = (line?: string | null) => line === 'grind' || line === 'coarse';

/**
 * Every machine but the autoclaves is metered, so its sheets ask for the two
 * readings either side of the run. The autoclaves burn firewood and are timed
 * by their load instead.
 */
const hasMeters = (kind?: string | null) => Boolean(kind) && kind !== 'autoclave';

/** A typed number field: blank reads as "not entered", not as zero. */
const asNumber = (value: string) => {
  const text = value.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
};

const blankStop = { workers: '', elecEnd: '', elecDiff: '', hourEnd: '', hourDiff: '' };

/**
 * The autoclave load sheet. The two dates are deliberately separate: a night
 * shift that runs past midnight keeps the date it started on, while the load
 * itself happened on whatever day the clock says - so a charge put in at 01:00
 * belongs to the previous day's night shift but loaded today. Both start blank
 * rather than on today, because prefilling would quietly get the night shift
 * wrong every time.
 */
const blankLoad = { paired: true, shiftDate: '', loadDate: '', loadTime: '' };

/** The autoclave unload sheet - firewood burned, and when it was discharged. */
const blankUnload = { firewood: '', dischargeDate: '', unloadTime: '' };

/** Why Soorya's readings are not kWh, on both of its sheets. */
const TOD_NOTE = (
  <>
    Soorya has no direct energy meter — this is the <b>TOD meter</b> (one phase); energy is recorded as
    the difference × 3.
  </>
);

/** Landing tab: every machine grouped by line, with the whole run lifecycle. */
export function MachinesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { groups, loading } = useAppSelector((s) => s.machines);
  const active = useAppSelector((s) => s.runs.active);
  const shiftRuns = useAppSelector((s) => s.runs.shift);
  const openDown = useAppSelector((s) => s.maintenance.open);
  const due = useAppSelector((s) => s.maintenance.due);
  const openBatches = useAppSelector((s) => s.batches.items);
  const supervisor = useAppSelector((s) => s.ui.supervisor);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [quality, setQuality] = useState<Quality>('Special');
  const [batchNo, setBatchNo] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [startShift, setStartShift] = useState<Shift>(currentShift());
  const [elecStart, setElecStart] = useState('');
  const [hourStart, setHourStart] = useState('');
  /** Special line only: the rare pass that yields nothing to weigh. */
  const [nonProd, setNonProd] = useState(false);
  const [tyre, setTyre] = useState<TyreType | null>(null);
  const [outWeight, setOutWeight] = useState('');
  const [stop, setStop] = useState(blankStop);
  /** Autoclave only: what it is being charged with, and when. */
  const [form, setForm] = useState<AutoclaveForm | null>(null);
  const [load, setLoad] = useState(blankLoad);
  const [unload, setUnload] = useState(blankUnload);
  const [downTime, setDownTime] = useState('');
  const [repair, setRepair] = useState(blankRepair);
  const [temps, setTemps] = useState<Record<string, string>>({});
  const [pickedSupervisor, setPickedSupervisor] = useState(supervisor);

  useEffect(() => {
    void dispatch(fetchMachines());
    void dispatch(fetchActiveRuns());
    void dispatch(fetchOpenBreakdowns());
    void dispatch(fetchBearingsDue());
    // Feeds the "last run" line under an idle machine, and the meter readings
    // the refiner start sheet pre-fills from.
    void dispatch(fetchShiftRuns(undefined));
    // The batches the refiners can be pointed at.
    void dispatch(fetchOpenBatches());
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

  // The run this machine last finished, for the "last end" note beside each
  // meter field.
  const previousRun = sheet?.kind === 'start' ? lastByMachine.get(sheet.machine.id) : undefined;

  const machineById = useMemo(
    () => new Map(Object.values(groups).flat().map((m) => [m.id, m])),
    [groups],
  );

  // ---- the machine being started ----
  const startMachine = sheet?.kind === 'start' ? sheet.machine : undefined;
  // Set only for a machine that was asked which line it is on; every other
  // machine has one line and reads it off its kind.
  const startLine = sheet?.kind === 'start' ? sheet.line : null;
  const startHasMeters = hasMeters(startMachine?.kind);
  const startShiftwise = startLine ? startLine === 'coarse' : isShiftwise(startMachine?.kind);
  const startSpecial = startLine === 'special';
  const startIsTod = startMachine?.id === TOD_MACHINE_ID;
  /** The sheets that pick a batch off the open list rather than only typing one. */
  const startPicksBatch = Boolean(startMachine && (isRefiner(startMachine) || startSpecial));

  // ---- the autoclave being charged ----
  const startIsAutoclave = startMachine?.kind === 'autoclave';
  /** What fits this vessel. A machine with one option has it picked already. */
  const forms = useMemo(
    () => (startIsAutoclave ? autoclaveFormsFor(startMachine?.capacity) : []),
    [startIsAutoclave, startMachine?.capacity],
  );
  /** A coarse charge feeds the line for a shift; a special one opens a batch. */
  const loadIsCoarse = form?.type === 'coarse';
  /** The loading time decides the shift, not the clock the sheet was opened at. */
  const loadShift = shiftForTime(load.loadTime);

  // ---- the run being stopped, and what its sheet has to ask for ----
  const stopping = sheet?.kind === 'stop' ? sheet.run : undefined;
  const stopMachine = stopping ? machineById.get(stopping.machine_id) : undefined;
  const stopKind = stopMachine?.kind ?? stopping?.kind;
  const stopsWithMeters = Boolean(stopping) && hasMeters(stopKind);
  /** An autoclave is discharged rather than stopped: firewood, not meters. */
  const stopIsAutoclave = Boolean(stopping) && stopKind === 'autoclave';
  // The line the run was started on has the last word: a coarse-line machine
  // put on the special line for a batch is not a shiftwise run.
  const stopShiftwise = stopping?.line ? lineIsShiftwise(stopping.line) : isShiftwise(stopKind);
  const stopIsTod = stopping?.machine_id === TOD_MACHINE_ID;
  // A machine that weighs at the sheet asks for the figure here; one weighed
  // shiftwise is told where the figure gets entered instead.
  const stopWeighs = stopMachine ? Boolean(stopMachine.weigh) && !stopShiftwise : Boolean(stopping?.needs_weigh);
  const stopWeighedLater = Boolean(stopMachine?.out_weight) && stopShiftwise;

  const round2 = (value: number) => Math.round(value * 100) / 100;
  const elecEndValue = asNumber(stop.elecEnd);
  const hourEndValue = asNumber(stop.hourEnd);
  const weightValue = asNumber(outWeight);
  const elecDelta =
    elecEndValue != null && stopping?.elec_start != null
      ? round2(elecEndValue - Number(stopping.elec_start))
      : null;
  const hourDelta =
    hourEndValue != null && stopping?.hour_start != null
      ? round2(hourEndValue - Number(stopping.hour_start))
      : null;

  /**
   * A meter can never read lower at the end than it did at the start, and
   * anything that should be a quantity - energy, hours, weight - cannot be zero
   * or negative. Checked as the crew types, so the problem shows up before they
   * commit the run rather than after.
   */
  const stopIssues: string[] = [];
  if (stopsWithMeters && stopping) {
    const elecStart = stopping.elec_start != null ? Number(stopping.elec_start) : null;
    if (elecEndValue != null) {
      if (elecEndValue <= 0) stopIssues.push('Electricity: the final reading must be greater than zero.');
      else if (elecStart != null && elecEndValue < elecStart) {
        stopIssues.push(
          `Electricity: final reading (${elecEndValue}) is below the start (${elecStart}) — a meter cannot run backwards.`,
        );
      } else if (elecStart != null && elecEndValue === elecStart) {
        stopIssues.push('Electricity: the reading has not moved, so energy used would be zero.');
      }
    }
    const hourStartValue = stopping.hour_start != null ? Number(stopping.hour_start) : null;
    if (hourEndValue != null) {
      if (hourEndValue <= 0) stopIssues.push('Hour-meter: the stop reading must be greater than zero.');
      else if (hourStartValue != null && hourEndValue < hourStartValue) {
        stopIssues.push(
          `Hour-meter: stop reading (${hourEndValue}) is below the start (${hourStartValue}) — it cannot go backwards.`,
        );
      } else if (hourStartValue != null && hourEndValue === hourStartValue) {
        stopIssues.push('Hour-meter: the reading has not moved, so run time would be zero.');
      }
    }
  }
  if (weightValue != null && weightValue <= 0) {
    stopIssues.push('Output weight: must be greater than zero (leave it blank to weigh later).');
  }

  /** Every write goes through here so a failure always says so out loud. */
  const run = async (action: Promise<{ meta: { requestStatus: string } }>, okMsg: string, errMsg: string) => {
    const result = await action;
    const okay = result.meta.requestStatus === 'fulfilled';
    notify(okay ? okMsg : errMsg, okay ? 'ok' : 'err');
    if (okay) closeSheet();
    return okay;
  };

  /**
   * Charging an autoclave. A special load opens the batch the refiners will
   * work through, then starts the run against it; a coarse load only starts the
   * run, because coarse output is counted by the shift and never becomes a
   * batch. The run is not started if the batch could not be opened - a load
   * running against a batch that does not exist is worse than no load at all.
   */
  const confirmLoad = async () => {
    if (sheet?.kind !== 'start') return;
    const machine = sheet.machine;
    const ref = batchNo.trim();

    if (!form) {
      notify('Pick a formulation', 'warn');
      return;
    }
    if (!load.shiftDate) {
      notify(loadIsCoarse ? 'Pick a date' : 'Pick a shift date', 'warn');
      return;
    }
    if (!ref) {
      notify(loadIsCoarse ? 'Enter a coarse batch number' : 'Enter a batch number', 'warn');
      return;
    }
    if (openBatches.some((b) => b.ref.toLowerCase() === ref.toLowerCase())) {
      notify(`Batch ${ref} already exists`, 'warn');
      return;
    }

    // The load date is the day the charge actually went in, which is not always
    // the shift's date; with no date of its own it falls back to the shift's.
    const startedAt = atLocal(load.loadDate || load.shiftDate, load.loadTime) ?? undefined;

    if (!loadIsCoarse) {
      const opened = await dispatch(
        createBatch({
          machine_id: machine.id,
          ref,
          formulation: form.name,
          capacity: machine.capacity ?? form.capacity,
          paired: load.paired,
          shift_date: load.shiftDate,
        }),
      );
      if (opened.meta.requestStatus !== 'fulfilled') {
        notify('Could not open the batch', 'err');
        return;
      }
    }

    const okay = await run(
      dispatch(
        startRun({
          machineId: machine.id,
          // A coarse charge is shiftwise output; a special one is a batch, and
          // the server reads the line off the machine for it.
          line: loadIsCoarse ? 'coarse' : null,
          batchNo: ref,
          formulation: form.name,
          // The grade is settled at the refiner, not at the autoclave.
          quality: null,
          paired: load.paired,
          workers: autoclaveWorkers(load.paired),
          shiftDate: load.shiftDate,
          shift: loadShift,
          supervisor: supervisor || null,
          startedAt,
        }),
      ),
      `${machine.name} loaded · ${form.name} · ${ref}`,
      'Could not record the load',
    );
    if (okay) {
      setBatchNo('');
      setLoad(blankLoad);
      void dispatch(fetchOpenBatches());
    }
  };

  const confirmStart = async () => {
    if (sheet?.kind !== 'start') return;
    const machine = sheet.machine;
    if (machine.kind === 'autoclave') return confirmLoad();
    const metered = hasMeters(machine.kind);

    // A meter reading is optional, but a zero or negative one is a mis-key
    // rather than a meter that has never turned - the same rule the back office
    // applies when it turns the pair into kWh and hours.
    let elec: number | null = null;
    let hour: number | null = null;
    if (metered) {
      if (!startDate) {
        notify('Pick a date', 'warn');
        return;
      }
      if (elecStart.trim()) {
        elec = Number(elecStart);
        if (Number.isNaN(elec) || elec <= 0) {
          notify('Initial electricity reading must be greater than zero', 'warn');
          return;
        }
      }
      if (hourStart.trim()) {
        hour = Number(hourStart);
        if (Number.isNaN(hour) || hour <= 0) {
          notify('Initial hour-meter reading must be greater than zero', 'warn');
          return;
        }
      }
    }

    const line = sheet.line;
    const shiftwise = line ? line === 'coarse' : isShiftwise(machine.kind);
    const special = line === 'special';
    // Only when the batch was picked rather than typed - a typed number the
    // plant has no open batch for has nothing to copy off it.
    const picked = openBatches.find((b) => b.ref === batchNo.trim());

    await run(
      dispatch(
        startRun({
          machineId: machine.id,
          // Null lets the server derive the line from the machine's kind, which
          // is right for every machine that only ever runs one of them.
          line,
          // A machine with a grade of its own is told which one, and so is a
          // coarse-line machine turned onto the special line - its picker opens
          // on the batch's own grade, but the crew has the last word.
          quality: machine.needs_quality || special ? quality : null,
          // A shiftwise machine runs whatever the line feeds it, so it carries
          // no batch of its own.
          batchNo: shiftwise ? null : batchNo.trim() || null,
          formulation: shiftwise ? null : picked?.formulation ?? null,
          tyreType: machine.tyre ? tyre : null,
          mesh: machine.tyre && tyre ? TYRES[tyre].mesh : null,
          shiftDate: metered ? startDate : todayISO(),
          shift: metered ? startShift : currentShift(),
          supervisor: supervisor || null,
          elecStart: elec,
          hourStart: hour,
          nonProduction: special ? nonProd : undefined,
        }),
      ),
      `${machine.name} started${
        shiftwise
          ? ` · ${startShift}${tyre ? ` · ${TYRES[tyre].label}` : ''}`
          : special
            ? ` · special line${nonProd ? ' · non-production' : ''}`
            : ''
      }`,
      'Could not start the run',
    );
    setBatchNo('');
    setElecStart('');
    setHourStart('');
    setNonProd(false);
  };

  const confirmStop = async () => {
    if (sheet?.kind !== 'stop') return;
    if (stopIssues.length) {
      notify('Check the highlighted readings before logging', 'warn');
      return;
    }

    // Discharging an autoclave is dated by hand: the crew often logs a load
    // after the fact, and a charge pulled at 02:00 belongs to the day it was
    // pulled on. A time makes the instant exact; without one, a discharge dated
    // today is "now" and any earlier day is booked at midday.
    let stoppedAt: string | undefined;
    if (stopIsAutoclave) {
      if (!unload.dischargeDate) {
        notify('Pick the discharge date', 'warn');
        return;
      }
      stoppedAt =
        atLocal(unload.dischargeDate, unload.unloadTime) ??
        (unload.dischargeDate === todayISO()
          ? undefined
          : atLocal(unload.dischargeDate, '12:00') ?? undefined);
    }

    const okay = await run(
      dispatch(
        stopRun({
          id: sheet.run.id,
          stoppedAt,
          outWeight: stopIsAutoclave ? null : weightValue,
          workers: asNumber(stop.workers),
          firewoodKg: stopIsAutoclave ? asNumber(unload.firewood) : null,
          // The reading itself when there is one; the difference is what the
          // crew falls back to when only the units used are known.
          elecEnd: stopsWithMeters ? elecEndValue : null,
          hourEnd: stopsWithMeters ? hourEndValue : null,
          kwh: stopsWithMeters ? asNumber(stop.elecDiff) : null,
          hoursRun: stopsWithMeters ? asNumber(stop.hourDiff) : null,
        }),
      ),
      stopIsAutoclave ? 'Unloaded · logged' : 'Run logged',
      stopIsAutoclave ? 'Could not log the unload' : 'Could not stop the run',
    );
    if (okay) {
      setOutWeight('');
      setStop(blankStop);
      setUnload(blankUnload);
    }
  };

  const confirmCancelLoad = async () => {
    if (sheet?.kind !== 'cancelLoad') return;
    const label = sheet.run.machine ?? sheet.run.machine_id;
    await run(
      dispatch(cancelRun(sheet.run.id)),
      `${label} load cancelled — nothing logged`,
      'Could not cancel the load',
    );
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
                    setBatchNo('');
                    setStartDate(todayISO());
                    setStartShift(currentShift());
                    setNonProd(false);
                    setTyre(m.tyre ? ((m.def_tyre as TyreType) ?? 'truck') : null);
                    // A vessel that can only be charged one way has that
                    // formulation picked already; anything else is a decision.
                    const fits = m.kind === 'autoclave' ? autoclaveFormsFor(m.capacity) : [];
                    setForm(fits.length === 1 ? fits[0] ?? null : null);
                    setLoad(blankLoad);
                    // Both meters carry on from where the last run left them,
                    // so the crew only retypes a reading when it has moved.
                    const previous = lastByMachine.get(m.id);
                    setElecStart(previous?.elec_end != null ? String(previous.elec_end) : '');
                    setHourStart(previous?.hour_end != null ? String(previous.hour_end) : '');
                    // A machine that can be on either line asks which one first;
                    // the answer is what opens the start sheet.
                    setSheet(
                      isDualLine(m)
                        ? { kind: 'line', machine: m }
                        : { kind: 'start', machine: m, line: null },
                    );
                  }}
                  onStop={(r) => {
                    setOutWeight('');
                    const autoclave = machine.kind === 'autoclave';
                    const coarse = r.line ? lineIsShiftwise(r.line) : false;
                    // The crew this machine usually runs with, so the common
                    // case is a glance rather than a keystroke. An autoclave's
                    // crew follows the charge: shared with the twin, or not.
                    const usual = autoclave
                      ? autoclaveWorkers(Boolean(r.paired))
                      : defaultWorkers(
                          r.machine_id,
                          (r.shift as Shift) ?? currentShift(),
                          isShiftwise(machine.kind),
                        );
                    setStop({
                      ...blankStop,
                      workers: r.workers != null ? String(r.workers) : usual != null ? String(usual) : '',
                    });
                    // A load burns a known amount of firewood, so the figure is
                    // there to correct rather than to type.
                    setUnload({
                      ...blankUnload,
                      firewood: autoclave
                        ? String(coarse ? FIREWOOD_KG_PER_COARSE_LOAD : FIREWOOD_KG_PER_LOAD)
                        : '',
                    });
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

      {/* ---- which line a coarse-line machine is on this time ---- */}
      <BottomSheet
        open={sheet?.kind === 'line'}
        title={sheet?.kind === 'line' ? `Start ${sheet.machine.name}` : ''}
        subtitle={
          sheet?.kind === 'line'
            ? `Is ${sheet.machine.short ?? sheet.machine.name} running the coarse line or the special line this time?`
            : undefined
        }
        led="radial-gradient(circle at 35% 30%,#c8f0a0,var(--amber))"
        onClose={closeSheet}
        footer={
          <Button variant="ghost" onClick={closeSheet}>
            Cancel
          </Button>
        }
      >
        {sheet?.kind === 'line' && (
          <PickGrid>
            <Pick
              title="Coarse line"
              sub="default · shiftwise coarse output"
              onClick={() => setSheet({ kind: 'start', machine: sheet.machine, line: 'coarse' })}
            />
            <Pick
              title="Special line"
              sub="refine a batch · any quality"
              onClick={() => setSheet({ kind: 'start', machine: sheet.machine, line: 'special' })}
            />
          </PickGrid>
        )}
      </BottomSheet>

      {/* ---- start a run ---- */}
      <BottomSheet
        open={sheet?.kind === 'start'}
        title={
          sheet?.kind !== 'start'
            ? ''
            : sheet.machine.kind === 'autoclave'
              ? `Load ${sheet.machine.name}`
              : `Start ${sheet.machine.name}`
        }
        subtitle={
          sheet?.kind !== 'start'
            ? undefined
            : startIsAutoclave
              ? `${sheet.machine.capacity ?? '—'} kg · firewood entered at unload`
              : startShiftwise
              ? `${sheet.machine.kind === 'grind' ? 'Grinding line' : 'Coarse line'} — pick the shift it is running for. Units & crew at stop${
                  sheet.machine.out_weight ? '; output weighed shiftwise.' : '.'
                }`
              : startSpecial
                ? `Special line — the batch it is refining, its grade and both meter readings${supervisor ? ` · ${supervisor}` : ''}`
                : isRefiner(sheet.machine)
                  ? `Batch, grade and both meter readings${supervisor ? ` · ${supervisor}` : ''}`
                  : `${todayISO()} · ${currentShift()} shift${supervisor ? ` · ${supervisor}` : ''}`
        }
        led="radial-gradient(circle at 35% 30%,#c8f0a0,var(--amber))"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmStart}>
              {startIsAutoclave ? 'Load ▸' : 'Start ▸'}
            </Button>
          </>
        }
      >
        {sheet?.kind === 'start' && startIsAutoclave && (
          <>
            <SheetLabel>Formulation</SheetLabel>
            {forms.length ? (
              <PickGrid>
                {forms.map((f) => (
                  <Pick
                    key={f.name}
                    title={f.name}
                    sub={<QualityChip quality={f.grade ?? 'Coarse'} />}
                    selected={form?.name === f.name}
                    onClick={() => setForm(f)}
                  />
                ))}
              </PickGrid>
            ) : (
              <div className="hint">
                No formulation is set up for a {sheet.machine.capacity ?? '—'} kg vessel.
              </div>
            )}

            {/* Two hands charge both vessels between them, so a shared load
                costs one worker and a solo load costs two. */}
            <SheetLabel>Loaded</SheetLabel>
            <PickGrid>
              <Pick
                title="With another"
                sub="2 workers shared · 1 each"
                selected={load.paired}
                onClick={() => setLoad({ ...load, paired: true })}
              />
              <Pick
                title="Loaded alone"
                sub="2 workers"
                selected={!load.paired}
                onClick={() => setLoad({ ...load, paired: false })}
              />
            </PickGrid>

            <SheetLabel>{loadIsCoarse ? 'Coarse batch number' : 'Batch number'}</SheetLabel>
            <TextField
              inputMode="numeric"
              autoComplete="off"
              placeholder={loadIsCoarse ? 'e.g. C-2893' : 'e.g. 2893'}
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              fieldClassName="mb-0"
            />

            <SheetLabel>
              Shift date
              {!loadIsCoarse && (
                <span className="muted normal-case tracking-normal">
                  {' '}
                  — the night shift keeps its start date
                </span>
              )}
            </SheetLabel>
            <TextField
              type="date"
              value={load.shiftDate}
              onChange={(e) => setLoad({ ...load, shiftDate: e.target.value })}
              fieldClassName="mb-0"
            />

            <FieldRow className="mt-4">
              <TextField
                label="Loading date"
                note="— actual load day"
                type="date"
                value={load.loadDate}
                onChange={(e) => setLoad({ ...load, loadDate: e.target.value })}
              />
              <TextField
                label="Loading time"
                note="— blank = now"
                type="time"
                value={load.loadTime}
                onChange={(e) => setLoad({ ...load, loadTime: e.target.value })}
              />
            </FieldRow>
            <div className="hint -mt-1">
              Shift: <b>{loadShift}</b>{' '}
              <span className="muted normal-case tracking-normal">
                — taken from the loading time{load.loadTime ? '' : ', now'}. The shift date above can
                differ from the loading date.
              </span>
            </div>
          </>
        )}

        {sheet?.kind === 'start' && !startIsAutoclave && (
          <>
            {startPicksBatch && openBatches.length > 0 && (
              <>
                <SheetLabel>Batch</SheetLabel>
                <PickGrid>
                  {openBatches.map((b) => (
                    <Pick
                      key={b.id}
                      title={b.ref}
                      sub={b.formulation ?? undefined}
                      selected={batchNo === b.ref}
                      onClick={() => {
                        const next = batchNo === b.ref ? '' : b.ref;
                        setBatchNo(next);
                        // The grade the batch was opened for is the one it will
                        // come off at, so the picker starts there - the crew can
                        // still say otherwise before it starts.
                        if (next && startSpecial && b.grade) setQuality(b.grade);
                      }}
                    />
                  ))}
                </PickGrid>
              </>
            )}
            {(sheet.machine.needs_quality || startSpecial) && (
              <>
                <SheetLabel className={startPicksBatch ? 'mt-4' : undefined}>Quality</SheetLabel>
                <PickGrid>
                  {QUALITIES.map((q) => (
                    <Pick
                      key={q}
                      tone="q"
                      dot={`var(--q-${q.toLowerCase()})`}
                      title={q}
                      selected={quality === q}
                      onClick={() => setQuality(q)}
                    />
                  ))}
                </PickGrid>
              </>
            )}
            {!startShiftwise && (
              <TextField
                label="Batch"
                note={startPicksBatch ? '— or type it' : '— optional'}
                placeholder="e.g. B-104"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                fieldClassName="mt-4"
              />
            )}

            {/* A special-line pass that yields nothing to weigh is rare enough
                that it is said out loud rather than inferred at stop time. */}
            {startSpecial && (
              <>
                <SheetLabel>Run type</SheetLabel>
                <PickGrid>
                  <Pick
                    title="Production"
                    sub="default · weigh the output"
                    selected={!nonProd}
                    onClick={() => setNonProd(false)}
                  />
                  <Pick
                    title="Non-production"
                    sub="no weighing · rare"
                    selected={nonProd}
                    onClick={() => setNonProd(true)}
                  />
                </PickGrid>
              </>
            )}

            {startShiftwise ? (
              <>
                <SheetLabel>Date</SheetLabel>
                <TextField
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  fieldClassName="mb-0"
                />
                <SheetLabel>Shift</SheetLabel>
                <PickGrid>
                  {SHIFTS.map((s) => (
                    <Pick
                      key={s}
                      title={s}
                      sub={SHIFT_HOURS[s]}
                      selected={startShift === s}
                      onClick={() => setStartShift(s)}
                    />
                  ))}
                </PickGrid>
              </>
            ) : (
              startHasMeters && (
                <FieldRow>
                  <TextField
                    label="Date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <SelectField
                    label="Shift"
                    value={startShift}
                    onChange={(e) => setStartShift(e.target.value as Shift)}
                  >
                    {SHIFTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectField>
                </FieldRow>
              )
            )}

            {sheet.machine.tyre && (
              <>
                <SheetLabel className="mt-4">Tyre feedstock</SheetLabel>
                <PickGrid>
                  {(Object.keys(TYRES) as TyreType[]).map((t) => (
                    <Pick
                      key={t}
                      title={TYRES[t].label}
                      sub={`${TYRES[t].mesh} crumb`}
                      selected={tyre === t}
                      onClick={() => setTyre(t)}
                    />
                  ))}
                </PickGrid>
              </>
            )}

            {startHasMeters && (
              <>
                <TextField
                  label={startIsTod ? 'Initial TOD-meter reading' : 'Initial electricity reading'}
                  note={
                    previousRun?.elec_end != null
                      ? `— last end ${previousRun.elec_end}`
                      : '— meter units now'
                  }
                  type="number"
                  inputMode="decimal"
                  suffix="units"
                  placeholder="meter reading"
                  value={elecStart}
                  onChange={(e) => setElecStart(e.target.value)}
                  fieldClassName={startShiftwise || sheet.machine.tyre ? 'mt-4' : undefined}
                  hint={startIsTod ? TOD_NOTE : undefined}
                />
                <TextField
                  label="Hour-meter reading at start"
                  note={previousRun?.hour_end != null ? `— last end ${previousRun.hour_end}` : undefined}
                  type="number"
                  inputMode="decimal"
                  suffix="hrs"
                  placeholder="hour meter now"
                  value={hourStart}
                  onChange={(e) => setHourStart(e.target.value)}
                />
              </>
            )}
          </>
        )}
      </BottomSheet>

      {/* ---- stop a run ---- */}
      <BottomSheet
        open={sheet?.kind === 'stop'}
        title={
          !stopping
            ? ''
            : stopIsAutoclave
              ? `Unload Autoclave${stopShiftwise ? ' · Coarse' : ''}`
              : `Stop ${stopping.machine ?? stopping.machine_id}`
        }
        subtitle={
          !stopping
            ? undefined
            : stopIsAutoclave
              ? [stopping.batch_no, stopping.formulation, stopping.quality].filter(Boolean).join(' · ')
              : stopShiftwise
              ? // A shift, not a batch: which shift it ran for, and on what.
                [
                  `${stopping.shift ?? ''} ${dayMonth(stopping.shift_date)}`.trim(),
                  stopping.tyre_type && TYRES[stopping.tyre_type as TyreType]
                    ? `${TYRES[stopping.tyre_type as TyreType].label} ${TYRES[stopping.tyre_type as TyreType].mesh}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : stopsWithMeters
                ? [stopping.batch_no, stopping.formulation, stopping.quality].filter(Boolean).join(' · ') ||
                  `Running ${elapsed(stopping.started_at)}`
                : `Running ${elapsed(stopping.started_at)}${stopping.batch_no ? ` · ${stopping.batch_no}` : ''}`
        }
        led="radial-gradient(circle at 35% 30%,#c8f0a0,var(--amber))"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              {stopIsAutoclave ? 'Cancel' : 'Keep running'}
            </Button>
            <Button variant="primary" onClick={confirmStop} disabled={stopIssues.length > 0}>
              {stopIsAutoclave ? 'Log & unload' : stopsWithMeters ? 'Log run' : 'Stop run'}
            </Button>
          </>
        }
      >
        {stopping && (
          <>
            {/* An autoclave has no meters: what it burned, who charged it, and
                when it was pulled. */}
            {stopIsAutoclave && (
              <>
                <FieldRow>
                  <TextField
                    label="Firewood"
                    type="number"
                    inputMode="decimal"
                    suffix="kg"
                    value={unload.firewood}
                    onChange={(e) => setUnload({ ...unload, firewood: e.target.value })}
                  />
                  <TextField
                    label="Workers"
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={stop.workers}
                    onChange={(e) => setStop({ ...stop, workers: e.target.value })}
                  />
                </FieldRow>
                <TextField
                  label="Discharge date"
                  note={`— loaded ${dayMonth(stopping.shift_date)}`}
                  type="date"
                  value={unload.dischargeDate}
                  onChange={(e) => setUnload({ ...unload, dischargeDate: e.target.value })}
                />
                <TextField
                  label="Unloading time"
                  note={`— loaded ${clock24(stopping.started_at)}; blank = now`}
                  type="time"
                  value={unload.unloadTime}
                  onChange={(e) => setUnload({ ...unload, unloadTime: e.target.value })}
                />
              </>
            )}

            {stopsWithMeters && (
              <FieldRow>
                <TextField
                  label={stopIsTod ? 'Final TOD-meter reading' : 'Final electricity reading'}
                  note={stopping.elec_start != null ? `— started at ${stopping.elec_start}` : undefined}
                  type="number"
                  inputMode="decimal"
                  suffix="units"
                  placeholder="meter reading now"
                  value={stop.elecEnd}
                  onChange={(e) => setStop({ ...stop, elecEnd: e.target.value })}
                  hint={
                    elecDelta != null ? (
                      <span className={cn('diffout show', elecDelta < 0 && 'bad')}>
                        Consumed: <b>{elecEndValue}</b> − {stopping.elec_start} = <b>{elecDelta}</b> units
                        {stopIsTod && elecDelta >= 0 && (
                          <>
                            {' '}
                            × 3 = <b>{Math.round(elecDelta * 3 * 100) / 100}</b> kWh
                          </>
                        )}
                      </span>
                    ) : undefined
                  }
                />
                <TextField
                  label="Workers"
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={stop.workers}
                  onChange={(e) => setStop({ ...stop, workers: e.target.value })}
                />
              </FieldRow>
            )}
            {stopsWithMeters && (
              <TextField
                label="…or enter the difference directly"
                note="— when only the used units are known"
                type="number"
                inputMode="decimal"
                suffix="units"
                placeholder="units used"
                value={stop.elecDiff}
                onChange={(e) => setStop({ ...stop, elecDiff: e.target.value })}
                hint={stopIsTod ? TOD_NOTE : undefined}
              />
            )}

            {/* Nothing comes off an autoclave to weigh - the batch is weighed
                once the refiners have worked through it. */}
            {!stopIsAutoclave && (!stopsWithMeters || stopWeighs) && (
              <TextField
                label="Output weight"
                note={stopWeighs ? '— optional, or weigh later' : '— blank sends it to the Weigh tab'}
                inputMode="decimal"
                suffix="kg"
                placeholder="leave blank to weigh later"
                value={outWeight}
                onChange={(e) => setOutWeight(e.target.value.replace(/[^\d.]/g, ''))}
              />
            )}

            {stopsWithMeters && (
              <>
                <TextField
                  label="Hour-meter reading at stop"
                  note={stopping.hour_start != null ? `— started at ${stopping.hour_start}` : undefined}
                  type="number"
                  inputMode="decimal"
                  suffix="hrs"
                  placeholder="hour meter now"
                  value={stop.hourEnd}
                  onChange={(e) => setStop({ ...stop, hourEnd: e.target.value })}
                  hint={
                    hourDelta != null ? (
                      <span className={cn('diffout show', hourDelta < 0 && 'bad')}>
                        Run: <b>{hourEndValue}</b> − {stopping.hour_start} = <b>{hourDelta}</b> hrs
                      </span>
                    ) : undefined
                  }
                />
                <TextField
                  label="…or enter the hours run directly"
                  note="— when only the difference is known"
                  type="number"
                  inputMode="decimal"
                  suffix="hrs"
                  placeholder="hours run"
                  value={stop.hourDiff}
                  onChange={(e) => setStop({ ...stop, hourDiff: e.target.value })}
                />
              </>
            )}

            {stopWeighedLater && (
              <div className="hint">Output is weighed shiftwise in the Weigh tab after stopping.</div>
            )}

            <FormWarning>
              {stopIssues.length ? (
                <>
                  {stopIssues.map((issue) => (
                    <div key={issue}>{issue}</div>
                  ))}
                </>
              ) : null}
            </FormWarning>

            {(stopsWithMeters || stopIsAutoclave) && (
              <Button
                variant="danger"
                size="lg"
                className="mt-2"
                onClick={() => setSheet({ kind: 'cancelLoad', run: stopping })}
              >
                Cancel this load (entered by mistake)
              </Button>
            )}
          </>
        )}
      </BottomSheet>

      {/* ---- throw away a load entered by mistake ---- */}
      <BottomSheet
        open={sheet?.kind === 'cancelLoad'}
        title="Cancel this load?"
        subtitle={
          sheet?.kind === 'cancelLoad'
            ? [sheet.run.machine ?? sheet.run.machine_id, sheet.run.batch_no, sheet.run.formulation]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        led="var(--err)"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={() => sheet?.kind === 'cancelLoad' && setSheet({ kind: 'stop', run: sheet.run })}>
              Keep loaded
            </Button>
            <Button variant="danger" onClick={confirmCancelLoad}>
              Yes, cancel load
            </Button>
          </>
        }
      >
        <div className="hint">
          Removes the run from{' '}
          {sheet?.kind === 'cancelLoad' ? (sheet.run.machine ?? sheet.run.machine_id) : 'this machine'}. Nothing is
          logged — use it only if the run was started by mistake.
        </div>
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
