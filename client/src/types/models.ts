export type Role = 'worker' | 'supervisor' | 'lab' | 'manager' | 'admin';
export type Shift = 'Day' | 'Night';
export type Quality = 'Special' | 'SuperFine' | 'Fine' | 'Medium' | 'DRC';
export type DispatchGrade = Quality | 'Coarse' | 'Sillsheet';
export type MachineKind = 'grind' | 'autoclave' | 'prerefiner' | 'refiner' | 'coarse' | 'press';
/** The finer name a machine is listed under. Mirrors MACHINE_TYPES on the server. */
export type MachineType =
  | 'grinder'
  | 'cracker'
  | 'autoclave'
  | 'prerefiner'
  | 'refiner'
  | 'press'
  | 'other';
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
  /**
   * The finer name the back office lists this under - a cracker and a grinder
   * are both `kind: 'grind'` to the run rules and two different machines to
   * anyone standing in front of them - and, on a press, the platen it moulds on.
   * The platen figures are null on everything that is not a press.
   */
  type?: MachineType | null;
  platen_length_mm?: number | null;
  platen_width_mm?: number | null;
  platen_count?: number | null;
  capacity_kg?: number | null;
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

  /**
   * The other half of a product record: what it is ordered under, what it ships
   * as, which machine it comes off, and the cost inputs behind a unit of it.
   * Every one may be null - the plant has not measured all of them into this
   * system, and the table says "not set" rather than inventing a figure.
   */
  code?: string | null;
  quality?: DispatchGrade | null;
  pack_size_kg?: number | null;
  /**
   * How a moulded product is boxed, and what one piece weighs.
   *
   * `pack_size_kg` above is a different figure - what a sack of a reclaim grade
   * weighs - because a moulded product is not sold by weight at all: it is sold
   * by the piece, boxed some number at a time. So `pack_size` is a count of
   * pieces, and `pack_label` is what the box is called on the floor.
   *
   * Both may be unset. The presses run whether or not the back office has filled
   * them in - the yard then shows the pieces as loose and says so, rather than a
   * shift's moulding being stranded for want of a settings field. `piece_kg`
   * unset means moulded stock reports no weight, which is honest.
   */
  pack_size?: number | null;
  pack_label?: string | null;
  piece_kg?: number | null;
  machine_id?: string | null;
  raw_material_cost?: number | null;
  firewood_cost?: number | null;
  power_kwh?: number | null;
  labour_cost?: number | null;
  machine_hours?: number | null;
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
  /**
   * Packed stock, as /runs/packed reports it: how many of the sacks bagged off
   * this run have already gone out, and what is still in the yard. Derived per
   * read from the dispatches tied back to the run, so they are only ever set on
   * that list.
   */
  dispatched_sacks?: number | null;
  avail_sacks?: number | null;
  avail_kg?: number | null;
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
  /**
   * How many of those pieces have been boxed and filed into the yard - the
   * mirror of `packed_sacks` on a bagged run. Null while nobody has been to the
   * boxing bench, which is a different state from "boxed, and it came to none".
   */
  packed_pieces?: number | null;
  flash_kg?: number | null;
  compound_rate?: number | null;
  /**
   * What that came to, derived by the API on every read: compound on the weight
   * plus the flash, spread over the pieces made. Null while the product has no
   * rate against it, or before the run has been stopped.
   */
  material_cost?: number | null;
  cost_per_piece?: number | null;
  /**
   * The picking gang on a cracker shift: how many hands were put on pulling
   * scrap tyres out of the yard, and roughly how long they were at it.
   *
   * Only the cracker records it - picking is what feeds the cracker - and it is
   * an estimate the supervisor gives at the end of the shift rather than a
   * clocked figure. `picking_labour_hours` is the two multiplied out, derived by
   * the API so no screen has to do it and get it slightly differently. All three
   * are null on every run that never picked, which is not the same as a zero.
   */
  picking_labourers?: number | null;
  picking_hours?: number | null;
  picking_labour_hours?: number | null;
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
  /**
   * The stock group this verdict moved, or null if it moved none.
   *
   * Null is not an error. A verdict releases stock that already exists and does
   * not create any, so passing a batch nobody has bagged yet moves nothing -
   * which is correct, and looks exactly like a broken app from the bench unless
   * the screen says so.
   */
  stock_released?: {
    id: string;
    label: string;
    display_label: string;
    /** What is left, and what it counts - a moulded group answers in pieces. */
    unit?: StockUnit;
    available_qty?: number;
    available_sacks: number;
    qc_status: QcStatus;
  } | null;
}

