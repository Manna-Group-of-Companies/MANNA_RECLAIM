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
  tallyRun,
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
import { fetchProducts } from '@/features/products/productsSlice';
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
  SupervisorPick,
  TextAreaField,
  TextField,
  ViewHead,
} from '@/components/ui';
import { icons } from '@/config/icons';
import { useSupervisor } from '@/hooks/useSupervisor';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import {
  FIREWOOD_KG_PER_COARSE_LOAD,
  FIREWOOD_KG_PER_LOAD,
  QUALITIES,
  SHIFTS,
  SHIFT_HOURS,
  TOD_MACHINE_ID,
  TYRES,
  autoclaveFormsFor,
  autoclaveWorkers,
  defaultWorkers,
  isCracker,
  opensBatch,
  type AutoclaveForm,
  type TyreType,
} from '@/config/constants';
import { atLocal, clock24, currentShift, dayMonth, shiftForTime, todayISO } from '@/utils/date';
import { ago, elapsed } from '@/utils/format';
import type { BearingDue, MaintenanceLog, Machine, Product, Quality, Run, Shift } from '@/types/models';

/** The line a run is on, for the machines that can be put on either. */
type Line = 'coarse' | 'special';

type Sheet =
  | { kind: 'line'; machine: Machine }
  | { kind: 'start'; machine: Machine; line: Line | null }
  | { kind: 'stop'; run: Run }
  | { kind: 'tally'; run: Run }
  | { kind: 'cancelLoad'; run: Run }
  | { kind: 'breakdown'; machine: Machine }
  | { kind: 'repair'; log: MaintenanceLog }
  | { kind: 'bearing'; machine: Machine; due: BearingDue }
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
 * A moulding press. It moulds finished goods out of reclaim compound rather than
 * making reclaim, so it shares almost nothing with the rest of the plant: no
 * meters, no energy, no run hours, no bearings, nothing for the Weigh tab and no
 * packing path. What it records is a count of pieces against a product.
 */
const isPress = (kind?: string | null) => kind === 'press';

/**
 * Every machine but the autoclaves and the presses is metered, so its sheets ask
 * for the two readings either side of the run. The autoclaves burn firewood and
 * are timed by their load; a press records neither energy nor hours at all.
 */
const hasMeters = (kind?: string | null) =>
  Boolean(kind) && kind !== 'autoclave' && kind !== 'press';

/** A figure the plant has not measured into the system yet reads as such. */
const orNotSet = (value: number | null | undefined, unit: string) =>
  value == null ? 'not set' : `${value} ${unit}`;

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

/**
 * The press start sheet. The product decides the cure and the mould, so both are
 * filled in from it and left editable: a cycle can be run longer today, and a
 * different mould can be on the press. The temperature is not here - it is a fact
 * of the product, shown rather than typed.
 */
const blankPress = { product: '', cyclicMin: '', cavities: '' };

/** The press stop sheet: what came out of the mould, and the flash trimmed off. */
const blankPressStop = { pieces: '', flash: '' };

/**
 * The picking half of the cracker's stop sheet: how many hands were put on
 * pulling scrap tyres out of the yard, and roughly how long they were at it.
 *
 * Asked at the cracker because picking is what feeds the cracker. Asked in
 * approximate terms because that is the only honest way to ask: the gang is not
 * clocked in, and the supervisor's "four of them, about three hours" recorded
 * beats an exact figure nobody has.
 */
