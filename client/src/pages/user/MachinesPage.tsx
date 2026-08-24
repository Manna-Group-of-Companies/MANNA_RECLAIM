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
  gradeVar,
} from '@/components/ui';
import { icons } from '@/config/icons';
import { useBearingDue } from '@/hooks/useBearingDue';
import { useSupervisor } from '@/hooks/useSupervisor';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/cn';
import {
  BATCH_PICK_STAGES,
  FIREWOOD_KG_PER_COARSE_LOAD,
  FIREWOOD_KG_PER_LOAD,
  QUALITIES,
  SHIFTS,
  SHIFT_HOURS,
  TYRES,
  autoclaveFormsFor,
  autoclaveWorkers,
  defaultWorkers,
  isCracker,
  isMoulding,
  opensBatch,
  PIECES_VARIANCE_PCT,
  type AutoclaveForm,
  type TyreType,
} from '@/config/constants';
import {
  expectedPieces,
  minutesBetween,
  mouldingBatchNo,
  overVariance,
  variancePct,
} from '@/utils/mouldingBatch';
import {
  atLocal,
  clock24,
  clockSec,
  currentShift,
  dayLong,
  dayMonth,
  monthLetter,
  monthShort,
  shiftForTime,
  todayISO,
} from '@/utils/date';
import { ago, elapsed, pausedMs, runElapsed } from '@/utils/format';
import type {
  Batch,
  BearingDue,
  MaintenanceLog,
  Machine,
  Product,
  Quality,
  Run,
  Shift,
} from '@/types/models';

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
 * Whether a machine's sheets should ask for meter readings.
 *
 * The kind answers this for almost everything: the autoclaves burn firewood and
 * are timed by their load, and a press, a sleeve bench and a loop bench record
 * neither energy nor hours at all. Everything else is metered.
 *
 * The machine itself gets the last word, because the kind was wrong about one of
 * them. The Soorya Grinder is `kind: 'grind'` like Grinder 1 and Grinder 2 and
 * has no electricity meter and no hour meter on it - so its sheets asked the
 * crew for two readings that do not exist, which is the likeliest reason it has
 * never had a run logged against it. `meters === false` says so on the machine.
 * Null leaves the kind answering, which is every other machine on the list.
 */
const metersByKind = (kind?: string | null) =>
  Boolean(kind) && kind !== 'autoclave' && kind !== 'press' && !isMoulding(kind);

const hasMeters = (machine?: { kind?: string | null; meters?: boolean | null } | null) =>
  machine?.meters ?? metersByKind(machine?.kind);

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

/**
 * The autoclave unload sheet - firewood burned, when it was discharged, and
 * the three clock times the cycle turns on.
 *
 * `pressureTime` splits the heat-up off the cook: without it a long cook and a
 * slow start are the same number. The two door times are a pair, and the gap
 * between them is what the plant calls its loading time - the vessel standing
 * open while it is emptied and the next charge is put in, which is dead time on
 * a machine that only earns while it is shut and hot.
 *
 * All three are asked for here rather than at the load, because this is the
 * moment somebody is actually standing at the vessel with the tablet. All three
 * are optional - a shift that did not note one down should not be stopped from
 * closing the charge over it.
 */
const blankUnload = {
  firewood: '',
  dischargeDate: '',
  unloadTime: '',
  pressureTime: '',
  doorOpenTime: '',
};

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
 * The sleeve and loop stop sheet, on top of the press's pieces and flash: a note
 * about the shift.
 *
 * These are the only run sheets that ask for one. Everything else the plant
 * records is a reading or a count with a rule behind it, and a free-text box on
 * those would fill up with things that belong in a field - but a lot of sleeves
 * is answered for as a lot by the lab, and "second mould was short all shift" is
 * exactly what somebody needs a week later and has nowhere else to put.
 */
const blankMouldStop = { remarks: '' };

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

/**
 * The two lines under a batch number on the Batch pick.
 *
 * The first says what the charge is - the formulation it was cooked to and the
 * grades that have come off it so far. The crew used to type the grade into the
 * batch number itself to get it onto this tile ("3084 special drc"), which put
 * it in the one field the whole record is keyed on.
 *
 * The second says where the batch has got to: when PR2 broke it down and when
 * R1 first went on it. A stage that has not run reads `—` rather than being
 * left off, because the gap IS the answer - it is how the pick says this one has
 * not been through the pre-refiner yet. A charge still in the vessel has no
 * stage times to give and says so instead.
 */
function BatchPickSub({ batch }: { batch: Batch }) {
  // What the refiners have marked off it, or - until they have marked anything -
  // the grade it was charged for, which the API reads off the load run.
  const grades = batch.qualities?.length ? batch.qualities.join(', ') : batch.grade;
  const what = [batch.formulation, grades].filter(Boolean).join(' · ');
  return (
    <>
      {what || 'no grade marked yet'}
      <br />
      {batch.autoclave_done ? (
        // Monospaced so the times line up down the grid rather than jittering
        // with the width of each number.
        <span className="font-mono">
          {BATCH_PICK_STAGES.map((id) => `${id} ${clock24(batch.opened_on?.[id])}`).join(' · ')}
        </span>
      ) : (
        'in autoclave'
      )}
    </>
  );
}

