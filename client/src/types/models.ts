/** `md` is the managing director: the two summary screens, and no write. */
export type Role = 'worker' | 'supervisor' | 'lab' | 'manager' | 'admin' | 'md';
export type Shift = 'Day' | 'Night';
export type Quality = 'Special' | 'SuperFine' | 'Fine' | 'Medium' | 'DRC' | 'Special DRC';
export type DispatchGrade = Quality | 'Coarse' | 'Sillsheet';
export type MachineKind =
  | 'grind'
  | 'autoclave'
  | 'prerefiner'
  | 'refiner'
  | 'coarse'
  | 'press'
  /**
   * Sleeve and loop. Their own kinds rather than presses, because what they make
   * is certified a shift at a time under a batch number of their own - a press
   * pools every pack of a product into one row and one verdict, which is far too
   * blunt for goods answered for by the shift. See MOULDING_KINDS.
   */
  | 'sleeve'
  | 'loop';
/** The finer name a machine is listed under. Mirrors MACHINE_TYPES on the server. */
export type MachineType =
  | 'grinder'
  | 'cracker'
  | 'autoclave'
  | 'prerefiner'
  | 'refiner'
  | 'press'
  | 'sleeve'
  | 'loop'
  | 'other';
export type RunStatus = 'running' | 'done';
export type Verdict = 'pass' | 'hold';