/** The whole record of one batch - what the batch detail view is drawn from. */
export interface BatchDetail extends Batch {
  runs: Run[];
  conversions: BatchConversion[];
  qualityTests: QualityTest[];
}

export type QcStatus = 'pass' | 'fail' | 'pending';

/** The three things a stock group can be - the three ways the plant makes goods. */
export type StockKind = 'batch' | 'pool' | 'product';

/**
 * What a stock count counts.
 *
 * Reclaim and coarse are bagged, so they are sacks. A press moulds finished
 * goods and counts them one at a time, so they are pieces. The number is in the
 * same field either way and this is what says what it means, so nothing on a
 * screen should print a count without reading it.
 */
export type StockUnit = 'sacks' | 'pieces';

/**
 * Where a verdict came from. `lab` is one pushed across from a test filed at the
 * bench; `manual` is the back office setting the status directly. Both are
 * legitimate and they are not the same event - one has a test row behind it.
 */
export type QcSource = 'lab' | 'manual';

/**
 * What packing files stock into, and what a dispatch draws it out of.
 *
 * A special-line batch makes a group per grade it yielded, keyed on the batch
 * number. Coarse output is not batch-identified - the line runs for a shift, not
 * for a batch - so its sacks are pooled by the ten-day period they were packed
 * in, and the pool's label is worked out on the server from the packing date. A
 * moulding press makes a group per product and pack, counted in pieces.
 * `label` is the stored one; `display_label` is what the yard reads, AUG-H2.
 */
export interface StockGroup {
  id: string;
  kind: StockKind;
  label: string;
  display_label: string;
  /** The grade on a batch or pool, and the product's id on a moulded group. */
  quality: DispatchGrade | string | null;
  product_id?: string | null;

  /** What the counts count. Everything printing one has to read this first. */
  unit: StockUnit;
  /**
   * The counts, under both names. `packed_sacks` is what the column is called
   * and what this app has always asked for; `packed_qty` is what it means once a
   * group can be pieces. They are the same number, not two figures.
   */
  packed_sacks: number;
  dispatched_sacks: number;
  available_sacks: number;
  packed_qty: number;
  dispatched_qty: number;
  available_qty: number;

  /** Pieces to a pack on a moulded group, and what the counts come to in packs. */
  pack_size?: number | null;
  packed_packs?: number | null;
  available_packs?: number | null;

  /** What one of them weighs, and what the counts therefore weigh. Null if unset. */
  kg_per_unit?: number | null;
  packed_kg?: number | null;
  available_kg?: number | null;

  qc_status: QcStatus;
  /** Who put it on that verdict, when, and whether it came from the bench. */
  qc_by?: string | null;
  qc_at?: string | null;
  qc_source?: QcSource | null;

  /** The span it was packed across - a pool runs ten days, a batch a shift. */
  first_packed_on?: string | null;
  last_packed_on?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  created_at?: string | null;
}

/**
 * The shop floor's copy of the same row, as /stock/summary sends it.
 *
 * These fields are the whole response, not a subset the screen chose to draw:
 * the server builds this shape with its own serializer, so a price or a customer
 * is absent from the body rather than merely unrendered. Kept as its own type
 * for the same reason - a StockGroup with fields marked optional would invite
 * reading one where the other is all there is.
 *
 * It carries the physical facts about the goods and none of the commercial ones:
 * what is left, in what unit, what it weighs and when it was packed, but not the
 * packed/dispatched split and not who signed the verdict off.
 */
export interface StockSummaryRow {
  /** The group's key - what a dispatch line names. Carries nothing else. */
  id: string;
  kind: StockKind;
  label: string;
  quality: DispatchGrade | string | null;
  unit: StockUnit;
  available_sacks: number;
  available_qty: number;
  available_packs?: number | null;
  pack_size?: number | null;
  available_kg?: number | null;
  qc_status: QcStatus;
  first_packed_on?: string | null;
  last_packed_on?: string | null;
}

/**
 * One sample taken from a coarse pool. Thinner than a QualityTest because that
 * is all the pools endpoint sends - a reading and who took it, with no batch
 * anywhere, because a pool has none.
 */
export interface PoolSample {
  id: string;
  verdict: Verdict;
  grade: DispatchGrade;
  params?: QualityParam[];
  tested_at?: string | null;
  tested_by?: string | null;
  /** The day the sample was taken - what decides which slot it lands in. */
  sampled_on?: string | null;
  remarks?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
}