/** Landing tab: every machine grouped by line, with the whole run lifecycle. */
export function MachinesPage() {
  const dispatch = useAppDispatch();
  const notify = useToast();
  const { groups, loading } = useAppSelector((s) => s.machines);
  const active = useAppSelector((s) => s.runs.active);
  const shiftRuns = useAppSelector((s) => s.runs.shift);
  const openDown = useAppSelector((s) => s.maintenance.open);
  // Worked against the clock now, not the clock the list was fetched on - a
  // tablet sits on this tab all shift and machines fall due underneath it.
  const due = useBearingDue();
  const openBatches = useAppSelector((s) => s.batches.items);
  // What the presses mould. A press cannot start without one, so an empty list is
  // something the start sheet has to say out loud - see startNoProducts.
  const products = useAppSelector((s) => s.products.items);
  const productsLoaded = useAppSelector((s) => s.products.loaded);
  /*
   * Re-read on a bump as well as on mount. The "last run" line under an idle
   * machine and the meter readings a refiner start sheet pre-fills from both
   * come off `fetchShiftRuns`, so a reading corrected on the History tab leaves
   * this screen offering the old one - and pre-filling the next start from a
   * meter figure that has since been corrected is how the wrong number gets
   * written down twice.
   */
  const refreshTick = useAppSelector((s) => s.ui.refreshTick);
  /**
   * What the Batch pick offers: every open batch, cooking ones included.
   *
   * They used to be filtered down to the ones out of the autoclave, which read
   * as "these are all the batches there are" and hid a charge the crew could see through the
   * vessel door. A batch still in the autoclave now shows with its state where
   * its stage times would be, so the pick says why it is not ready rather than
   * leaving the number off the screen. Nothing is refused: the server takes a
   * run against any open batch, and it is the shift's own record of what went
   * on the machine.
   */
  const pickableBatches = openBatches;
  /**
   * A vessel's name from its id, for the messages that have to name one.
   *
   * A card knows the machine it is drawn for. A refusal about a batch number
   * only has the id the clashing charge was loaded on, and `AC_M` is not what
   * is painted on the side of the vessel the crew would have to go and look at.
   */
  const machineName = useMemo(() => {
    const named = new Map(
      Object.values(groups)
        .flat()
        .map((m) => [m.id, m.name] as const),
    );
    return (id?: string | null) => (id && named.get(id)) || id || 'another machine';
  }, [groups]);
  // The account signed in signs the record unless the crew switches the name -
  // one tablet is shared, so the two are not always the same person.
  const { name: supervisor } = useSupervisor();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [quality, setQuality] = useState<Quality>('Special');
  const [batchNo, setBatchNo] = useState('');
  /**
   * Any sheet that refines a batch: the other batches whose tailings are going
   * through with the one being refined. The batch itself is not in here - it
   * leads the list that gets sent, and cannot be mixed with itself.
   *
   * Filled by tapping the Batch grid a second time - see tapBatch. It was a
   * grid of its own under "Mixed from", offered on the special line alone,
   * which got both halves of this wrong. A refiner takes two batches at a time
   * and could not say so at all, so a pass with two batches in it went on
   * record as a pass on one; and a second grid of the same numbers is not what
   * "pick two batches" looks like to a crew in gloves. One grid, and the tap
   * after the first mixes one in.
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
  /** Sleeve and loop only: the note the crew leaves against the lot. */
  const [mouldStop, setMouldStop] = useState(blankMouldStop);
  /** Cracker only: the yard gang that picked the scrap tyres it was fed. */
  const [picking, setPicking] = useState(blankPicking);
  const [downTime, setDownTime] = useState('');
  const [repair, setRepair] = useState(blankRepair);
  const [temps, setTemps] = useState<Record<string, string>>({});
  /** When the temperatures were read off the machine. Blank means just now. */
  const [tempTime, setTempTime] = useState('');
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
  }, [dispatch, refreshTick]);

  /**
   * Every open run a machine has, oldest first - and the one its card shows.
   *
   * A machine is meant to have one run open and normally does. It can end up
   * with several: starting is a check for an open run and then an insert, with
   * a round trip in between, so a Start that fires twice - a double tap, a
   * retry after a slow reply - can put both requests through the check before
   * either row lands. server/src/services/run.service.js now removes the loser
   * of that race and migrations/0009 has the database refuse it outright, but
   * rows made before either are still out there.
   *
   * They have to be visible here or they cannot be got rid of: a card keys on
   * the machine, so extra rows are invisible on this screen, and stopping the
   * one the card holds only lets the next take its place - which on the floor
   * reads as a machine that will not stop. So the card leads on the oldest,
   * which is the run the crew watched start, and the cancel sheet clears the
   * whole set at once.
   */
  const openByMachine = useMemo(() => {
    const map = new Map<string, Run[]>();
    for (const r of active) {
      const list = map.get(r.machine_id);
      if (list) list.push(r);
      else map.set(r.machine_id, [r]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.started_at ?? '').localeCompare(String(b.started_at ?? '')));
    }
    return map;
  }, [active]);

  const runByMachine = useMemo(() => {
    const map = new Map<string, Run>();
    for (const [machineId, list] of openByMachine) {
      const oldest = list[0];
      if (oldest) map.set(machineId, oldest);
    }
    return map;
  }, [openByMachine]);
  /** How many rows the cancel sheet is about to clear - see confirmCancelLoad. */
  const cancelOpenCount =
    sheet?.kind === 'cancelLoad' ? (openByMachine.get(sheet.run.machine_id)?.length ?? 1) : 0;

  const downByMachine = useMemo(() => new Map(openDown.map((l) => [l.machine_id, l])), [openDown]);
  const dueByMachine = useMemo(() => new Map(due.map((d) => [d.machineId, d])), [due]);
  const lastByMachine = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of shiftRuns) if (run.ended_at && !map.has(run.machine_id)) map.set(run.machine_id, run);
    return map;
  }, [shiftRuns]);

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
  const startHasMeters = hasMeters(startMachine);
  const startShiftwise = startLine ? startLine === 'coarse' : isShiftwise(startMachine?.kind);
  const startSpecial = startLine === 'special';
  /** The sheets that pick a batch off the open list rather than only typing one. */
  const startPicksBatch = Boolean(startMachine && (isRefiner(startMachine) || startSpecial));
  /**
   * The special line needs a real batch to refine, and one only exists once the
   * autoclave it was cooked in has been discharged. With none out of the vessel
   * the sheet says so and offers nothing to fill in.
   */
  const startNothingReady = startSpecial && pickableBatches.length === 0;
  /**
   * A tap on the Batch grid.
   *
   * The first number picked is the batch being refined - the one the run is
   * filed under, and the only one the record keys on. What is tapped after it
   * goes through with it as tailings, which is what `sources` keeps. Two
   * batches is what a refiner takes at a time; the special line records up to
   * four, which is as many as its columns hold.
   *
   * Untapping the one it is filed under hands that job to the next number still
   * lit rather than dropping the whole picking: the crew is taking one batch
   * back off the machine, not starting the pick again.
   */
  const tapBatch = (b: Batch) => {
    const lead = batchNo.trim();
    if (lead === b.ref) {
      setBatchNo(mix[0] ?? '');
      setMix(mix.slice(1));
      return;
    }
    if (mix.includes(b.ref)) {
      setMix(mix.filter((ref) => ref !== b.ref));
      return;
    }
    if (!lead) {
      setBatchNo(b.ref);
      // The grade the batch was opened for is the one it will come off at, so
      // the picker starts there - the crew can still say otherwise before it
      // starts.
      if (startSpecial && b.grade) setQuality(b.grade);
      return;
    }
    if (!b.autoclave_done) {
      // A charge is on this grid before it is out of the vessel, so that the
      // pick says why it is not ready rather than leaving the number off the
      // screen. It can still be the batch a run is filed under - the crew see
      // it through the door - but it has no tailings to put through anything
      // until it is discharged.
      notify(`${b.ref} is still in the autoclave`, 'warn');
      return;
    }
    // Two batches is what a refiner takes at a time: the one it is filed under
    // and one more going through with it. The special line keeps the four it
    // has always recorded - four columns is what the record has room for, and
    // one of them is the batch being refined.
    if (mix.length >= (startSpecial ? 3 : 1)) {
      notify(startSpecial ? 'Up to 4 batches per mix' : 'Two batches at a time', 'warn');
      return;
    }
    setMix([...mix, b.ref]);
  };

  // ---- the press, sleeve bench or loop bench being set up ----
  const startIsPress = isPress(startMachine?.kind);
  /**
   * A sleeve or loop activity. It is set up exactly as a press is - a product,
   * and the two settings the floor may change for one run - and differs in what
   * it is recorded as: a lot, under a batch number generated from the date and
   * the shift, which nobody types. The product is recorded beside that number
   * rather than inside it, and the two together are what identify the lot.
   */
  const startIsMoulding = isMoulding(startMachine?.kind);
  const startPicksProduct = startIsPress || startIsMoulding;
  /** The product this run is being made to, once one is picked. */
  const pressProduct: Product | undefined = startPicksProduct
    ? products.find((p) => p.id === press.product)
    : undefined;
  /** Cavities and a cycle time are facts about a mould - see Product.moulded. */
  const productIsMoulded = pressProduct ? pressProduct.moulded !== false : true;
  /**
   * The number this run will be filed under, shown before it starts so the crew
   * can see what it is about to be recorded as. The server generates its own and
   * never takes this one - see utils/mouldingBatch.
   */
  const startBatchNo = startIsMoulding
    ? mouldingBatchNo({ shiftDate: startDate, shift: startShift })
    : '';
  /**
   * Neither a press nor a sleeve bench can be started with nothing to make. The
   * list has to have been read first: a connection that dropped is not an empty
   * product list, and telling the crew to go and add one would send them after
   * the wrong problem.
   */
  const startNoProducts = startPicksProduct && productsLoaded && products.length === 0;

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
  /**
   * The month letter a coarse number carries - see monthLetter(). Off the day
   * the charge went in, which is the day it belongs to; the shift date stands in
   * where the crew has not given the load its own, and today's where neither has
   * been picked yet.
   */
  const loadLetter = loadIsCoarse
    ? monthLetter(load.loadDate || load.shiftDate || todayISO())
    : '';
  /** The loading time decides the shift, not the clock the sheet was opened at. */
  const loadShift = shiftForTime(load.loadTime);

  /**
   * Starts a coarse number off with its month letter, so the crew types the
   * running number alone and cannot open one under last month's letter on the
   * 1st - the day it is easiest to get wrong and hardest to notice.
   *
   * Only over an empty field or a bare prefix, which is what keeps it from
   * fighting the crew: once there is a number after the letter the field is
   * theirs, and a coarse charge back-dated into another month is left exactly as
   * typed rather than being renumbered under them. The prefix itself does follow
   * the date, because until a number is against it there is nothing to lose.
   */
  useEffect(() => {
    if (!loadLetter) return;
    setBatchNo((current) => (/^[A-La-l]?-?$/.test(current) ? `${loadLetter}-` : current));
  }, [loadLetter]);

  // ---- the run being stopped, and what its sheet has to ask for ----
  const stopping = sheet?.kind === 'stop' ? sheet.run : undefined;
  const stopMachine = stopping ? machineById.get(stopping.machine_id) : undefined;
  const stopKind = stopMachine?.kind ?? stopping?.kind;
  // The machine off the list where there is one, so its own `meters` answer is
  // used; a run whose machine is no longer listed falls back to its kind.
  const stopsWithMeters = Boolean(stopping) && hasMeters(stopMachine ?? { kind: stopKind });
  /** An autoclave is discharged rather than stopped: firewood, not meters. */
  const stopIsAutoclave = Boolean(stopping) && stopKind === 'autoclave';
  /** A press is stopped on what came out of the mould: pieces, weight, flash. */
  const stopIsPress = Boolean(stopping) && isPress(stopKind);
  /** A sleeve or loop lot, stopped on the same figures plus what was expected. */
  const stopIsMoulding = Boolean(stopping) && isMoulding(stopKind);
  /** Both benches that are logged on a count rather than on a scale reading. */
  const stopCountsPieces = stopIsPress || stopIsMoulding;
  /**
   * A machine that weighs but has no meters on it - the Soorya Grinder.
   *
   * It needs its own branch because the crew count used to sit inside the meters
   * block, as the field beside the electricity reading. Switching the meters off
   * would otherwise take the crew with them, and the shift would be recorded
   * with nobody on the machine.
   */
  const stopNoMeters =
    Boolean(stopping) && !stopsWithMeters && !stopIsAutoclave && !stopCountsPieces;
  // The line the run was started on has the last word: a coarse-line machine
  // put on the special line for a batch is not a shiftwise run.
  const stopShiftwise = stopping?.line ? lineIsShiftwise(stopping.line) : isShiftwise(stopKind);
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
        : stopIsMoulding
          ? 'Weight: must be greater than zero — weigh what came off the bench.'
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
  if (stopCountsPieces) {
    if (piecesValue != null && (piecesValue <= 0 || !Number.isInteger(piecesValue))) {
      stopIssues.push('How many: a whole number of pieces, above zero.');
    }
    if (flashValue != null && flashValue < 0) {
      stopIssues.push('Flash: cannot be less than nothing.');
    }
  }

  /*
   * ---- what a sleeve or loop lot was expected to make ----
   *
   * Worked out from how long the bench has been running, the cycle it was set up
   * at and the mould on it, so the crew sees the figure they are about to be
   * measured against before they commit the count rather than after.
   *
   * It is shown and never enforced. The count off the bench is the figure of
   * record - a mould that ran short made what it made - so a wide gap is a
   * warning and not a refusal. The server works the same figure out again from
   * the booked run time and stores it beside the count; this one is the live
   * reading while the sheet is open, which is why the two can differ by a
   * minute's worth and neither is wrong.
   */
  const mouldRunMin = stopIsMoulding
    ? minutesBetween(stopping?.started_at, new Date(), pausedMs(stopping))
    : null;
  const mouldExpected = stopIsMoulding
    ? expectedPieces({
        runtimeMin: mouldRunMin,
        cyclicMin: stopping?.cyclic_min,
        cavities: stopping?.cavities,
      })
    : null;
  const mouldVariance = variancePct(piecesValue, mouldExpected);
  const mouldFlagged = overVariance(mouldVariance);
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
   * One sheet action at a time.
   *
   * The tablets are slow enough that a reply takes a visible moment, and a
   * crew in gloves taps a button that has not answered again - seven times, on
   * the day this was written, which is how the Cracker ended up with seven runs
   * open at once. The server refuses the second start now and the database will
   * refuse it after migrations/0009, but neither turns the extra taps back into
   * one run: only not sending them does that.
   */
  const [busy, setBusy] = useState(false);
  const once = (action: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

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
    /*
     * A quick answer for the number the crew can already see on this tablet.
     * The server checks it against every batch on record, open or closed, and
     * is the one that has the last word - see the message it sends back below.
     *
     * It says where the number went, not only that it is gone. "Batch 3077
     * already exists" leaves the crew standing at a charged vessel with no way
     * to tell which of two things happened: they keyed the wrong number, or the
     * charge is already logged and somebody has done this once already. Naming
     * the vessel and the shift settles it without leaving the sheet - and those
     * are two different next moves, one of them being to walk away.
     */
    const clash = openBatches.find((b) => b.ref.toLowerCase() === ref.toLowerCase());
    if (clash) {
      const where = machineName(clash.machine_id);
      // dayLong, not dayMonth: `shift_date` is a plain 'YYYY-MM-DD' and reading
      // it through Date would call it UTC midnight - see the note on dayLong.
      const when = clash.shift_date
        ? `, ${dayLong(clash.shift_date)} ${clash.shift ?? ''}`.trimEnd()
        : '';
      notify(`Batch ${ref} is already open on ${where}${when}`, 'warn');
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
    const metered = hasMeters(machine);
    const pressRun = isPress(machine.kind);
    const mouldRun = isMoulding(machine.kind);
    /** A press, a sleeve bench or a loop bench - all set up the same way. */
    const productRun = pressRun || mouldRun;

    // None of the three has meters, but each is still started for a named shift:
    // they ask for the date and the shift the same way a metered machine does.
    // On a sleeve or loop run those two are not only context - together with the
    // product they *are* the batch number, which is why the sheet shows it.
    if (productRun) {
      if (!startDate) {
        notify('Pick a date', 'warn');
        return;
      }
      if (!press.product) {
        notify(mouldRun ? 'Pick what it is making' : 'Pick what it is moulding', 'warn');
        return;
      }
      // The number the run will be filed under has to exist before it starts.
      // It cannot be typed and it cannot be corrected afterwards without moving
      // the lot, so a sheet that cannot form one is stopped here rather than at
      // the server. It takes the date and the shift and nothing else, so this
      // can only be a date the picker has not accepted.
      if (mouldRun && !startBatchNo) {
        notify('No batch number can be made — check the date and the shift', 'warn');
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
    // Every sheet that refines a named batch may have had more than one going
    // through it - see `mix`.
    const picksBatch = isRefiner(machine) || special;
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
          // no batch of its own - and neither does a press, which is named by
          // the product it is moulding rather than by a batch of compound. A
          // sleeve or loop run does carry one, and deliberately does not send
          // it: the server generates the number from the product, the date and
          // the shift, so a tablet cannot name the lot its pieces land in.
          batchNo: shiftwise || productRun ? null : batchNo.trim() || null,
          formulation: shiftwise || productRun ? null : picked?.formulation ?? null,
          tyreType: machine.tyre ? tyre : null,
          mesh: machine.tyre && tyre ? TYRES[tyre].mesh : null,
          shiftDate: metered || productRun ? startDate : todayISO(),
          shift: metered || productRun ? startShift : currentShift(),
          supervisor: supervisor || null,
          elecStart: elec,
          hourStart: hour,
          // What it is making, and the two settings the floor may change for
          // this run. The temperature and the compound rate are the product's,
          // and the server copies both off it - as it does the labour rate on a
          // sleeve or loop run.
          ...(productRun
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
          sources: picksBatch && mix.length ? [batchNo.trim(), ...mix] : undefined,
        }),
      ),
      `${machine.name} started${
        shiftwise
          ? ` · ${startShift}${tyre ? ` · ${TYRES[tyre].label}` : ''}`
          : special
            ? // The batch leads, for the same reason the moulding bench's number
              // does below: a special pass is a pass on one batch, and the crew
              // has just picked it off a grid of open ones. Saying it back is the
              // confirmation that the run went on the batch they meant rather
              // than the one beside it.
              ` · ${batchNo.trim()} · special line${nonProd ? ' · non-production' : ''}${
                mix.length ? ` · mixed with ${mix.length}` : ''
              }`
            : mouldRun
              ? // The number it will be recorded under and what it is making,
                // said back to the crew - they saw both on the sheet, and this
                // is the confirmation that it is what actually got written. Both,
                // because either alone names a lot only halfway.
                ` · ${startBatchNo} · ${pressProduct?.name ?? press.product}`
              : pressRun
                ? ` · ${pressProduct?.name ?? press.product}`
                : // A refiner or pre-refiner on its own line refines a batch as
                  // much as the special line does, and confirmed nothing at all -
                  // the toast said the machine had started and left the crew to
                  // trust the grid. It names the batch on the same terms, and
                  // the batches mixed in with it for the same reason again: two
                  // batches picked is two batches said back.
                  batchNo.trim()
                  ? ` · ${batchNo.trim()}${mix.length ? ` · mixed with ${mix.length}` : ''}`
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
    // A press, sleeve or loop run is the count of what it made, so that count is
    // the point of logging it - there is nothing to weigh later and no second
    // chance at it.
    if (stopCountsPieces) {
      if (piecesValue == null) {
        notify('Enter how many pieces it made', 'warn');
        return;
      }
      if (weightValue == null) {
        notify(
          stopIsMoulding
            ? 'Enter the weight that came off the bench'
            : 'Enter the weight that came off the press',
          'warn',
        );
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
          /*
           * The cycle's three clock times, all read against the discharge date -
           * so a night charge that crosses midnight keeps the day it was emptied
           * on, exactly as the unloading time above does.
           *
           * Undefined rather than null on a blank: null would clear a time
           * already recorded against the run, and "the crew did not note it
           * down" is not "it did not happen". Only sent from the autoclave
           * sheet; the server ignores them from anywhere else.
           */
          pressureAt: stopIsAutoclave
            ? atLocal(unload.dischargeDate, unload.pressureTime) ?? undefined
            : undefined,
          doorOpenAt: stopIsAutoclave
            ? atLocal(unload.dischargeDate, unload.doorOpenTime) ?? undefined
            : undefined,

          // The reading itself when there is one; the difference is what the
          // crew falls back to when only the units used are known.
          elecEnd: stopsWithMeters ? elecEndValue : null,
          hourEnd: stopsWithMeters ? hourEndValue : null,
          kwh: stopsWithMeters ? asNumber(stop.elecDiff) : null,
          hoursRun: stopsWithMeters ? asNumber(stop.hourDiff) : null,
          // What came out of the mould. The flash counts as material spent, so a
          // bench with no flash trimmed off it says zero rather than nothing.
          pieces: stopCountsPieces ? piecesValue : null,
          flashKg: stopCountsPieces ? flashValue ?? 0 : null,
          // The note against a lot. Only the sleeve and loop sheets ask for one -
          // see blankMouldStop - and a blank stays blank rather than being sent
          // as an empty string that reads as a note somebody left.
          remarks: stopIsMoulding ? mouldStop.remarks.trim() || null : null,
          // The yard gang that fed the cracker. Sent only from the cracker's own
          // sheet, and the server ignores it from anywhere else.
          pickingLabourers: stopIsCracker ? pickLabourers : null,
          pickingHours: stopIsCracker ? pickHours : null,
        }),
      ),
      stopIsAutoclave
        ? 'Unloaded · logged'
        : stopIsMoulding
          ? // Named by the lot rather than by the machine: the batch number is
            // what the pieces are now standing in the yard under, and it is the
            // thing the crew would go looking for.
            `${stopping?.batch_no ?? stopMachine?.short ?? ''} · ${piecesValue} pcs logged${
              mouldFlagged ? ` · ${mouldVariance! > 0 ? '+' : ''}${mouldVariance}% vs expected` : ''
            }`
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
      setMouldStop(blankMouldStop);
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

  /**
   * Throws the run away - and every other row left open on the same machine.
   *
   * One tap that was recorded several times is one mistake, not seven, and it
   * is cancelled once: cancelling only the row on the card would hand the card
   * to the next duplicate and leave the crew tapping until the machine finally
   * goes idle, with no way of knowing how many taps that is. See
   * openByMachine.
   */
  const confirmCancelLoad = async () => {
    if (sheet?.kind !== 'cancelLoad') return;
    const label = sheet.run.machine ?? sheet.run.machine_id;
    const open = openByMachine.get(sheet.run.machine_id) ?? [sheet.run];
    const results = await Promise.all(open.map((r) => dispatch(cancelRun(r.id))));
    const cancelled = results.filter((r) => r.meta.requestStatus === 'fulfilled').length;
    const okay = cancelled === open.length;
    notify(
      okay
        ? open.length > 1
          ? `${label}: ${open.length} open runs cancelled — nothing logged`
          : `${label} load cancelled — nothing logged`
        : cancelled > 0
          ? `${label}: ${cancelled} of ${open.length} cancelled — try again for the rest`
          : 'Could not cancel the load',
      okay ? 'ok' : 'err',
    );
    if (okay) closeSheet();
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
    // A blank time means "just read"; a time is read as today's clock, rolled
    // back a day if that would put the reading in the future - the same way a
    // breakdown time is read.
    let ts: string | undefined;
    if (tempTime) {
      const at = new Date(`${todayISO()}T${tempTime}`);
      if (!Number.isNaN(at.getTime())) {
        if (at.getTime() > Date.now()) at.setDate(at.getDate() - 1);
        ts = at.toISOString();
      }
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
          ts,
        }),
      ),
      `${sheet.machine.short ?? sheet.machine.name} ${sheet.due.bearingType} temps logged`,
      'Could not log the temperatures',
    );
    if (okay) {
      setTemps({});
      setTempTime('');
    }
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
                    // A press, sleeve bench or loop bench makes one product at a
                    // time, and its cure and cavities come off whichever is
                    // picked. A plant with only one product on the list has it
                    // picked already.
                    const only =
                      (m.kind === 'press' || isMoulding(m.kind)) && products.length === 1
                        ? products[0]
                        : null;
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
                    // A lot stopped and started again inside the shift is one
                    // record, so the sheet opens on the note the earlier stop
                    // left rather than asking for it twice.
                    setMouldStop({ remarks: r.remarks ?? '' });
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
                      setTempTime('');
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
              ? 'No batch is open.'
              : startNoProducts
                ? 'Nothing on the product list yet.'
              : startIsAutoclave
              ? `${sheet.machine.capacity ?? '—'} kg · firewood entered at unload`
              : startIsPress
                ? `Moulding press — pieces and weight at stop${supervisor ? ` · ${supervisor}` : ''}`
              : startIsMoulding
                ? // The number leads, because it is the one thing on this sheet
                  // the crew cannot change and the thing their output will be
                  // found under afterwards.
                  `${startBatchNo || 'Pick a date and a shift'} — one lot per product per shift${
                    supervisor ? ` · ${supervisor}` : ''
                  }`
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
              <Button variant="primary" onClick={once(confirmStart)} disabled={busy}>
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
            hint="No batch is open. Charge an autoclave on this tab to open one — a charge still cooking is offered here too, so this is empty only when there is no batch at all."
          />
        )}

        {/* A press moulds a product, and its cure, its mould and what its
            compound costs all come off that product - so there is nothing to
            fill in until one exists. A sleeve or loop bench needs one for the
            same reasons and one more: the product is half the batch number. */}
        {sheet?.kind === 'start' && startNoProducts && (
          <EmptyState
            icon={icons.packing}
            title="The product list is empty"
            hint={
              startIsMoulding
                ? 'Add what this bench makes before starting a run.'
                : 'Add what this press moulds before starting a run.'
            }
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

            <SheetLabel>
              {loadIsCoarse ? 'Coarse batch number' : 'Batch number'}
              {loadIsCoarse && loadLetter && (
                <span className="muted normal-case tracking-normal">
                  {' '}
                  — {loadLetter} is {monthShort(load.loadDate || load.shiftDate || todayISO())}
                </span>
              )}
            </SheetLabel>
            <TextField
              inputMode="numeric"
              autoComplete="off"
              placeholder={loadIsCoarse ? `e.g. ${loadLetter || 'C'}-2893` : 'e.g. 2893'}
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

        {/* ---- a sleeve or loop bench ----
            Set up exactly as a press is - a product, and the two settings the
            floor may change for this run - and recorded quite differently: what
            it makes is a lot, and the number that lot is filed under is the date
            and the shift. So the number is shown before anything is committed,
            read-only, and the two fields under it are the two that decide it.

            The product is not in the number and is not meant to be. It is the
            other half of what identifies the lot, which is why the hint says so
            out loud - a crew reading `03/Aug/26-day` on two benches at once is
            reading one shift, not one lot.

            No meters, no hours, no energy: none of them exist here, exactly as
            on a press. */}
        {sheet?.kind === 'start' && startIsMoulding && !startNoProducts && (
          <>
            <SheetLabel>Batch number</SheetLabel>
            <Readout
              label={startBatchNo ? 'This run will be recorded as' : 'Not decided yet'}
              value={startBatchNo || '— pick a date and a shift'}
              valueColor="var(--brand)"
              className="mb-3.5"
            />
            <div className="hint -mt-2">
              Generated from the date and the shift — it is not typed and cannot be changed. The
              lot is this number and the product together, so sleeve and loop on one shift share
              the number and stay separate lots. A second run of the same product in this shift
              joins this same lot rather than opening another.
            </div>

            <SheetLabel>Product</SheetLabel>
            {products.length ? (
              <PickGrid>
                {products.map((p) => (
                  <Pick
                    key={p.id}
                    title={p.name}
                    sub={[
                      p.piece_kg != null ? `${p.piece_kg} kg each` : 'unit weight not set',
                      p.moulded === false ? 'not moulded' : null,
                      p.cavities != null ? `${p.cavities} cav` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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

            {/* The unit weight is a fact of the product, entered once on the
                master and never per run - it is what the yard weighs the lot by,
                so showing it here is how the crew knows it has been set. */}
            {pressProduct && (
              <Readout
                label="Unit weight"
                value={orNotSet(pressProduct.piece_kg, 'kg a piece')}
                valueColor="var(--steel)"
                className="mt-3.5"
              />
            )}

            {/* Cavities and a cycle time are facts about a mould, so an item
                that is not moulded is asked for neither. */}
            {productIsMoulded && (
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
            )}

            <FieldRow className={productIsMoulded ? undefined : 'mt-4'}>
              <TextField
                label="Date"
                note="— the night shift keeps its start date"
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

            {productIsMoulded && (pressProduct?.cyclic_min == null || pressProduct?.cavities == null) && (
              <div className="hint">
                No cycle time or cavities against {pressProduct?.name ?? 'this product'} yet, so the
                run will log without an expected piece count to compare against. Enter them here for
                this run, or on the product list for good.
              </div>
            )}
          </>
        )}

        {sheet?.kind === 'start' &&
          !startIsAutoclave &&
          !startIsPress &&
          !startIsMoulding &&
          !startNothingReady && (
          <>
            {startPicksBatch && pickableBatches.length > 0 && (
              <>
                <SheetLabel>
                  Batch{' '}
                  {!mix.length && (
                    <span className="muted normal-case tracking-normal">
                      — tap a second to mix one in
                    </span>
                  )}
                </SheetLabel>
                <PickGrid>
                  {pickableBatches.map((b) => (
                    <Pick
                      key={b.id}
                      title={b.ref}
                      dot={b.grade ? gradeVar(b.grade) : undefined}
                      sub={<BatchPickSub batch={b} />}
                      selected={batchNo === b.ref || mix.includes(b.ref)}
                      onClick={() => tapBatch(b)}
                    />
                  ))}
                </PickGrid>
                {/* Which of the lit tiles the run is actually filed under. Two
                    tiles lit the same way say nothing about that, and the one
                    it is filed under is the one the batch card, the weighing
                    and the costing all follow. */}
                {mix.length > 0 && (
                  <div className="hint">
                    Filed under {batchNo.trim()} — {mix.join(' and ')}{' '}
                    {mix.length === 1 ? 'goes' : 'go'} through with it as tailings.
                  </div>
                )}
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
                      dot={gradeVar(q)}
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
                onChange={(e) => {
                  setBatchNo(e.target.value);
                  // A number typed here is the batch being refined, so it comes
                  // out of the mix if it was in it - nothing is mixed into
                  // itself.
                  setMix(mix.filter((ref) => ref !== e.target.value.trim()));
                }}
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
                  label="Initial electricity reading"
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
              : stopIsMoulding
                ? // The lot first: it is what the pieces will stand in the yard
                  // under, and what the lab will answer on.
                  [
                    stopping.batch_no,
                    stopping.product,
                    `ran ${runElapsed(stopping)}`,
                    `started ${clockSec(stopping.started_at)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
              : stopIsPress
                ? [
                    stopping.product,
                    stopping.batch_no,
                    `ran ${runElapsed(stopping)}`,
                    `started ${clockSec(stopping.started_at)}`,
                  ]
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
                  `Running ${runElapsed(stopping)} · started ${clockSec(stopping.started_at)}`
                : `Running ${runElapsed(stopping)} · started ${clockSec(stopping.started_at)}${
                    stopping.batch_no ? ` · ${stopping.batch_no}` : ''
                  }`
        }
        led="var(--led-brand)"
        onClose={closeSheet}
        footer={
          <>
            <Button variant="ghost" onClick={closeSheet}>
              {stopIsAutoclave ? 'Cancel' : 'Keep running'}
            </Button>
            <Button variant="primary" onClick={once(confirmStop)} disabled={busy || stopIssues.length > 0}>
              {stopIsAutoclave
                ? 'Log & unload'
                : stopsWithMeters || stopCountsPieces
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
                {/*
                  This is the door closing time, and it is called that.

                  A cycle runs: door closed on a fresh charge, heat to 21 bar,
                  cook, door opened to discharge, emptied and re-charged, door
                  closed again - and that last moment is where the next cycle
                  begins. So the end of this charge and the start of the next
                  are one instant, already recorded here. Asking for it twice
                  would let one charge disagree with itself.
                */}
                <TextField
                  label="Door closing time"
                  note={`— loaded ${clock24(stopping.started_at)}; blank = now`}
                  type="time"
                  value={unload.unloadTime}
                  onChange={(e) => setUnload({ ...unload, unloadTime: e.target.value })}
                />
                {/*
                  The rest of the cycle. Read against the discharge date above, so
                  a night charge that crosses midnight keeps the day it was
                  emptied on.
                */}
                <FieldRow>
                  <TextField
                    label="Reached 21 bar at"
                    type="time"
                    value={unload.pressureTime}
                    onChange={(e) => setUnload({ ...unload, pressureTime: e.target.value })}
                  />
                  <TextField
                    label="Door opened at"
                    type="time"
                    value={unload.doorOpenTime}
                    onChange={(e) => setUnload({ ...unload, doorOpenTime: e.target.value })}
                  />
                </FieldRow>
                <div className="sub">
                  Loading to 21 bar is the heat-up; door opened to door closed above is the
                  vessel standing open being emptied and re-charged. Leave either blank if it
                  was not noted.
                </div>
              </>
            )}

            {stopsWithMeters && (
              <FieldRow>
                <TextField
                  label="Final electricity reading"
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

            {/* ---- what a sleeve or loop shift made ----
                The same shape as the press sheet, with the one thing a press has
                no use for: what the cycle and the mould say the run should have
                come to. The two are kept side by side rather than one derived
                from the other, because the point of showing the expected figure
                is that the counted one can disagree with it - a mould running
                short all shift is exactly what this is meant to surface, and it
                is invisible if the app quietly reports the arithmetic instead of
                the count. */}
            {stopIsMoulding && (
              <>
                <Readout
                  label="Lot"
                  value={stopping.batch_no ?? '—'}
                  valueColor="var(--brand)"
                  className="mb-3.5"
                />

                {mouldExpected != null && (
                  <Readout
                    label="Expected"
                    value={`${mouldExpected} pcs`}
                    valueColor="var(--steel)"
                    className="mb-3.5"
                  />
                )}

                <FieldRow>
                  <TextField
                    label="How many"
                    note="— actually counted"
                    type="number"
                    inputMode="numeric"
                    suffix="nos"
                    placeholder={mouldExpected != null ? String(mouldExpected) : '0'}
                    value={pressStop.pieces}
                    onChange={(e) => setPressStop({ ...pressStop, pieces: e.target.value })}
                  />
                  <TextField
                    label="Workers"
                    note="— on the activity"
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

                {/* The comparison, spelled out before it is committed - the same
                    way a meter pair shows its difference. A wide gap is said out
                    loud and never refused: the count off the bench is what was
                    made, and the crew is being told the figure will be flagged,
                    not being asked to change it. */}
                {mouldVariance != null ? (
                  <div className={cn('diffout show', mouldFlagged && 'bad')}>
                    Expected <b>{mouldExpected}</b>, counted <b>{piecesValue}</b> ={' '}
                    <b>
                      {mouldVariance > 0 ? '+' : ''}
                      {mouldVariance}%
                    </b>
                    {mouldFlagged
                      ? ` — over ${PIECES_VARIANCE_PCT}%, so this run is flagged for the back office.`
                      : ' — within the usual range.'}
                  </div>
                ) : (
                  <div className="hint">
                    {stopping.cyclic_min == null || stopping.cavities == null
                      ? 'No cycle time or cavities were set on this run, so there is nothing to compare the count against.'
                      : 'The comparison shows once the count is in.'}
                  </div>
                )}

                <TextAreaField
                  label="Remarks"
                  note="— anything about this lot worth knowing later"
                  rows={2}
                  placeholder="mould change, short run, material problem…"
                  value={mouldStop.remarks}
                  onChange={(e) => setMouldStop({ remarks: e.target.value })}
                />

                <div className="hint">
                  The pieces go to the yard under <b>{stopping.batch_no ?? 'this lot'}</b> awaiting the
                  lab once they are boxed in the Packing tab. Only a lot the lab has passed can be
                  dispatched.
                </div>
              </>
            )}

            {/* Nothing comes off an autoclave to weigh - the batch is weighed
                once the refiners have worked through it. */}
            {stopNoMeters && (
              <TextField
                label="Workers"
                note="— no meters on this machine, so crew and weight are all it records"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={stop.workers}
                onChange={(e) => setStop({ ...stop, workers: e.target.value })}
              />
            )}

            {!stopIsAutoclave && !stopCountsPieces && (!stopsWithMeters || stopWeighs) && (
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

            {(stopsWithMeters || stopIsAutoclave || stopCountsPieces) && (
              <Button
                variant="danger"
                size="lg"
                className="mt-2"
                onClick={() => setSheet({ kind: 'cancelLoad', run: stopping })}
              >
                Cancel this {stopCountsPieces ? 'run' : 'load'} (entered by mistake)
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
            <Button variant="danger" onClick={once(confirmCancelLoad)} disabled={busy}>
              {cancelOpenCount > 1 ? `Yes, cancel all ${cancelOpenCount}` : 'Yes, cancel load'}
            </Button>
          </>
        }
      >
        <div className="hint">
          Removes the run from{' '}
          {sheet?.kind === 'cancelLoad' ? (sheet.run.machine ?? sheet.run.machine_id) : 'this machine'}. Nothing is
          logged — use it only if the run was started by mistake.
          {cancelOpenCount > 1 && (
            <>
              {' '}
              <b>
                This machine has {cancelOpenCount} runs open — one Start that was recorded{' '}
                {cancelOpenCount} times. All {cancelOpenCount} go.
              </b>
            </>
          )}
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
            <TextField
              label="Reading time"
              note="— leave blank for now"
              type="time"
              value={tempTime}
              onChange={(e) => setTempTime(e.target.value)}
            />
            <SupervisorPick fieldClassName="mt-3" note="— signs these temperatures" />
          </>
        )}
      </BottomSheet>
    </>
  );
}

export default MachinesPage;
