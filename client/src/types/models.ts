export type Role = 'worker' | 'supervisor' | 'lab' | 'manager' | 'admin';
export type Shift = 'Day' | 'Night';
export type Quality = 'Special' | 'SuperFine' | 'Fine' | 'Medium' | 'DRC';
export type DispatchGrade = Quality | 'Coarse' | 'Sillsheet';
export type MachineKind = 'grind' | 'autoclave' | 'prerefiner' | 'refiner' | 'coarse' | 'press';
export type RunStatus = 'running' | 'done';
export type Verdict = 'pass' | 'hold';

export interface User {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface Machine {
  id: string;
  name: string;
  short: string;
  kind: MachineKind;
  group_name: string;
  accent?: string | null;
  capacity?: number | null;
  needs_quality?: boolean;
  weigh?: boolean;
  out_weight?: boolean;
  /** Runs on a tyre feedstock, and which one it is set up for by default. */
  tyre?: boolean;
  def_tyre?: string | null;
  enabled: boolean;
  sort_order?: number;
  sub?: string | null;
}

/**
 * What a moulding press moulds.
 *
 * The curing settings belong to the product rather than to the press, because
 * the same press moulds a different one tomorrow and neither the temperature nor
 * the cycle is the press's to change. A press run copies all four as it starts,
 * so a rate changed next month never rewrites what an old run cost.
 *
 * Every figure may be null: the plant has not measured them into this system
 * yet, and the sheets say "not set" rather than inventing one.
 */
export interface Product {
  id: string;
  name: string;
  /** Held on the platen, in °C - shown at the run, never typed. */
  cure_temp_c?: number | null;
  /** The cure in minutes, pre-filled at the run and editable for that run. */
  cyclic_min?: number | null;
  /** Pieces the mould makes per cycle. */
  cavities?: number | null;
  /** What the compound this is moulded from costs, per kg. */
  compound_rate?: number | null;
  note?: string | null;
  active: boolean;
  sort_order?: number;
}

/**
 * One row of the batch card's grade grid: whether the batch was marked as
 * yielding this grade, and how far that grade has got.
 *
 * `marked` is the supervisor's tick - or the tick logging a run on the final
 * refiner made for them. The three stages are derived by the API from the runs
 * logged against the batch number: refined on R3 (or R1 standing in for it),
 * finished on R4, and weighed once there is a figure against it. `kg` is what
 * has been weighed off this grade, which is the detail view's per-grade line.
 */
export interface BatchGrade {
  quality: Quality;
  marked: boolean;
  refined: boolean;
  finished: boolean;
  weighed: boolean;
  kg: number | null;
}

/** Material moved from one grade to another partway through a batch. */
export interface BatchConversion {
  id: string;
  batch_no?: string | null;
  from_quality?: Quality | null;
  to_quality?: Quality | null;
  qty_kg?: number | null;
  stage?: string | null;
  ts?: string | null;
  shift_date?: string | null;
  shift?: Shift | null;
  supervisor?: string | null;
}

/**
 * One autoclave charge, from the load that opened it to the close that files it
 * away. A batch is never created on its own - loading an autoclave is what opens
 * one - so `machine_id` is always the vessel it was charged in.
 */
export interface Batch {
  id: string;
  ref: string;
  machine_id: string;
  formulation?: string | null;
  /**
   * Which line the charge was on. Only a special charge becomes a batch the
   * refiners work grades out of, so loading a coarse or DRC one opens none -
   * every `coarse` or `drc` batch is a record that came across from the tablets,
   * and those are kept off the batch list and the refiner pickers.
   */
  line?: 'special' | 'coarse' | 'drc';
  /** What the vessel was charged with, in kg. */
  capacity?: number | null;
  /** The grades the batch is marked as yielding. Empty until they are marked. */
  qualities?: Quality[];
  grade?: Quality | null;
  /** The load was shared with the twin vessel rather than charged alone. */
  paired?: boolean;
  workers?: number | null;
  /** Set by unloading the autoclave. Until then no refiner can pick it up. */
  autoclave_done?: boolean;
  status: 'open' | 'closed';
  shift?: Shift | null;
  shift_date?: string | null;
  opened_at: string | null;
  opened_by?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  remarks?: string | null;
  loaded_at?: string | null;
  unloaded_at?: string | null;
  /** The grade x stage grid, one row per quality the plant makes. */
  grades?: BatchGrade[];
  /** Which pre-refiners broke this charge down. */
  pre_refiners?: string[];
  runs_count?: number;
  marked_count?: number;
  weighed_count?: number;
  /** Loaded -> In autoclave -> mark qualities -> n/m weighed. */
  state_label?: string;
  /** Out of the vessel, yet nothing was ever logged against it. */
  orphaned?: boolean;
  /** Total weighed off the batch, and that over the charge. */
  weighed_kg?: number | null;
  yield_pct?: number | null;
  /** Folded in from the costing snapshot, null until the batch is costed. */
  stage?: string | null;
  output_kg?: number | null;
  packed_sacks?: number | null;
  total_cost?: number | null;
  cost_per_kg?: number | null;
  efficiency_pct?: number | null;
}

/**
 * A run as the shop-floor tablets record it. `weight_kg`, `ended_at` and
 * `batch_no` are the stored columns; `out_weight`, `stopped_at`, `batch_id`
 * and `status` are aliases the API derives so screens read the same names
 * everywhere. Duration comes from `runtime_min` - the two timestamps are
 * written seconds apart when the tablet syncs, so subtracting them is wrong.
 */
export interface Run {
  id: string;
  machine_id: string;
  machine?: string | null;
  kind?: MachineKind | null;
  line?: string | null;
  batch_no?: string | null;
  batch_id?: string | null;
  autoclave_id?: string | null;
  formulation?: string | null;
  capacity?: number | null;
  quality?: Quality | null;
  /**
   * The batches a special-line pass drew from - the one being refined first,
   * then the tailings mixed into it. Stored as four columns, read back as one
   * list; empty on every run that was not a mix.
   */
  sources?: string[] | null;
  mesh?: string | null;
  tyre_type?: string | null;
  shift_date: string;
  shift: Shift;
  supervisor?: string | null;
  workers?: number | null;
  /**
   * How many start/stops this record combines. A shiftwise machine keeps one
   * record per shift, so stopping and restarting it inside the shift folds back
   * into the same row and lifts this instead of opening a second one.
   */
  passes?: number | null;
  /**
   * Set only on the answer to a stop that was folded into the shift's existing
   * record: the id of the row that went, so the tablet can drop it.
   */
  merged_from?: string | null;
  paired?: boolean;
  started_at: string;
  ended_at?: string | null;
  stopped_at?: string | null;
  runtime_min?: number | null;
  hours_run?: number | null;
  weight_kg?: number | null;
  out_weight?: number | null;
  /**
   * The individual weighings `weight_kg` was totalled from - material comes off
   * a machine in more than one barrow. Null on a run weighed before the column
   * existed, which is one weighing by another name.
   */
  weigh_entries?: number[] | null;
  kwh?: number | null;
  /**
   * Meter readings around the run. The crews record the meter rather than a
   * total, so kWh and hours are the difference where the total is blank -
   * see utils/format's kwhOf() and hours().
   */
  elec_start?: number | null;
  elec_end?: number | null;
  hour_start?: number | null;
  hour_end?: number | null;
  firewood_kg?: number | null;
  packed_sacks?: number | null;
  /** Sub-sack remainder carried in from the previous batch of this grade. */
  leftout_in?: number | null;
  /** What this run leaves for the next batch of the same grade. */
  leftout_out?: number | null;
  paused?: boolean;
  /**
   * A moulding press run. The product it was set up for and what it was moulded
   * at - both copied off the product as the run started, so they read as the run
   * was made rather than as the product stands today - then what came out of the
   * mould: the pieces counted, the weight put on the scale (`weight_kg`, as for
   * any other machine) and the flash trimmed off.
   */
  product?: string | null;
  cavities?: number | null;
  cyclic_min?: number | null;
  cure_temp_c?: number | null;
  pieces?: number | null;
  flash_kg?: number | null;
  compound_rate?: number | null;
  /**
   * What that came to, derived by the API on every read: compound on the weight
   * plus the flash, spread over the pieces made. Null while the product has no
   * rate against it, or before the run has been stopped.
   */
  material_cost?: number | null;
  cost_per_piece?: number | null;
  /** A special-line pass that yields nothing to weigh - never bagged. */
  non_production?: boolean | null;
  status: RunStatus;
  /** The column the tablets write: this machine's output gets weighed later. */
  needs_weigh?: boolean | null;
  needs_weight?: boolean;
  needs_pack?: boolean;
  remarks?: string | null;
}

export interface QualityParam {
  name: string;
  value: string;
  unit?: string;
}

export interface QualityTest {
  id: string;
  kind?: string;
  batch_no?: string | null;
  batch_id?: string | null;
  machine_id?: string | null;
  quality?: Quality | null;
  grade: Quality;
  verdict: Verdict;
  params?: QualityParam[];
  tester?: string | null;
  tested_by?: string | null;
  ts?: string;
  tested_at: string;
  notes?: string | null;
  remarks?: string | null;
  /** The lab's report, once it has been uploaded - a photo or a PDF. */
  attachment_url?: string | null;
  attachment_name?: string | null;
}

/** The whole record of one batch - what the batch detail view is drawn from. */
export interface BatchDetail extends Batch {
  runs: Run[];
  conversions: BatchConversion[];
  qualityTests: QualityTest[];
}

export interface DispatchLoad {
  id: string;
  dispatch_id: string;
  vehicle?: string | null;
  driver?: string | null;
  gross_kg?: number | null;
  tare_kg?: number | null;
  net_kg?: number | null;
  bags?: number | null;
}

export interface Dispatch {
  id: string;
  customer: string;
  grade: DispatchGrade;
  dispatch_date: string;
  invoice_no?: string | null;
  vehicle?: string | null;
  /** One of the plant's own vehicles, rather than a hired or customer one. */
  own_vehicle?: boolean | null;
  driver?: string | null;
  total_kg?: number | null;
  status: 'draft' | 'dispatched' | 'invoiced';
  remarks?: string | null;
  loads?: DispatchLoad[];
  rate?: number | null;
  amount?: number | null;
}

/**
 * A breakdown. The stored columns are `down_start` / `repaired_at` plus the
 * write-up; `status`, `severity`, `title` and `logged_at` are derived by the
 * API from how long the machine was out.
 */
export interface MaintenanceLog {
  id: string;
  machine_id: string;
  machine?: string | null;
  down_start?: string | null;
  repaired_at?: string | null;
  downtime_min?: number | null;
  downtime_hours?: number | null;
  root_cause?: string | null;
  resolution?: string | null;
  prevention?: string | null;
  kind: 'breakdown' | 'service' | 'inspection' | 'other';
  title: string;
  detail?: string | null;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'closed';
  logged_at: string;
  logged_by?: string | null;
  resolved_at?: string | null;
}

/** One temperature reading for one bearing position. */
export interface BearingLog {
  id: string;
  machine_id: string;
  machine?: string | null;
  bearing_type?: string | null;
  kind: 'bearing' | 'bush';
  position?: string | null;
  positions?: string[] | null;
  temp_c?: number | null;
  shift_date?: string | null;
  shift?: Shift | null;
  ts: string;
  supervisor?: string | null;
  by_user?: string | null;
  remarks?: string | null;
}

/**
 * One machine's greasing schedule as the API reports it: what it runs on,
 * which positions get a reading, and how far past due it is right now.
 * `dueInMin` is negative once the interval has elapsed.
 */
export interface BearingDue {
  machineId: string;
  machine?: string | null;
  bearingType: 'bearing' | 'bush';
  positions: string[];
  intervalH: number;
  lastAt: number | null;
  dueInMin: number;
  due: boolean;
}

/** Pass rate for one grade over a window - the Quality tab's headline. */
export interface QualityGradeSummary {
  grade: string;
  total: number;
  pass: number;
  hold: number;
  passRate: number;
}

export interface Rate {
  customer: string;
  grade: DispatchGrade;
  rate: number;
  note?: string | null;
}

export interface ProductionReport {
  window: { from: string | null; to: string | null };
  runs: number;
  outKg: number;
  runHours: number;
  kgPerHour: number;
  kwh: number;
  firewoodKg: number;
  packedSacks: number;
}

export interface EfficiencyRow {
  machineId: string;
  machine?: string;
  runs: number;
  hours: number;
  outKg: number;
  workerHours: number;
  downtimeHours: number;
  kgPerHour: number;
  kgPerWorkerHour: number;
}

/** What the run history covers, for the back office's pickers. */
export interface RunFilters {
  days: string[];
  shifts: Shift[];
  machines: { id: string; name: string }[];
  /** Batch numbers on record, newest first - the History batch picker. */
  batches: string[];
}

export interface ShiftOption {
  date: string;
  shifts: Shift[];
}

/**
 * One metric on an efficiency card. `baseline` is the plant's own median for
 * the same figure; `warn` is the server's verdict on whether this shift falls
 * short of it. `calc` is the arithmetic spelled out, so the screen can show
 * its working instead of asking anyone to take the number on trust.
 */
export interface EfficiencyMetric {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  baseline: number | null;
  baselineLabel?: string;
  warn: boolean;
  calc: {
    title: string;
    formula: string;
    lines: string[];
    result: string;
    note: string;
  } | null;
}

export interface EfficiencyCard {
  key: string;
  metrics: EfficiencyMetric[];
  /** Refiner cards are keyed by grade... */
  quality?: Quality;
  batches?: string[];
  /** ...grinder cards by machine... */
  machineId?: string;
  machine?: string;
  /** ...and yield cards by batch. */
  batch?: string;
  charge?: number | null;
  out?: number | null;
  workers?: number;
  hours?: number | null;
}

export interface EfficiencyNote {
  id: string;
  shift_date: string;
  shift?: string | null;
  line: 'refiner' | 'grind';
  metric?: string | null;
  reason: string;
  entered_by?: string | null;
  created_at?: string;
}

export interface ShiftEfficiency {
  date: string | null;
  shift: string | null;
  totals: { runs: number; outKg: number | null; kwh: number | null };
  refiners: EfficiencyCard[];
  grinders: EfficiencyCard[];
  yields: EfficiencyCard[];
  notes: EfficiencyNote[];
  thresholds: { labour: number; energy: number; yield: number; utilisation: number };
}

export interface DowntimeReport {
  month: string;
  months: string[];
  totalMinutes: number;
  events: number;
  byMachine: { machineId: string; machine: string; minutes: number; hours: number; events: number }[];
}

export interface DowntimeDetail {
  id: string;
  machine_id: string;
  machine?: string | null;
  down_start?: string | null;
  repaired_at?: string | null;
  downtime_min?: number | null;
  root_cause?: string | null;
  resolution?: string | null;
  prevention?: string | null;
}

/** The plant's cost inputs, as the Rates tab edits them. */
export interface CostRates {
  data: Record<string, number | null>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CostingReport {
  window: { from: string | null; to: string | null };
  autoclaveLoads: number;
  firewoodKg: number;
  revenue: number;
  dispatchedKg: number;
  electricityCost: number;
  labourCost: number;
  conversionCost: number;
  batchCost: number;
  outputKg: number;
  costPerKg: number;
}