export interface User {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  /**
   * The last sign-in on this account, stamped by the server on the login path
   * alone. Null on an account nobody has ever signed in with, and absent from
   * the user the login reply carries - only the back office's list has it.
   */
  last_login_at?: string | null;
  /**
   * The last time this account did anything, stamped by the server on any
   * authenticated request. This is the one that answers "who is on the app",
   * because the phones hold a month-long session and so hardly ever sign in -
   * see the Users page. Null on an account that has not been used since the
   * column was added.
   */
  last_seen_at?: string | null;
  /**
   * When this account last signed out, stamped by the server on the sign-out
   * path. What takes a name off the manager's nav bar the moment somebody goes
   * home, rather than leaving it there until the presence window runs out -
   * see utils/presence. Null on an account that has never signed out, which is
   * the ordinary state of a phone that is simply closed.
   */
  last_logout_at?: string | null;
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
  /**
   * Whether this machine has an electricity meter and an hour meter on it.
   *
   * Null - which is every machine but the one this exists for - means nobody has
   * answered the question, and the machine's `kind` keeps answering it. False
   * means the machine genuinely has neither, whatever its kind: the Soorya
   * Grinder is `kind: 'grind'` like the other two and has no meters at all, so
   * its sheets asked for two readings that do not exist. See migrations/0015.
   */
  meters?: boolean | null;
  /**
   * Whether it is on the greasing schedule. Null falls back to the kind; false
   * keeps it off the Bearing tab, which is the Soorya Grinder again - a grinder
   * with nothing to grease, asking for four temperatures nobody takes.
   */
  bearings?: boolean | null;
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
  /**
   * Whether the item is moulded at all.
   *
   * Cavities and a cycle time are facts about a mould, so a sleeve that is cut
   * rather than moulded is asked for neither on its run sheet - and the expected
   * piece count, which is worked out from both, is simply not reported. Absent
   * reads as true: everything on the list today is something a press moulds.
   */
  moulded?: boolean | null;
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
  /**
   * Machine id -> when that machine first went on this batch, so a picker can
   * say whether PR2 has had it and at what time without loading its runs.
   */
  opened_on?: Record<string, string>;
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
  /** The name the record is signed with - the sheet's pick, which is switchable. */
  supervisor?: string | null;
  /**
   * The account that keyed the start, taken off the access token by the server.
   * Not switchable and not sendable, which is what makes it worth showing beside
   * `supervisor` when the two disagree. Null on every run started before the
   * column existed - see migrations/0013.
   */
  entered_by?: string | null;
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
  /** When the pause it is standing in began - null unless it is paused. */
  paused_at?: string | null;
  /**
   * Every pause already ended, added up, in milliseconds. Banked by the server
   * on each resume, and taken off both the card's timer and the minutes a stop
   * books: a machine stood still is not a machine running.
   */
  paused_ms?: number | null;
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
  /**
   * Whether the boxing just recorded actually reached the yard, answered by the
   * pack route alone.
   *
   * Filing the stock is deliberately not allowed to fail the request - the run
   * is saved and the group is a derived ledger that boxing again puts right -
   * so without this the bench is told the pieces are in stock awaiting the lab
   * whether or not a single row was written. `stock_note` says what went wrong.
   */
  stock_filed?: boolean;
  stock_note?: string | null;
  flash_kg?: number | null;
  compound_rate?: number | null;
  /**
   * A sleeve or loop run, on top of everything a press run carries.
   *
   * `pieces_expected` is what the cycle and the mould said this length of run
   * should have made, worked out and written when the run was logged rather than
   * derived on read - the cycle, the cavities and the run time are all
   * correctable afterwards, and a variance that quietly re-computed itself would
   * stop being a record of what was counted. `pieces_variance_pct` is the gap as
   * a signed percentage, negative for a lot that came up short, and
   * `pieces_flagged` is whether it is wide enough to be worth a look.
   *
   * All null on a product the back office has not measured a cycle or a set of
   * cavities into: nothing was predicted, so nothing is flagged.
   */
  pieces_expected?: number | null;
  pieces_variance_pct?: number | null;
  pieces_flagged?: boolean;
  /**
   * What the crew on the activity came to, and what it cost.
   *
   * A press is not costed on labour - it books no hours for a crew to be spread
   * over - but these are, at the rate that was in force on the day the shift was
   * worked. `labour_rate` is that snapshot, so a raise entered next month prices
   * next month and leaves a closed one closed.
   */
  labour_rate?: number | null;
  labour_hours?: number | null;
  labour_cost?: number | null;
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

/**
 * What taking a test off the record moved, beside the row itself.
 *
 * A verdict is not a fact about a test row; it is a fact about goods, kept on
 * the stock group because a dispatch reads it there and cannot read a test. So
 * deleting the test that released a pallet puts the group back where the tests
 * that remain leave it - the one before this, or the state it would have opened
 * in - and `stock_groups` is which groups that moved.
 *
 * Empty is the ordinary case and not a failure: a verdict on a batch nobody has
 * bagged yet was never carried by a group, so there is none to put back.
 */
export interface RemovedQualityTest {
  id: string;
  batch_no: string | null;
  quality: string | null;
  stock_groups: { id: string; label: string; qc_status: QcStatus }[];
}

/** The whole record of one batch - what the batch detail view is drawn from. */
export interface BatchDetail extends Batch {
  runs: Run[];
  conversions: BatchConversion[];
  qualityTests: QualityTest[];
}

export type QcStatus = 'pass' | 'fail' | 'pending';

/**
 * The four things a stock group can be - the four ways the plant makes goods.
 *
 *   batch    one grade off one special-line batch, certified as a lot.
 *   pool     the coarse line's ten-day period. Not batch-identified.
 *   product  what a press moulded, keyed on the product and the pack it is
 *            boxed in, so every pack of it moves on one verdict.
 *   lot      one shift of sleeve or loop, keyed on its own batch number.
 *            Counted in pieces like a `product` group and certified per label
 *            like a `batch` one, which is why it is neither of them.
 */
export type StockKind = 'batch' | 'pool' | 'product' | 'lot';

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
/**
 * The lab test standing behind a stock group's verdict, as /stock sends it.
 *
 * A narrower thing than QualityTest, and its own type rather than a reuse: this
 * is the yard reading one test the server has already picked - the newest one
 * addressing this group - and it carries none of the Quality tab's machinery for
 * choosing between them or filing another.
 */
export interface StockLabTest {
  id: string;
  kind: string;
  verdict: Verdict | null;
  /** What it was filed against: the batch, and the grade or the product. */
  batch_no?: string | null;
  quality?: string | null;
  params?: QualityParam[];
  tested_at?: string | null;
  tested_by?: string | null;
  remarks?: string | null;
  /** The report sheet, once the bench has photographed or uploaded it. */
  attachment_url?: string | null;
  attachment_name?: string | null;
}

export interface StockGroup {
  id: string;
  kind: StockKind;
  label: string;
  display_label: string;
  /** The grade on a batch or pool, and the product's id on a moulded group. */
  quality: DispatchGrade | string | null;
  product_id?: string | null;
  /**
   * The batch number the goods carry, where they carry one.
   *
   * On a `lot` it is the shift it was made on - `03/Aug/26-day` - and half of
   * what identifies the lot; the product beside it is the other half. On a
   * `batch` group it is the batch, which the label also says. Null on a pool and
   * on a press's product group, neither of which is batch-identified.
   *
   * Cards show this and the product side by side rather than the label, which is
   * a key rather than something to read. See StockPage.
   */
  batch_no?: string | null;

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
  /**
   * The test the verdict above was made on, or null while nobody has tested it.
   *
   * Null is a real state rather than a gap in the response: an untested batch
   * sits `pending`, a pool nobody has sampled sells on the `pass` it opened
   * with, and a group the back office released by hand has a verdict with no
   * test under it at all - which is exactly what `qc_source` is for.
   */
  lab_test?: StockLabTest | null;

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
  /** The shift a lot was made on, or the batch behind a batch group. */
  batch_no?: string | null;
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
  /**
   * Which of the two it is, and therefore how a verdict on it has to be filed:
   * a `product` group is addressed by its product and moves every pack of it,
   * a `lot` is addressed by its batch number - which is its label - and moves
   * that shift alone.
   */
  kind: StockKind;
  label: string;
  display_label: string;
  /** The product - what a verdict on moulded goods is filed against. */
  product_id: string | null;
  /**
   * The shift a lot was made on, and the other half of what a lot verdict has to
   * name - the product alone would move every shift of it. Null on a press's
   * group, which is addressed by the product and pools every shift.
   */
  batch_no?: string | null;
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
 * One metric on an efficiency card, and the manager's ideal for it.
 *
 * There used to be a second comparison here - `baseline`, the plant's own median
 * for the same figure - and it is gone. A median answers "is this shift worse
 * than usual" and cannot answer "is usual any good", and it moves: a bad month
 * lowered the bar the next month was judged by, so the same figure could be a
 * miss in March and a pass in June. A screen that asks a supervisor to explain a
 * shortfall has to be able to say what the shortfall was measured against and
 * have that answer still be true next quarter.
 *
 * `calc` is the arithmetic spelled out, so the screen can show its working
 * instead of asking anyone to take the number on trust.
 */
export interface EfficiencyMetric {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  /**
   * Descriptive text under the figure - the crew and hours behind it, the shifts
   * a day's figure folds up. Context only: nothing here is a comparison, and
   * nothing here is what the metric is flagged against.
   */
  context?: string | null;
  /**
   * What the figure covers: the whole day, or the picked shift.
   *
   * A grinder card carries both at once - energy and labour over the day, output
   * and utilisation over the shift - so the span cannot be left to the group
   * heading. Drawn as a tag beside the name rather than appended to it, because
   * "Production / man-hour · day" reads as the name of the metric.
   */
  span?: 'day' | 'shift' | null;
  /**
   * Which side of the ideal is the good side.
   *
   * More kg per man-hour is better; fewer kWh per kg is better. Both can sit
   * above their target on the same card with only one of them in trouble, so the
   * sign of the variance is not the verdict and must not be drawn as one.
   */
  lowerIsBetter?: boolean;
  /**
   * A flag that is not about the manager's ideal. Only utilisation raises one -
   * it is measured against the twelve hours of the shift itself - and
   * `warnLabel` is what the pill says, so the screen never has to guess which
   * kind of flag it is showing.
   */
  warn: boolean;
  warnLabel?: string | null;
  /**
   * The manager's benchmark for this figure, and how far off it the shift came.
   * This is what the screen flags on.
   *
   * `ideal` is null when nothing has been set, which is not the same as a target
   * of zero - so `offTarget` stays false rather than flagging every line in a
   * plant that has never filled the sheet in.
   *
   * `parameter` is the key a reason for the miss is filed under, and null says
   * something different from an unset `ideal`: null means this figure is not one
   * a target is set against at all - a grade's output is the case, since the
   * split between grades follows demand. A set `parameter` with a null `ideal`
   * means a target belongs here and nobody has filled it in, which is worth
   * nagging a manager about.
   */
  ideal?: number | null;
  variance?: number | null;
  variancePct?: number | null;
  offTarget?: boolean;
  parameter?: string | null;
  idealLabel?: string | null;
  calc: {
    title: string;
    formula: string;
    lines: string[];
    result: string;
    note: string;
  } | null;
}

/** A machine with no entry on a shift, and the breakdown covering it if any. */
export interface UnloggedMachine {
  machineId: string;
  machine: string;
  group?: string | null;
  kind?: string | null;
  breakdown?: {
    id: string;
    downStart?: string | null;
    repairedAt?: string | null;
    rootCause?: string | null;
    open: boolean;
  } | null;
  /** Nothing logged and no breakdown against it - this is what gets chased. */
  needsAnswer: boolean;
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
  workers?: number | null;
  hours?: number | null;
  /** Coarse and autoclave cards name themselves - they are neither. */
  label?: string;
  line?: string;
  /** What the whole day made on this line, which is what the comparison is of. */
  dayOut?: number | null;
  dayShifts?: number;
  /** "2 shifts · 2,263 kg" — what a day figure is folded out of, said once. */
  dayNote?: string | null;
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

/**
 * Why an actual missed the manager's ideal.
 *
 * Kept apart from EfficiencyNote above, which is a free note against a card. A
 * row here answers for a named target with the two figures it was missed by, and
 * `ideal` and `actual` are those figures as they stood when the reason was
 * written - so a benchmark raised later does not rewrite what was explained.
 */
export interface VarianceReason {
  id: string;
  shift_date: string;
  shift?: string | null;
  parameter: string;
  label?: string | null;
  ideal?: number | null;
  actual?: number | null;
  reason: string;
  entered_by?: string | null;
  created_at?: string;
  /**
   * The sign-off. A null `approved_at` means nobody has looked yet, which is a
   * different sentence from rejected - there is no reject and no un-approve.
   *
   * `manager_note` sits beside the shift's own words, never over them. These
   * records are read back when an incentive is being argued over, and a
   * manager's sentence must not be mistakable for the supervisor's.
   */
  approved_at?: string | null;
  approved_by?: string | null;
  manager_note?: string | null;
}

export interface ShiftEfficiency {
  date: string | null;
  shift: string | null;
  totals: { runs: number; outKg: number | null; kwh: number | null };
  refiners: EfficiencyCard[];
  grinders: EfficiencyCard[];
  /** The coarse line, one card for the line - only R2 weighs. */
  coarse: EfficiencyCard[];
  /** Charges per vessel per day, which is the only count that is shift-proof. */
  autoclaves: EfficiencyCard[];
  yields: EfficiencyCard[];
  /**
   * Machines with nothing at all against this shift.
   *
   * Every machine is meant to be accounted for on every shift: it ran, or it was
   * down, and either way somebody said so. An absent row says neither, and a
   * screen that simply leaves the card out looks the same as a plant with
   * nothing to answer for.
   */
  unlogged?: UnloggedMachine[];
  notes: EfficiencyNote[];
  varianceReasons: VarianceReason[];
  /** Whether any benchmark has been set at all - "no target yet" is not "on target". */
  idealsSet?: boolean;
  /** The utilisation cut-off, and now nothing else - see EfficiencyMetric.warn. */
  thresholds: { utilisation: number };
}

/** The manager's benchmarks, as the Rates tab edits them. */
export interface IdealValues {
  data: Record<string, number | null>;
  updatedAt: string | null;
  updatedBy: string | null;
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