/**
 * One of a pool's three sample points, and whatever has been filed against it.
 *
 * `test` is null while nobody has sampled that stretch of the period. That is
 * the point of numbering them: a sample never taken shows as an empty slot
 * rather than as an absence nobody can see.
 */
export interface PoolSlot {
  slot: 1 | 2 | 3;
  from: string;
  to: string;
  test: PoolSample | null;
}

/**
 * A coarse pool as the lab and the yard both read it.
 *
 * Coarse is not batch-identified - the line runs for a shift, not for a batch,
 * and the volumes are too large to name a pallet by - so it is pooled into
 * ten-day thirds of the month and the period is sampled three times instead of
 * a lot being certified. Absence is not refusal - a pool nobody has sampled
 * still sells, because coarse goes out on the line running to specification
 * rather than on a certificate per pool - but a hold is: holding any sample
 * stops the whole period until a later one passes.
 */
export interface StockPool {
  id: string;
  label: string;
  display_label: string;
  quality: DispatchGrade | null;
  unit?: StockUnit;
  available_sacks: number;
  packed_sacks: number;
  available_kg?: number | null;
  qc_status: QcStatus;
  period_start?: string | null;
  period_end?: string | null;
  slots: PoolSlot[];
  samples_taken: number;
  samples_total: number;
  /** Any sample that came back a hold - the thing worth acting on. */
  any_hold: boolean;
}

/**
 * What a press made, as the lab's own list sends it.
 *
 * The bench's third list, beside the batches it tests and the coarse pools it
 * samples - and the only way it can reach moulded goods at all, because a
 * moulded group is keyed on the product and the pack it was boxed in and so
 * appears on neither of the others.
 *
 * Thinner than a StockGroup and deliberately so: stock and verdicts, with no
 * price, no customer and no packed-against-dispatched split. That is what makes
 * it safe in front of the lab, on the same reasoning as the pool list.
 */
export interface MouldedStock {
  id: string;
  label: string;
  display_label: string;
  /** The product - what a verdict on moulded goods is filed against. */
  product_id: string | null;
  quality: string | null;
  unit: StockUnit;
  available_qty: number;
  available_packs?: number | null;
  pack_size?: number | null;
  available_kg?: number | null;
  qc_status: QcStatus;
  qc_by?: string | null;
  qc_at?: string | null;
  qc_source?: QcSource | null;
  first_packed_on?: string | null;
  last_packed_on?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  region?: string | null;
  active: boolean;
  created_at?: string | null;
}

/** One priced row of a dispatch: which group it drew from, and at what. */
export interface DispatchLine {
  id: string;
  stock_group_id: string;
  /** The group's label as the yard reads it - AUG-H2, B1041-Fine, or LOOP-50. */
  label: string | null;
  /** The grade, or the product on a moulded line. */
  quality: DispatchGrade | string | null;
  /** What the quantity counts, and the quantity - `sacks` is the older name. */
  unit?: StockUnit;
  qty?: number;
  sacks: number;
  kg?: number;
  unit_price: number;
  line_total: number;
  /** This line's share of the one loading job, split by kg. */
  loading_share?: number;
  /** What the reclaim on this line cost to make, frozen at the batch. Null on a pool. */
  reclaim_cost?: number | null;
}

/** How the crew that loaded a vehicle was paid. */
export type LoadingMode = 'contract' | 'manhour' | 'mixed';

/** What was loaded. Moulded goods have no per-kg contract, so they are man-hour only. */
export type LoadingMaterial = 'reclaim' | 'moulded';

/**
 * One loading job - one truck - and what it cost.
 *
 * Both rates are snapshots taken when the entry was written, never a current
 * lookup: revising a rate in the settings prices the next job and leaves every
 * job already done exactly where it was.
 */
export interface LoadingActivity {
  id: string;
  dispatch_id: string;
  loading_mode: LoadingMode;
  material_kind: LoadingMaterial;
  kg_loaded: number;
  contract_rate_per_kg: number;
  manhour_labourers: number;
  manhour_hours: number;
  daily_labour_rate: number;
  contract_cost: number;
  manhour_cost: number;
  loading_cost: number;
  vehicle_no?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  /** False when the job recorded no labour at all - flagged rather than hidden. */
  has_labour: boolean;
}