const blankPicking = { labourers: '', hours: '' };

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
  // What the presses mould. A press cannot start without one, so an empty list is
  // something the start sheet has to say out loud - see startNoProducts.
  const products = useAppSelector((s) => s.products.items);
  const productsLoaded = useAppSelector((s) => s.products.loaded);
  /**
   * The batches a refiner may be pointed at: open, and out of the autoclave.
   * A charge still cooking has nothing to refine yet, so it is kept off the
   * picker rather than offered and then rejected.
   */
  const refinableBatches = useMemo(
    () => openBatches.filter((b) => b.autoclave_done),
    [openBatches],
  );
  // The account signed in signs the record unless the crew switches the name -
  // one tablet is shared, so the two are not always the same person.
  const { name: supervisor } = useSupervisor();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [quality, setQuality] = useState<Quality>('Special');
  const [batchNo, setBatchNo] = useState('');
  /**
   * Special line only: the other batches whose tailings are going through with
   * the one being refined. The batch itself is not in here - it leads the list
   * that gets sent, and cannot be mixed with itself.
   */
  const [mix, setMix] = useState<string[]>([]);
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
  /** Press only: what it is moulding, and what it is set up to mould it at. */
  const [press, setPress] = useState(blankPress);
  const [pressStop, setPressStop] = useState(blankPressStop);
  /** Cracker only: the yard gang that picked the scrap tyres it was fed. */
  const [picking, setPicking] = useState(blankPicking);
  const [downTime, setDownTime] = useState('');
  const [repair, setRepair] = useState(blankRepair);
  const [temps, setTemps] = useState<Record<string, string>>({});
  /** The load being added to a running machine's tally, in kg. */
  const [tallyAdd, setTallyAdd] = useState('');

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
    // And what the presses mould.
    void dispatch(fetchProducts());
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
  /**
   * The special line needs a real batch to refine, and one only exists once the
   * autoclave it was cooked in has been discharged. With none out of the vessel
   * the sheet says so and offers nothing to fill in.
   */
  const startNothingReady = startSpecial && refinableBatches.length === 0;
  /** The other batches whose tailings can go through with the one picked. */
  const mixable = useMemo(
    () => (startSpecial && batchNo.trim() ? refinableBatches.filter((b) => b.ref !== batchNo.trim()) : []),
    [startSpecial, batchNo, refinableBatches],
  );

  // ---- the press being set up ----
  const startIsPress = isPress(startMachine?.kind);
  /** The product this run is being moulded to, once one is picked. */
  const pressProduct: Product | undefined = startIsPress
    ? products.find((p) => p.id === press.product)
    : undefined;
  /**
   * A press cannot be started with nothing to mould. The list has to have been
   * read first: a connection that dropped is not an empty product list, and
   * telling the crew to go and add one would send them after the wrong problem.
   */
  const startNoProducts = startIsPress && productsLoaded && products.length === 0;

  // ---- the autoclave being charged ----
  const startIsAutoclave = startMachine?.kind === 'autoclave';
  /** What fits this vessel. A machine with one option has it picked already. */
  const forms = useMemo(
    () => (startIsAutoclave ? autoclaveFormsFor(startMachine?.capacity) : []),
    [startIsAutoclave, startMachine?.capacity],
  );
  /** A coarse charge feeds the line for a shift; a special one opens a batch. */
  const loadIsCoarse = form?.type === 'coarse';
  /**
   * Whether this charge opens a batch at all. Coarse and DRC do not: neither is
   * worked through in grades, so both are counted by their runs alone.
   */
  const loadOpensBatch = opensBatch(form);
  /** The loading time decides the shift, not the clock the sheet was opened at. */
  const loadShift = shiftForTime(load.loadTime);

  // ---- the run being stopped, and what its sheet has to ask for ----
  const stopping = sheet?.kind === 'stop' ? sheet.run : undefined;
  const stopMachine = stopping ? machineById.get(stopping.machine_id) : undefined;
  const stopKind = stopMachine?.kind ?? stopping?.kind;
  const stopsWithMeters = Boolean(stopping) && hasMeters(stopKind);
  /** An autoclave is discharged rather than stopped: firewood, not meters. */
  const stopIsAutoclave = Boolean(stopping) && stopKind === 'autoclave';
  /** A press is stopped on what came out of the mould: pieces, weight, flash. */
  const stopIsPress = Boolean(stopping) && isPress(stopKind);
  // The line the run was started on has the last word: a coarse-line machine
  // put on the special line for a batch is not a shiftwise run.
  const stopShiftwise = stopping?.line ? lineIsShiftwise(stopping.line) : isShiftwise(stopKind);
  const stopIsTod = stopping?.machine_id === TOD_MACHINE_ID;
  /**
   * The cracker, and only the cracker, is asked about picking - it is the gang
   * that pulls scrap tyres out of the yard and feeds it. What they cost goes
   * into the crumb the grinding line makes, and from there into what the
   * autoclave charge cost, so it reaches the reclaim without being a line
   * anybody has to add.
   */
  const stopIsCracker = Boolean(stopping) && isCracker(stopping?.machine_id);
  // A machine that weighs at the sheet asks for the figure here; one weighed
  // shiftwise is told where the figure gets entered instead.
  const stopWeighs = stopMachine ? Boolean(stopMachine.weigh) && !stopShiftwise : Boolean(stopping?.needs_weigh);
  const stopWeighedLater = Boolean(stopMachine?.out_weight) && stopShiftwise;

  const round2 = (value: number) => Math.round(value * 100) / 100;

  // ---- the running tally on a machine that is still going ----
  const tallying = sheet?.kind === 'tally' ? sheet.run : undefined;
  const tallyRuns = tallying ? active.find((r) => r.id === tallying.id) ?? tallying : undefined;
  const tallyEntries = tallyRuns?.weigh_entries ?? [];
  const tallyTotal = round2(tallyEntries.reduce((total, n) => total + n, 0));
  /** What the stop sheet says has already been banked against this shift. */
  const stopTally = stopping?.weigh_entries ?? [];

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
    stopIssues.push(
      stopIsPress
        ? 'Weight: must be greater than zero — weigh what came off the press.'
        : 'Output weight: must be greater than zero (leave it blank to weigh later).',
    );
  }

  // ---- the picking gang that fed the cracker ----
  const pickLabourers = asNumber(picking.labourers);
  const pickHours = asNumber(picking.hours);
  if (stopIsCracker) {
    if (pickLabourers != null && (pickLabourers < 0 || !Number.isInteger(pickLabourers))) {
      stopIssues.push('Picking: a whole number of labourers.');
    }
    if (pickHours != null && (pickHours < 0 || pickHours > 24)) {
      stopIssues.push('Picking: hours have to be between nothing and a day.');
    }
    // Half an answer costs nothing at all once it is multiplied out, which reads
    // exactly like a shift that did no picking - so it is caught here instead.
    if ((pickLabourers ?? 0) > 0 !== (pickHours ?? 0) > 0) {
      stopIssues.push('Picking: enter both the labourers and the hours, or neither.');
    }
  }
  /** Labourer-hours of picking - what the crumb costing actually spends. */
  const pickLabourHours =
    (pickLabourers ?? 0) > 0 && (pickHours ?? 0) > 0
      ? round2((pickLabourers as number) * (pickHours as number))
      : null;

  // ---- what came off a press, and what the compound in it cost ----
  const piecesValue = asNumber(pressStop.pieces);
  const flashValue = asNumber(pressStop.flash);
  if (stopIsPress) {
    if (piecesValue != null && (piecesValue <= 0 || !Number.isInteger(piecesValue))) {
      stopIssues.push('How many: a whole number of pieces, above zero.');
    }
    if (flashValue != null && flashValue < 0) {
      stopIssues.push('Flash: cannot be less than nothing.');
    }
  }
  /**
   * Material is charged on the weight plus the flash - that compound was spent
   * either way - at the rate the run was started under, and cost per piece
   * spreads it over the pieces made. Nothing else about a press run is costed: it
   * records no hours and no units, so power, labour and overhead have nothing to
   * be spread over.
   */
  const pressRate = stopping?.compound_rate != null ? Number(stopping.compound_rate) : null;
  const pressCharged = round2((weightValue ?? 0) + (flashValue ?? 0));
  const pressMaterial =
    stopIsPress && pressRate != null && pressCharged > 0 ? round2(pressRate * pressCharged) : null;
  const pressPerPiece =
    pressMaterial != null && piecesValue != null && piecesValue > 0
      ? round2(pressMaterial / piecesValue)
      : null;

  /**
   * Every write goes through here so a failure always says so out loud. The
   * confirmation may be a function of what came back, for the writes whose
   * outcome is not known until the server has answered - stopping a shiftwise
   * machine can fold into a record that already exists.
   */
  const run = async (
    action: Promise<{ meta: { requestStatus: string }; payload?: unknown }>,
    okMsg: string | ((payload: unknown) => string),
    errMsg: string,
  ) => {
    const result = await action;
    const okay = result.meta.requestStatus === 'fulfilled';
    const message = okay && typeof okMsg === 'function' ? okMsg(result.payload) : okMsg;
    notify(okay ? (message as string) : errMsg, okay ? 'ok' : 'err');
    if (okay) closeSheet();
    return okay;
  };

  /**
   * Charging an autoclave. A special load opens the batch the refiners will work
   * through, then starts the run against it. A coarse or DRC load only starts the
   * run: neither is worked through in grades, so both are counted by their runs
   * and never become a batch - see opensBatch(). The run is not started if the
   * batch could not be opened, because a load running against a batch that does
   * not exist is worse than no load at all.
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
    // A quick answer for the number the crew can already see on this tablet.
    // The server checks it against every batch on record, open or closed, and
    // is the one that has the last word - see the message it sends back below.
    if (openBatches.some((b) => b.ref.toLowerCase() === ref.toLowerCase())) {
      notify(`Batch ${ref} already exists`, 'warn');
      return;
    }

    // The load date is the day the charge actually went in, which is not always
    // the shift's date; with no date of its own it falls back to the shift's.
    const startedAt = atLocal(load.loadDate || load.shiftDate, load.loadTime) ?? undefined;

    if (loadOpensBatch) {
      const opened = await dispatch(
        createBatch({
          machine_id: machine.id,
          ref,
          formulation: form.name,
          capacity: machine.capacity ?? form.capacity,
          // Whether the crew was shared with the twin vessel, and the shift the
          // charge belongs to - which is the loading time's shift, not the
          // clock's, and can sit on a different date from the shift date.
          paired: load.paired,
          shift: loadShift,
          shift_date: load.shiftDate,
        }),
      );
      if (createBatch.rejected.match(opened)) {
        notify((opened.payload as string) ?? 'Could not open the batch', 'err');
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
    const pressRun = isPress(machine.kind);

    // A press has no meters, but it is still started for a named shift: it asks
    // for the date and the shift the same way a metered machine does.
    if (pressRun) {
      if (!startDate) {
        notify('Pick a date', 'warn');
        return;
      }
      if (!press.product) {
        notify('Pick what it is moulding', 'warn');
        return;
      }
      if (!batchNo.trim()) {
        notify('Enter the batch number', 'warn');
        return;
      }
      const cavities = asNumber(press.cavities);
      if (cavities != null && (cavities <= 0 || !Number.isInteger(cavities))) {
        notify('Cavities must be a whole number above zero', 'warn');
        return;
      }
      const cyclic = asNumber(press.cyclicMin);
      if (cyclic != null && cyclic <= 0) {
        notify('Cyclic time must be more than zero', 'warn');
        return;
      }
    }

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
    // The special line refines a named batch - there is nothing to run it
    // against otherwise, and the grade would belong to nothing.
    if (special && !batchNo.trim()) {
      notify('Pick the batch it is refining', 'warn');
      return;
    }
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
          shiftDate: metered || pressRun ? startDate : todayISO(),
          shift: metered || pressRun ? startShift : currentShift(),
          supervisor: supervisor || null,
          elecStart: elec,
          hourStart: hour,
          // A press: what it is moulding, and the two settings the floor may
          // change for this run. The temperature and the compound rate are the
          // product's, and the server copies both off it.
          ...(pressRun
            ? {
                product: press.product,
                cyclicMin: asNumber(press.cyclicMin),
                cavities: asNumber(press.cavities),
              }
            : {}),
          nonProduction: special ? nonProd : undefined,
          // The batch being refined leads the list; the tailings mixed into it
          // follow. Sent only when there is a mix - a batch on its own is
          // already named by `batchNo`.
          sources: special && mix.length ? [batchNo.trim(), ...mix] : undefined,
        }),
      ),
      `${machine.name} started${
        shiftwise
          ? ` · ${startShift}${tyre ? ` · ${TYRES[tyre].label}` : ''}`
          : special
            ? ` · special line${nonProd ? ' · non-production' : ''}${
                mix.length ? ` · mixed with ${mix.length}` : ''
              }`
            : pressRun
              ? ` · ${pressProduct?.name ?? press.product} · ${batchNo.trim()}`
              : ''
      }`,
      'Could not start the run',
    );
    setBatchNo('');
    setMix([]);
    setElecStart('');
    setHourStart('');
    setNonProd(false);
    setPress(blankPress);
  };

  const confirmStop = async () => {
    if (sheet?.kind !== 'stop') return;
    if (stopIssues.length) {
      notify('Check the highlighted readings before logging', 'warn');
      return;
    }
    // A press run is the count of what it made, so that count is the point of
    // logging it - there is nothing to weigh later and no second chance at it.
    if (stopIsPress) {
      if (piecesValue == null) {
        notify('Enter how many pieces it made', 'warn');
        return;
      }
      if (weightValue == null) {
        notify('Enter the weight that came off the press', 'warn');
        return;
      }
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
          // What came out of the mould. The flash counts as material spent, so a
          // press with no flash trimmed off it says zero rather than nothing.
          pieces: stopIsPress ? piecesValue : null,
          flashKg: stopIsPress ? flashValue ?? 0 : null,
          // The yard gang that fed the cracker. Sent only from the cracker's own
          // sheet, and the server ignores it from anywhere else.
          pickingLabourers: stopIsCracker ? pickLabourers : null,
          pickingHours: stopIsCracker ? pickHours : null,
        }),
      ),
      stopIsAutoclave
        ? 'Unloaded · logged'
        : stopIsPress
          ? `${stopMachine?.short ?? stopping?.machine_id} · ${piecesValue} pcs logged${
              pressPerPiece != null ? ` · ₹${pressPerPiece}/pc` : ''
            }`
          : (payload) => {
            // A shiftwise stop is named by the shift it was run for, and says
            // so when it was folded into one the shift already had.
            const logged = payload as Run;
            const label = stopShiftwise
              ? `${stopMachine?.short ?? stopping?.machine ?? stopping?.machine_id} · ${stopping?.shift}`
              : 'Run';
            const passes = logged?.passes ?? 1;
            return `${label} logged${passes > 1 ? ` · ${passes} start/stops combined` : ''}`;
          },
      stopIsAutoclave ? 'Could not log the unload' : 'Could not stop the run',
    );
    if (okay) {
      setOutWeight('');
      setStop(blankStop);
      setUnload(blankUnload);
      setPressStop(blankPressStop);
      setPicking(blankPicking);
      // Logging a run moves the batch on: unloading takes it out of the vessel
      // and releases it to the refiners, and an R4 pass marks the grade it
      // yielded. Both happen server-side, so the list is re-read rather than
      // patched from here.
      if (stopIsAutoclave || sheet.run.batch_no) void dispatch(fetchOpenBatches());
    }
  };

  /**
   * The running tally: the whole list goes to the server each time, so adding a
   * load and taking one back off are the same write. Nothing is weighed by it -
   * the figure of record is still settled in the Weigh tab once the machine has
   * stopped - so a failure only warns rather than closing the sheet.
   */
  const saveTally = async (entries: number[]) => {
    if (!tallyRuns) return;
    const result = await dispatch(tallyRun({ id: tallyRuns.id, entries }));
    if (!tallyRun.fulfilled.match(result)) notify('Could not save the weighing', 'err');
  };

  const addTally = () => {
    const value = asNumber(tallyAdd);
    if (value == null || value <= 0) {
      notify('Enter a weight above zero', 'warn');
      return;
    }
    void saveTally([...tallyEntries, round2(value)]);
    setTallyAdd('');
    // Tapping a button does not reliably take focus off the input on the
    // tablets, so the number pad would sit over the sheet's actions.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
      <ViewHead title="Machines" />

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
                    setMix([]);
                    setStartDate(todayISO());
                    setStartShift(currentShift());
                    setNonProd(false);
                    setTyre(m.tyre ? ((m.def_tyre as TyreType) ?? 'truck') : null);
                    // A vessel that can only be charged one way has that
                    // formulation picked already; anything else is a decision.
                    const fits = m.kind === 'autoclave' ? autoclaveFormsFor(m.capacity) : [];
                    setForm(fits.length === 1 ? fits[0] ?? null : null);
                    setLoad(blankLoad);
                    // A press moulds one product at a time, and its cure and
                    // cavities come off whichever is picked. A plant with only
                    // one product on the list has it picked already.
                    const only = m.kind === 'press' && products.length === 1 ? products[0] : null;
                    setPress(
                      only
                        ? {
                            product: only.id,
                            cyclicMin: only.cyclic_min != null ? String(only.cyclic_min) : '',
                            cavities: only.cavities != null ? String(only.cavities) : '',
                          }
                        : blankPress,
                    );
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
                    setPressStop(blankPressStop);
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
                    // The picking gang, as the shift already has it. A cracker
                    // stopped for a blockage and started again is the same
                    // shift's record, so the second sheet opens on what the
                    // first one entered rather than asking the gang to be
                    // counted twice.
                    setPicking({
                      labourers: r.picking_labourers != null ? String(r.picking_labourers) : '',
                      hours: r.picking_hours != null ? String(r.picking_hours) : '',
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
                  onTally={(r) => {
                    setTallyAdd('');
                    setSheet({ kind: 'tally', run: r });
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
        led="var(--led-brand)"
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
            : startNothingReady
              ? 'No batches are ready yet.'
              : startNoProducts
                ? 'Nothing on the product list yet.'
              : startIsAutoclave
              ? `${sheet.machine.capacity ?? '—'} kg · firewood entered at unload`
              : startIsPress
                ? `Moulding press — pieces and weight at stop${supervisor ? ` · ${supervisor}` : ''}`
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
        led="var(--led-brand)"
        onClose={closeSheet}
        footer={
          startNothingReady || startNoProducts ? (
            <Button variant="ghost" onClick={closeSheet}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeSheet}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmStart}>
                {startIsAutoclave ? 'Load ▸' : 'Start ▸'}
              </Button>
            </>
          )
        }
      >
        {/* The special line has nothing to work on until a charge is out of the
            vessel, so the sheet says what has to happen first rather than
            offering a batch picker with nothing in it. */}
        {sheet?.kind === 'start' && startNothingReady && (
          <EmptyState
            icon={icons.batches}
            title="Nothing to refine"
            hint="Unload the autoclave first to make a batch selectable."
          />
        )}

        {/* A press moulds a product, and its cure, its mould and what its
            compound costs all come off that product - so there is nothing to
            fill in until one exists. */}
        {sheet?.kind === 'start' && startNoProducts && (
          <EmptyState
            icon={icons.packing}
            title="The product list is empty"
            hint="Add what this press moulds before starting a run."
          />
        )}

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

        {/* ---- a moulding press ----
            The curing settings belong to the product, so the floor never retypes
            them: the temperature is read out as a fact, and the cure and the
            cavities are filled in from the product and left editable for the run
            in hand. No meters, no hours, no energy - a press records none. */}
        {sheet?.kind === 'start' && startIsPress && !startNoProducts && (
          <>
            <SheetLabel>Product</SheetLabel>
            {products.length ? (
              <PickGrid>
                {products.map((p) => (
                  <Pick
                    key={p.id}
                    title={p.name}
                    sub={[
                      p.cure_temp_c != null ? `${p.cure_temp_c} °C` : null,
                      p.cyclic_min != null ? `${p.cyclic_min} min` : null,
                      p.cavities != null ? `${p.cavities} cav` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'settings not set yet'}
                    selected={press.product === p.id}
                    onClick={() =>
                      setPress({
                        product: p.id,
                        cyclicMin: p.cyclic_min != null ? String(p.cyclic_min) : '',
                        cavities: p.cavities != null ? String(p.cavities) : '',
                      })
                    }
                  />
                ))}
              </PickGrid>
            ) : (
              <div className="hint">Reading the product list…</div>
            )}

            {/* Temperature is a fact of the product, not a decision at the run. */}
            {pressProduct && (
              <Readout
                label="Curing temperature"
                value={orNotSet(pressProduct.cure_temp_c, '°C')}
                valueColor="var(--ember)"
                className="mt-3.5"
              />
            )}

            <FieldRow className="mt-4">
              <TextField
                label="Cyclic time"
                note="— from the product"
                type="number"
                inputMode="decimal"
                suffix="min"
                placeholder={pressProduct?.cyclic_min != null ? String(pressProduct.cyclic_min) : 'not set'}
                value={press.cyclicMin}
                onChange={(e) => setPress({ ...press, cyclicMin: e.target.value })}
              />
              <TextField
                label="Cavities"
                note="— change if a different mould is on"
                type="number"
                inputMode="numeric"
                placeholder={pressProduct?.cavities != null ? String(pressProduct.cavities) : 'not set'}
                value={press.cavities}
                onChange={(e) => setPress({ ...press, cavities: e.target.value })}
              />
            </FieldRow>

            <TextField
              label="Batch number"
              placeholder="e.g. P-104"
              autoComplete="off"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />

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

            {pressProduct?.compound_rate == null && (
              <div className="hint">
                No compound rate is set against {pressProduct?.name ?? 'this product'} yet, so the run
                will log without a material cost. It can be costed once the rate is entered.
              </div>
            )}
          </>
        )}

        {sheet?.kind === 'start' && !startIsAutoclave && !startIsPress && !startNothingReady && (
          <>
            {startPicksBatch && refinableBatches.length > 0 && (
              <>
                <SheetLabel>Batch</SheetLabel>
                <PickGrid>
                  {refinableBatches.map((b) => (
                    <Pick
                      key={b.id}
                      title={b.ref}
                      sub={b.formulation ?? undefined}
                      selected={batchNo === b.ref}
                      onClick={() => {
                        const next = batchNo === b.ref ? '' : b.ref;
                        setBatchNo(next);
                        // A batch cannot be mixed into itself, so picking one
                        // takes it back out of the tailings.
                        setMix(mix.filter((ref) => ref !== next));
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

            {/* A pass often carries the tailings of other batches through with
                the one being refined. They are named here so the run says what
                actually went into it - four batches in all, which is as many as
                the record has room for. */}
            {startSpecial && batchNo.trim() && (
              <>
                <SheetLabel className="mt-4">
                  Mixed from{' '}
                  <span className="muted normal-case tracking-normal">
                    — add tailings of other batches
                  </span>
                </SheetLabel>
                {mixable.length ? (
                  <PickGrid>
                    {mixable.map((b) => (
                      <Pick
                        key={b.id}
                        title={b.ref}
                        sub={b.formulation ?? undefined}
                        selected={mix.includes(b.ref)}
                        onClick={() => {
                          if (mix.includes(b.ref)) {
                            setMix(mix.filter((ref) => ref !== b.ref));
                          } else if (mix.length >= 3) {
                            // Four columns is all the record has room for, and
                            // one of them is the batch being refined.
                            notify('Up to 4 batches per mix', 'warn');
                          } else {
                            setMix([...mix, b.ref]);
                          }
                        }}
                      />
                    ))}
                  </PickGrid>
                ) : (
                  <div className="hint">No other batches to mix.</div>
                )}
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

        {/* Both halves of this sheet - the autoclave load and every other
            start - file the run against a name, so the pick sits under both. */}
        {sheet?.kind === 'start' && !startNothingReady && !startNoProducts && (
          <SupervisorPick fieldClassName="mt-4" note={startIsAutoclave ? '— signs this load' : '— signs this run'} />
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
              : stopIsPress
                ? [stopping.product, stopping.batch_no, `ran ${elapsed(stopping.started_at)}`]
                    .filter(Boolean)
                    .join(' · ')
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
        led="var(--led-brand)"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              {stopIsAutoclave ? 'Cancel' : 'Keep running'}
            </Button>
            <Button variant="primary" onClick={confirmStop} disabled={stopIssues.length > 0}>
              {stopIsAutoclave
                ? 'Log & unload'
                : stopsWithMeters || stopIsPress
                  ? 'Log run'
                  : 'Stop run'}
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

            {/* ---- what came off a press ----
                Counted in pieces, and weighed rather than worked out: the flash
                trimmed off is compound the run spent as surely as the piece is,
                so it is charged with it. No meters and no hours - a press
                records neither. */}
            {stopIsPress && (
              <>
                <Readout
                  label="Moulded at"
                  value={`${orNotSet(stopping.cure_temp_c, '°C')} · ${orNotSet(
                    stopping.cyclic_min,
                    'min',
                  )} · ${stopping.cavities ?? '—'} cavities`}
                  className="mb-3.5"
                />

                <FieldRow>
                  <TextField
                    label="How many"
                    note="— pieces produced"
                    type="number"
                    inputMode="numeric"
                    suffix="nos"
                    placeholder="0"
                    value={pressStop.pieces}
                    onChange={(e) => setPressStop({ ...pressStop, pieces: e.target.value })}
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

                <FieldRow>
                  <TextField
                    label="Weight"
                    note="— weighed output"
                    inputMode="decimal"
                    suffix="kg"
                    placeholder="0"
                    value={outWeight}
                    onChange={(e) => setOutWeight(e.target.value.replace(/[^\d.]/g, ''))}
                  />
                  <TextField
                    label="Flash"
                    note="— waste compound"
                    inputMode="decimal"
                    suffix="kg"
                    placeholder="0"
                    value={pressStop.flash}
                    onChange={(e) => setPressStop({ ...pressStop, flash: e.target.value.replace(/[^\d.]/g, '') })}
                  />
                </FieldRow>

                {/* The arithmetic, spelled out before it is committed - the same
                    way a meter pair shows its difference. */}
                {pressMaterial != null ? (
                  <div className="diffout show">
                    Material: ({weightValue ?? 0} + {flashValue ?? 0}) × ₹{pressRate} ={' '}
                    <b>₹{pressMaterial}</b>
                    {pressPerPiece != null && (
                      <>
                        {' '}
                        ÷ {piecesValue} pcs = <b>₹{pressPerPiece}</b> a piece
                      </>
                    )}
                  </div>
                ) : (
                  <div className="hint">
                    {pressRate == null
                      ? 'No compound rate against this product, so the run logs without a material cost.'
                      : 'Material cost shows once the weight is in.'}
                  </div>
                )}
                <div className="hint">
                  Power, labour and overhead are not costed on a press: it records no hours and no
                  units for them to be spread over.
                </div>
              </>
            )}

            {/* Nothing comes off an autoclave to weigh - the batch is weighed
                once the refiners have worked through it. */}
            {!stopIsAutoclave && !stopIsPress && (!stopsWithMeters || stopWeighs) && (
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

            {/* ---- picking ----
                The gang that pulls scrap tyres out of the yard and feeds the
                cracker. It is the first labour spent on a kg of reclaim, and it
                was spent nowhere until this field existed: no box asked, so no
                figure carried it, so a shift that put four extra hands on the
                yard looked exactly as cheap as one that put none.

                Asked in approximate terms because that is the only honest way to
                ask - the gang is not clocked in. What it costs goes into the
                crumb the grinding line makes and from there into the autoclave
                charge, so it reaches the reclaim on its own. */}
            {stopIsCracker && (
              <>
                <SheetLabel className="mt-4">Picking — scrap yard</SheetLabel>
                <FieldRow>
                  <TextField
                    label="Labourers"
                    note="— on picking"
                    type="number"
                    inputMode="numeric"
                    suffix="nos"
                    placeholder="0"
                    value={picking.labourers}
                    onChange={(e) => setPicking({ ...picking, labourers: e.target.value })}
                  />
                  <TextField
                    label="Time worked"
                    note="— roughly"
                    type="number"
                    inputMode="decimal"
                    suffix="hrs"
                    placeholder="0"
                    value={picking.hours}
                    onChange={(e) => setPicking({ ...picking, hours: e.target.value })}
                  />
                </FieldRow>
                {pickLabourHours != null ? (
                  <div className="diffout show">
                    Picking: {pickLabourers} × {pickHours} h = <b>{pickLabourHours}</b> labourer-hours
                    — costed into ₹/kg crumb, and from there into the reclaim.
                  </div>
                ) : (
                  <div className="hint">
                    An estimate is fine — how many were on the yard, and about how long. It goes into
                    what a kg of crumb costs, so leaving it blank prices this shift's picking at
                    nothing.
                  </div>
                )}
              </>
            )}

            {stopWeighedLater && (
              <div className="hint">
                {stopTally.length > 0 ? (
                  <>
                    {stopTally.length} load{stopTally.length > 1 ? 's' : ''} tallied ·{' '}
                    <b>{round2(stopTally.reduce((total, n) => total + n, 0))} kg</b> — finalise and
                    submit it in the Weigh tab after stopping.
                  </>
                ) : (
                  'Output is weighed shiftwise in the Weigh tab after stopping.'
                )}
              </div>
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

            {(stopsWithMeters || stopIsAutoclave || stopIsPress) && (
              <Button
                variant="danger"
                size="lg"
                className="mt-2"
                onClick={() => setSheet({ kind: 'cancelLoad', run: stopping })}
              >
                Cancel this {stopIsPress ? 'run' : 'load'} (entered by mistake)
              </Button>
            )}
          </>
        )}
      </BottomSheet>

      {/* ---- the running tally on a machine that is still going ---- */}
      <BottomSheet
        open={sheet?.kind === 'tally'}
        title={tallyRuns ? `Add weight — ${tallyRuns.machine ?? tallyRuns.machine_id}` : ''}
        subtitle={
          tallyRuns
            ? [
                tallyRuns.line === 'grind' ? 'Grinder output' : 'Coarse',
                tallyRuns.shift,
                dayMonth(tallyRuns.shift_date),
                tallyRuns.mesh,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        led="var(--led-elec)"
        onClose={closeSheet}
        footer={
          <Button variant="primary" onClick={closeSheet}>
            Done
          </Button>
        }
      >
        {tallyRuns && (
          <>
            <Readout
              label="Running total"
              value={`${tallyTotal} kg`}
              valueColor="var(--elec)"
              className="mb-3.5"
            />

            {tallyEntries.length > 0 ? (
              <div className="weighlist">
                {tallyEntries.map((value, i) => (
                  <div key={`${value}-${i}`} className="weighrow">
                    <span className="tnum">{value} kg</span>
                    <button
                      type="button"
                      className="wdel"
                      aria-label={`Remove ${value} kg`}
                      onClick={() => void saveTally(tallyEntries.filter((_, index) => index !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="hint">
                Add each load as it comes off — they keep adding up while the machine runs. Finalise
                &amp; submit in the Weigh tab after you stop it.
              </div>
            )}

            <SheetLabel>Add a weighing</SheetLabel>
            <div className="field-inline items-stretch">
              <TextField
                inputMode="decimal"
                suffix="kg"
                placeholder="0"
                value={tallyAdd}
                onChange={(e) => setTallyAdd(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTally();
                  }
                }}
                fieldClassName="flex-1 !mb-0"
              />
              <Button variant="elec" className="self-end" onClick={addTally}>
                + Add
              </Button>
            </div>
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
        led="var(--led-err)"
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
        led="var(--led-err)"
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
        led="var(--led-err)"
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
        led="var(--led-elec)"
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
            <SupervisorPick fieldClassName="mt-3" note="— signs these temperatures" />
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default MachinesPage;