/**
 * A posted dispatch. Written once and never edited: a load that went out wrong
 * is corrected by a reversal document and a fresh dispatch, so there is no
 * update path here and none on the server either.
 */
/**
 * One line of "what has gone out lately" - the header with its lines summed,
 * not the document. The lines themselves are fetched by tapping it.
 */
export interface DispatchSummary {
  id: string;
  dispatch_date: string | null;
  customer: string | null;
  vehicle: string | null;
  sacks: number;
  /**
   * Moulded goods on the same document, counted in their own unit. Kept apart
   * from the sacks rather than added to them: forty sacks plus four thousand
   * loops is arithmetic on two different quantities.
   */
  pieces?: number;
  /**
   * What went, split by grade or product. A load is one row and usually more
   * than one product, so a bare count says how much left without saying what.
   */
  sacks_by_quality?: Record<string, number>;
  /** How many stock groups this vehicle was loaded off. */
  lines: number;
  goods_total: number;
  transport_charge: number;
  total: number;
  loading_mode?: LoadingMode | null;
  loading_cost?: number;
  /**
   * False on a load with no labour recorded against it at all. A real thing -
   * the customer's own crew loading their own vehicle - and also what a form
   * tabbed through looks like, so it is flagged rather than assumed either way.
   */
  labour_recorded?: boolean;
  remarks?: string | null;
  created_at?: string | null;
}

export interface DispatchDoc {
  id: string;
  customer_id: string | null;
  dispatch_date: string | null;
  transport_provided: boolean;
  transport_charge: number;
  remarks?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  /** Bagged sacks on the document, and moulded pieces, counted apart. */
  sacks: number;
  pieces?: number;
  kg?: number;
  goods_total: number;
  total: number;
  lines: DispatchLine[];
  /** On a customer's history: the sacks that went out, split by grade. */
  sacks_by_quality?: Record<string, number>;

  /** What it cost to put this load on a truck. Null when none was recorded. */
  loading?: LoadingActivity | null;
  loading_cost?: number;
  labour_recorded?: boolean;
  /**
   * Goods, less what the reclaim cost to make and what it cost to serve:
   *
   *   margin = goods - kg x the batch's frozen rupees-per-kg - loading - transport
   *
   * Null when any line's batch cost is unknown - a coarse pool has no batch
   * behind it - because a margin missing a term reads as a thin one and
   * somebody acts on it.
   */
  reclaim_cost?: number | null;
  margin?: number | null;
  /** Goods less the costs to serve alone, which is always knowable. */
  contribution?: number;
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

/** One feedstock the grinding line ran on, and what its crumb cost in rubber. */
export interface CrumbFeedstock {
  tyre_type: string | null;
  kg: number;
  rate: number;
  cost: number;
}

/** What one machine on the grinding line contributed to the crumb it made. */
export interface CrumbMachine {
  machineId: string;
  machine: string;
  runs: number;
  crumbKg: number;
  kwh: number;
  crewHours: number;
  pickingHours: number;
  cost: number;
}

/**
 * What a kg of the plant's own crumb cost to make, and what the autoclaves ate
 * of it. Worked out from the grinding line's runs rather than typed in:
 *
 *   perKg = materialPerKg (the rubber, at the feedstock's crumb rate)
 *         + worksPerKg    (electricity + the crews + the picking gang, over the
 *                          crumb the line weighed)
 *
 * Picking is inside `worksPerKg`, not beside it - which is the point. A heavier
 * picking shift raises the crumb rate, which raises what the autoclave charge
 * cost, which raises the cost of the reclaim, with nothing to remember. See
 * server/src/services/crumb.service.js.
 */
export interface CrumbCosting {
  runs: number;
  crumbKg: number;
  feedstock: CrumbFeedstock[];
  materialCost: number;
  materialPerKg: number | null;
  kwh: number;
  kwhRate: number;
  energyCost: number;
  labourRate: number;
  crewHours: number;
  crewCost: number;
  /** Stated on its own so it can be seen - and already inside `worksCost`. */
  pickingHours: number;
  pickingCost: number;
  pickingPerKg: number | null;
  worksCost: number;
  worksPerKg: number | null;
  perKg: number | null;
  machines: CrumbMachine[];
  /** False where there is no crumb weighed, or no rates to price it at. */
  priced: boolean;
  /** The charge the autoclaves took in the window, costed at `perKg`. */
  autoclave: { loads: number; chargeKg: number; crumbCost: number | null };
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
  crumb: CrumbCosting;
}
