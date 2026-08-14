/// The API's shapes, as this app reads them.
///
/// A port of client/src/types/models.ts, narrowed to what the Supervisor app
/// actually touches: the lab's own types (QualityTest, StockPool samples beyond
/// their counts, MouldedStock) stay in the React website with the Quality
/// module. Every field name below is the JSON the Node API already sends -
/// nothing is renamed on the way in, so a server change surfaces here rather
/// than being silently absorbed.
library;

// ------------------------------------------------------------- helpers -----

num? _num(dynamic v) {
  if (v == null) return null;
  if (v is num) return v;
  return num.tryParse(v.toString());
}

int? _int(dynamic v) => _num(v)?.round();
double? _dbl(dynamic v) => _num(v)?.toDouble();
String? _str(dynamic v) => v?.toString();
bool _bool(dynamic v, [bool fallback = false]) =>
    v is bool ? v : (v == null ? fallback : v.toString() == 'true');

List<String> _strList(dynamic v) => v is List
    ? v.where((e) => e != null).map((e) => e.toString()).toList()
    : const [];

List<double> _numList(dynamic v) => v is List
    ? v.map(_dbl).whereType<double>().toList()
    : const [];

/// A JSON object of plain string values - a keyed lookup the API hands over as
/// one field, like the stage times against a batch. Entries with no value are
/// dropped rather than kept as an empty string, so a caller can ask `[id] ==
/// null` and mean "that machine has not had it".
Map<String, String> _strMap(dynamic v) => v is Map
    ? {
        for (final e in v.entries)
          if (e.value != null) e.key.toString(): e.value.toString(),
      }
    : const {};

Map<String, dynamic> _map(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

// ---------------------------------------------------------------- user -----

class User {
  const User({
    required this.id,
    required this.name,
    required this.role,
    required this.active,
  });

  final String id;
  final String name;
  final String role;
  final bool active;

  factory User.fromJson(Map<String, dynamic> j) => User(
    id: _str(j['id']) ?? '',
    name: _str(j['name']) ?? '',
    role: _str(j['role']) ?? 'worker',
    active: _bool(j['active'], true),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'role': role,
    'active': active,
  };
}

// ------------------------------------------------------------- machine -----

class Machine {
  const Machine({
    required this.id,
    required this.name,
    required this.short,
    required this.kind,
    required this.groupName,
    required this.enabled,
    this.accent,
    this.capacity,
    this.needsQuality = false,
    this.weigh = false,
    this.outWeight = false,
    this.tyre = false,
    this.defTyre,
    this.sub,
    this.type,
    this.sortOrder,
  });

  final String id;
  final String name;
  final String short;

  /// grind | autoclave | prerefiner | refiner | coarse | press | sleeve | loop
  final String kind;
  final String groupName;
  final bool enabled;
  final String? accent;
  final num? capacity;

  /// The machine records a grade of its own, so its start sheet asks for one.
  final bool needsQuality;

  /// Weighed at the sheet, rather than sent to the Weigh tab.
  final bool weigh;

  /// Output is weighed shiftwise, in the Weigh tab after stopping.
  final bool outWeight;

  /// Runs on a tyre feedstock, and which one it is set up for by default.
  final bool tyre;
  final String? defTyre;
  final String? sub;
  final String? type;
  final int? sortOrder;

  factory Machine.fromJson(Map<String, dynamic> j) => Machine(
    id: _str(j['id']) ?? '',
    name: _str(j['name']) ?? '',
    short: _str(j['short']) ?? _str(j['name']) ?? '',
    kind: _str(j['kind']) ?? '',
    groupName: _str(j['group_name']) ?? 'Machines',
    enabled: _bool(j['enabled'], true),
    accent: _str(j['accent']),
    capacity: _num(j['capacity']),
    needsQuality: _bool(j['needs_quality']),
    weigh: _bool(j['weigh']),
    outWeight: _bool(j['out_weight']),
    tyre: _bool(j['tyre']),
    defTyre: _str(j['def_tyre']),
    sub: _str(j['sub']),
    type: _str(j['type']),
    sortOrder: _int(j['sort_order']),
  );
}

// ------------------------------------------------------------- product -----

/// What a moulding press moulds. Every figure may be null: the plant has not
/// measured them all into this system, and the sheets say "not set" rather than
/// inventing one.
class Product {
  const Product({
    required this.id,
    required this.name,
    required this.active,
    this.cureTempC,
    this.cyclicMin,
    this.cavities,
    this.moulded,
    this.compoundRate,
    this.note,
    this.packSize,
    this.packLabel,
    this.pieceKg,
  });

  final String id;
  final String name;
  final bool active;

  /// Held on the platen, in °C - shown at the run, never typed.
  final num? cureTempC;

  /// The cure in minutes, pre-filled at the run and editable for that run.
  final num? cyclicMin;

  /// Pieces the mould makes per cycle.
  final int? cavities;

  /// Whether the item is moulded at all. Absent reads as true.
  final bool? moulded;
  final num? compoundRate;
  final String? note;
  final int? packSize;
  final String? packLabel;
  final num? pieceKg;

  bool get isMouldedItem => moulded != false;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
    id: _str(j['id']) ?? '',
    name: _str(j['name']) ?? '',
    active: _bool(j['active'], true),
    cureTempC: _num(j['cure_temp_c']),
    cyclicMin: _num(j['cyclic_min']),
    cavities: _int(j['cavities']),
    moulded: j['moulded'] == null ? null : _bool(j['moulded'], true),
    compoundRate: _num(j['compound_rate']),
    note: _str(j['note']),
    packSize: _int(j['pack_size']),
    packLabel: _str(j['pack_label']),
    pieceKg: _num(j['piece_kg']),
  );
}

// --------------------------------------------------------------- batch -----

/// One row of the batch card's grade grid: whether the batch was marked as
/// yielding this grade, and how far that grade has got. The three stages are
/// derived by the API from the runs logged against the batch number.
class BatchGrade {
  const BatchGrade({
    required this.quality,
    required this.marked,
    required this.refined,
    required this.finished,
    required this.weighed,
    this.kg,
  });

  final String quality;
  final bool marked;
  final bool refined;
  final bool finished;
  final bool weighed;
  final num? kg;

  factory BatchGrade.fromJson(Map<String, dynamic> j) => BatchGrade(
    quality: _str(j['quality']) ?? '',
    marked: _bool(j['marked']),
    refined: _bool(j['refined']),
    finished: _bool(j['finished']),
    weighed: _bool(j['weighed']),
    kg: _num(j['kg']),
  );

  static BatchGrade blank(String quality) => BatchGrade(
    quality: quality,
    marked: false,
    refined: false,
    finished: false,
    weighed: false,
  );
}

/// Material moved from one grade to another partway through a batch.
class BatchConversion {
  const BatchConversion({
    required this.id,
    this.fromQuality,
    this.toQuality,
    this.qtyKg,
    this.stage,
  });

  final String id;
  final String? fromQuality;
  final String? toQuality;
  final num? qtyKg;
  final String? stage;

  factory BatchConversion.fromJson(Map<String, dynamic> j) => BatchConversion(
    id: _str(j['id']) ?? '',
    fromQuality: _str(j['from_quality']),
    toQuality: _str(j['to_quality']),
    qtyKg: _num(j['qty_kg']),
    stage: _str(j['stage']),
  );
}

/// One autoclave charge, from the load that opened it to the close that files
/// it away. A batch is never created on its own - loading an autoclave is what
/// opens one.
class Batch {
  const Batch({
    required this.id,
    required this.ref,
    required this.machineId,
    required this.status,
    this.formulation,
    this.line,
    this.capacity,
    this.grade,
    this.paired = false,
    this.workers,
    this.autoclaveDone = false,
    this.shift,
    this.shiftDate,
    this.openedAt,
    this.openedBy,
    this.loadedAt,
    this.unloadedAt,
    this.grades = const [],
    this.preRefiners = const [],
    this.openedOn = const {},
    this.runsCount,
    this.markedCount,
    this.weighedCount,
    this.stateLabel,
    this.orphaned = false,
    this.weighedKg,
    this.yieldPct,
    this.packedSacks,
  });

  final String id;
  final String ref;
  final String machineId;
  final String status;
  final String? formulation;
  final String? line;
  final num? capacity;
  final String? grade;
  final bool paired;
  final int? workers;

  /// Set by unloading the autoclave. Until then no refiner can pick it up.
  final bool autoclaveDone;
  final String? shift;
  final String? shiftDate;
  final String? openedAt;
  final String? openedBy;
  final String? loadedAt;
  final String? unloadedAt;

  /// The grade x stage grid, one row per quality the plant makes.
  final List<BatchGrade> grades;

  /// Which pre-refiners broke this charge down.
  final List<String> preRefiners;

  /// Machine id -> when that machine first went on this batch, so a picker can
  /// say whether PR2 has had it and at what time without loading its runs.
  final Map<String, String> openedOn;
  final int? runsCount;
  final int? markedCount;
  final int? weighedCount;

  /// Loaded -> In autoclave -> mark qualities -> n/m weighed.
  final String? stateLabel;

  /// Out of the vessel, yet nothing was ever logged against it.
  final bool orphaned;
  final num? weighedKg;
  final num? yieldPct;
  final int? packedSacks;

  /// The grid row for a grade, in the plant's grade order rather than the
  /// API's. Only ever asked for a [batchQualities] grade.
  BatchGrade gradeRow(String quality) => grades.firstWhere(
    (g) => g.quality == quality,
    orElse: () => BatchGrade.blank(quality),
  );

  /// The same batch with one grade ticked or unticked, worked out here so the
  /// whole card can move under the thumb rather than a round trip later.
  ///
  /// This mirrors `lifecycleOf()` in server/src/services/batch.service.js, and
  /// it has to mirror all of it: a tick changes the grade's own box, the marked
  /// count, the weighed count and the state chip, and moving only some of those
  /// leaves the card contradicting itself until the answer lands - a tick that
  /// is on beside a chip that still reads "mark qualities".
  ///
  /// What it does NOT touch is the three stage columns. `refined`, `finished`
  /// and `weighed` are worked out on the server from the runs logged against
  /// the batch number, and ticking a grade logs no run - so a client moving
  /// them would be inventing plant history. They still appear to light up on a
  /// tick, because the grid draws them as `marked && refined`: the stage was
  /// already reached, the tick is what lets it show.
  ///
  /// See BatchesStore.setQuality, which puts all of this back if the write is
  /// refused.
  Batch withGradeMarked(String quality, bool marked) {
    final next = <BatchGrade>[];
    var found = false;
    for (final g in grades) {
      if (g.quality != quality) {
        next.add(g);
        continue;
      }
      found = true;
      next.add(
        BatchGrade(
          quality: g.quality,
          marked: marked,
          refined: g.refined,
          finished: g.finished,
          weighed: g.weighed,
          kg: g.kg,
        ),
      );
    }
    // A grade the API left out of `grades` is one nothing has been logged
    // against yet - ticking it is how it first appears.
    if (!found) {
      next.add(
        BatchGrade(
          quality: quality,
          marked: marked,
          refined: false,
          finished: false,
          weighed: false,
        ),
      );
    }

    // Derived from the grid rather than nudged by one, which is what the server
    // does - and it is the difference between the Weighed column agreeing with
    // the button under it and the two disagreeing for a round trip.
    final markedRows = next.where((g) => g.marked).toList();
    final weighedRows = markedRows.where((g) => g.weighed).length;

    // Only the two branches a tick can reach. A batch still in the vessel
    // cannot be ticked at all - the card refuses it and says to unload the
    // autoclave first - so "Loaded" and "In autoclave" are left exactly as the
    // server sent them.
    final label = autoclaveDone
        ? (markedRows.isEmpty
              ? 'mark qualities'
              : '$weighedRows/${markedRows.length} weighed')
        : stateLabel;

    return Batch(
      id: id,
      ref: ref,
      machineId: machineId,
      status: status,
      formulation: formulation,
      line: line,
      capacity: capacity,
      grade: grade,
      paired: paired,
      workers: workers,
      autoclaveDone: autoclaveDone,
      shift: shift,
      shiftDate: shiftDate,
      openedAt: openedAt,
      openedBy: openedBy,
      loadedAt: loadedAt,
      unloadedAt: unloadedAt,
      grades: next,
      preRefiners: preRefiners,
      openedOn: openedOn,
      runsCount: runsCount,
      markedCount: markedRows.length,
      weighedCount: weighedRows,
      stateLabel: label,
      orphaned: orphaned,
      weighedKg: weighedKg,
      yieldPct: yieldPct,
      packedSacks: packedSacks,
    );
  }

  factory Batch.fromJson(Map<String, dynamic> j) => Batch(
    id: _str(j['id']) ?? '',
    ref: _str(j['ref']) ?? '',
    machineId: _str(j['machine_id']) ?? '',
    status: _str(j['status']) ?? 'open',
    formulation: _str(j['formulation']),
    line: _str(j['line']),
    capacity: _num(j['capacity']),
    grade: _str(j['grade']),
    paired: _bool(j['paired']),
    workers: _int(j['workers']),
    autoclaveDone: _bool(j['autoclave_done']),
    shift: _str(j['shift']),
    shiftDate: _str(j['shift_date']),
    openedAt: _str(j['opened_at']),
    openedBy: _str(j['opened_by']),
    loadedAt: _str(j['loaded_at']),
    unloadedAt: _str(j['unloaded_at']),
    grades: (j['grades'] as List? ?? [])
        .map((g) => BatchGrade.fromJson(_map(g)))
        .toList(),
    preRefiners: _strList(j['pre_refiners']),
    openedOn: _strMap(j['opened_on']),
    runsCount: _int(j['runs_count']),
    markedCount: _int(j['marked_count']),
    weighedCount: _int(j['weighed_count']),
    stateLabel: _str(j['state_label']),
    orphaned: _bool(j['orphaned']),
    weighedKg: _num(j['weighed_kg']),
    yieldPct: _num(j['yield_pct']),
    packedSacks: _int(j['packed_sacks']),
  );
}

/// The whole record of one batch - what the batch detail view is drawn from.
class BatchDetail extends Batch {
  BatchDetail({
    required Batch base,
    required this.runs,
    required this.conversions,
  }) : super(
         id: base.id,
         ref: base.ref,
         machineId: base.machineId,
         status: base.status,
         formulation: base.formulation,
         line: base.line,
         capacity: base.capacity,
         grade: base.grade,
         paired: base.paired,
         workers: base.workers,
         autoclaveDone: base.autoclaveDone,
         shift: base.shift,
         shiftDate: base.shiftDate,
         openedAt: base.openedAt,
         openedBy: base.openedBy,
         loadedAt: base.loadedAt,
         unloadedAt: base.unloadedAt,
         grades: base.grades,
         preRefiners: base.preRefiners,
         openedOn: base.openedOn,
         runsCount: base.runsCount,
         markedCount: base.markedCount,
         weighedCount: base.weighedCount,
         stateLabel: base.stateLabel,
         orphaned: base.orphaned,
         weighedKg: base.weighedKg,
         yieldPct: base.yieldPct,
         packedSacks: base.packedSacks,
       );

  final List<Run> runs;
  final List<BatchConversion> conversions;

  factory BatchDetail.fromJson(Map<String, dynamic> j) => BatchDetail(
    base: Batch.fromJson(j),
    runs: (j['runs'] as List? ?? []).map((r) => Run.fromJson(_map(r))).toList(),
    conversions: (j['conversions'] as List? ?? [])
        .map((c) => BatchConversion.fromJson(_map(c)))
        .toList(),
  );
}

/// What deleting an orphaned batch took with it.
class BatchDeleted {
  const BatchDeleted({
    required this.id,
    required this.ref,
    required this.runs,
    required this.qualityTests,
  });
  final String id;
  final String ref;
  final int runs;
  final int qualityTests;

  factory BatchDeleted.fromJson(Map<String, dynamic> j) => BatchDeleted(
    id: _str(j['id']) ?? '',
    ref: _str(j['ref']) ?? '',
    runs: _int(j['runs']) ?? 0,
    qualityTests: _int(j['qualityTests']) ?? 0,
  );
}

// ----------------------------------------------------------------- run -----

/// A run as the shop-floor tablets record it.
///
/// `weight_kg`, `ended_at` and `batch_no` are the stored columns; `out_weight`,
/// `stopped_at` and `status` are aliases the API derives. Duration comes from
/// `runtime_min` - the two timestamps are written seconds apart when the tablet
/// syncs, so subtracting them is wrong.
class Run {
  const Run({
    required this.id,
    required this.machineId,
    required this.shiftDate,
    required this.shift,
    required this.startedAt,
    required this.status,
    this.machine,
    this.kind,
    this.line,
    this.batchNo,
    this.formulation,
    this.capacity,
    this.quality,
    this.sources = const [],
    this.mesh,
    this.tyreType,
    this.supervisor,
    this.enteredBy,
    this.workers,
    this.passes,
    this.mergedFrom,
    this.paired = false,
    this.endedAt,
    this.runtimeMin,
    this.hoursRun,
    this.weightKg,
    this.outWeight,
    this.weighEntries = const [],
    this.kwh,
    this.elecStart,
    this.elecEnd,
    this.hourStart,
    this.hourEnd,
    this.firewoodKg,
    this.packedSacks,
    this.dispatchedSacks,
    this.availSacks,
    this.availKg,
    this.leftoutIn,
    this.leftoutOut,
    this.paused = false,
    this.product,
    this.cavities,
    this.cyclicMin,
    this.cureTempC,
    this.pieces,
    this.packedPieces,
    this.stockFiled,
    this.stockNote,
    this.flashKg,
    this.compoundRate,
    this.piecesExpected,
    this.piecesVariancePct,
    this.piecesFlagged = false,
    this.materialCost,
    this.costPerPiece,
    this.pickingLabourers,
    this.pickingHours,
    this.pickingLabourHours,
    this.nonProduction = false,
    this.needsWeigh,
    this.needsWeight,
    this.needsPack,
    this.remarks,
  });

  final String id;
  final String machineId;
  final String shiftDate;
  final String shift;
  final String startedAt;

  /// running | done
  final String status;

  final String? machine;
  final String? kind;
  final String? line;
  final String? batchNo;
  final String? formulation;
  final num? capacity;
  final String? quality;

  /// The batches a special-line pass drew from - the one being refined first,
  /// then the tailings mixed into it. Empty on every run that was not a mix.
  final List<String> sources;
  final String? mesh;
  final String? tyreType;

  /// The name the record is signed with - the sheet's pick, switchable.
  final String? supervisor;

  /// The account that keyed the start, written by the server off the access
  /// token. Not switchable and not sendable, which is what makes it worth
  /// showing beside [supervisor] when the two disagree. Null on every run
  /// started before the column existed - see supabase/migrations/0013.
  final String? enteredBy;
  final int? workers;

  /// How many start/stops this record combines.
  final int? passes;

  /// Set only on the answer to a stop folded into the shift's existing record.
  final String? mergedFrom;
  final bool paired;
  final String? endedAt;
  final num? runtimeMin;
  final num? hoursRun;
  final num? weightKg;
  final num? outWeight;

  /// The individual weighings `weightKg` was totalled from.
  final List<double> weighEntries;
  final num? kwh;
  final num? elecStart;
  final num? elecEnd;
  final num? hourStart;
  final num? hourEnd;
  final num? firewoodKg;
  final int? packedSacks;
  final int? dispatchedSacks;
  final num? availSacks;
  final num? availKg;

  /// Sub-sack remainder carried in from the previous batch of this grade.
  final num? leftoutIn;
  final num? leftoutOut;
  final bool paused;

  // A moulding press run, and the sleeve and loop benches beside it.
  final String? product;
  final int? cavities;
  final num? cyclicMin;
  final num? cureTempC;
  final int? pieces;

  /// How many of those pieces have been boxed and filed into the yard. Null
  /// while nobody has been to the boxing bench, which is a different state from
  /// "boxed, and it came to none".
  final int? packedPieces;

  /// Whether the boxing just recorded actually reached the yard - answered by
  /// the pack route alone. Filing the stock is deliberately not allowed to fail
  /// the request, so without this the bench is told the pieces are in stock
  /// whether or not a single row was written.
  final bool? stockFiled;
  final String? stockNote;
  final num? flashKg;
  final num? compoundRate;
  final int? piecesExpected;
  final num? piecesVariancePct;
  final bool piecesFlagged;
  final num? materialCost;
  final num? costPerPiece;

  /// The picking gang on a cracker shift.
  final int? pickingLabourers;
  final num? pickingHours;
  final num? pickingLabourHours;

  /// A special-line pass that yields nothing to weigh - never bagged.
  final bool nonProduction;
  final bool? needsWeigh;
  final bool? needsWeight;
  final bool? needsPack;
  final String? remarks;

  bool get isRunning => status == 'running';

  /// The weight of record on a finished run, under whichever name it came back.
  num get weight => weightKg ?? outWeight ?? 0;

  factory Run.fromJson(Map<String, dynamic> j) => Run(
    id: _str(j['id']) ?? '',
    machineId: _str(j['machine_id']) ?? '',
    shiftDate: _str(j['shift_date']) ?? '',
    shift: _str(j['shift']) ?? '',
    startedAt: _str(j['started_at']) ?? '',
    status: _str(j['status']) ?? 'done',
    machine: _str(j['machine']),
    kind: _str(j['kind']),
    line: _str(j['line']),
    batchNo: _str(j['batch_no']),
    formulation: _str(j['formulation']),
    capacity: _num(j['capacity']),
    quality: _str(j['quality']),
    sources: _strList(j['sources']),
    mesh: _str(j['mesh']),
    tyreType: _str(j['tyre_type']),
    supervisor: _str(j['supervisor']),
    enteredBy: _str(j['entered_by']),
    workers: _int(j['workers']),
    passes: _int(j['passes']),
    mergedFrom: _str(j['merged_from']),
    paired: _bool(j['paired']),
    endedAt: _str(j['ended_at']) ?? _str(j['stopped_at']),
    runtimeMin: _num(j['runtime_min']),
    hoursRun: _num(j['hours_run']),
    weightKg: _num(j['weight_kg']),
    outWeight: _num(j['out_weight']),
    weighEntries: _numList(j['weigh_entries']),
    kwh: _num(j['kwh']),
    elecStart: _num(j['elec_start']),
    elecEnd: _num(j['elec_end']),
    hourStart: _num(j['hour_start']),
    hourEnd: _num(j['hour_end']),
    firewoodKg: _num(j['firewood_kg']),
    packedSacks: _int(j['packed_sacks']),
    dispatchedSacks: _int(j['dispatched_sacks']),
    availSacks: _num(j['avail_sacks']),
    availKg: _num(j['avail_kg']),
    leftoutIn: _num(j['leftout_in']),
    leftoutOut: _num(j['leftout_out']),
    paused: _bool(j['paused']),
    product: _str(j['product']),
    cavities: _int(j['cavities']),
    cyclicMin: _num(j['cyclic_min']),
    cureTempC: _num(j['cure_temp_c']),
    pieces: _int(j['pieces']),
    packedPieces: _int(j['packed_pieces']),
    stockFiled: j['stock_filed'] == null ? null : _bool(j['stock_filed'], true),
    stockNote: _str(j['stock_note']),
    flashKg: _num(j['flash_kg']),
    compoundRate: _num(j['compound_rate']),
    piecesExpected: _int(j['pieces_expected']),
    piecesVariancePct: _num(j['pieces_variance_pct']),
    piecesFlagged: _bool(j['pieces_flagged']),
    materialCost: _num(j['material_cost']),
    costPerPiece: _num(j['cost_per_piece']),
    pickingLabourers: _int(j['picking_labourers']),
    pickingHours: _num(j['picking_hours']),
    pickingLabourHours: _num(j['picking_labour_hours']),
    nonProduction: _bool(j['non_production']),
    needsWeigh: j['needs_weigh'] == null ? null : _bool(j['needs_weigh']),
    needsWeight: j['needs_weight'] == null ? null : _bool(j['needs_weight']),
    needsPack: j['needs_pack'] == null ? null : _bool(j['needs_pack']),
    remarks: _str(j['remarks']),
  );

  /// A local copy with one flag flipped. Used where a screen puts a run onto a
  /// list by hand rather than fetching it from the route that stamps the flag -
  /// see the unweigh path in RunsStore.
  Run copyWithNeedsWeight(bool value) => Run(
    id: id,
    machineId: machineId,
    shiftDate: shiftDate,
    shift: shift,
    startedAt: startedAt,
    status: status,
    machine: machine,
    kind: kind,
    line: line,
    batchNo: batchNo,
    formulation: formulation,
    capacity: capacity,
    quality: quality,
    sources: sources,
    mesh: mesh,
    tyreType: tyreType,
    supervisor: supervisor,
    enteredBy: enteredBy,
    workers: workers,
    passes: passes,
    mergedFrom: mergedFrom,
    paired: paired,
    endedAt: endedAt,
    runtimeMin: runtimeMin,
    hoursRun: hoursRun,
    weightKg: weightKg,
    outWeight: outWeight,
    weighEntries: weighEntries,
    kwh: kwh,
    elecStart: elecStart,
    elecEnd: elecEnd,
    hourStart: hourStart,
    hourEnd: hourEnd,
    firewoodKg: firewoodKg,
    packedSacks: packedSacks,
    dispatchedSacks: dispatchedSacks,
    availSacks: availSacks,
    availKg: availKg,
    leftoutIn: leftoutIn,
    leftoutOut: leftoutOut,
    paused: paused,
    product: product,
    cavities: cavities,
    cyclicMin: cyclicMin,
    cureTempC: cureTempC,
    pieces: pieces,
    packedPieces: packedPieces,
    stockFiled: stockFiled,
    stockNote: stockNote,
    flashKg: flashKg,
    compoundRate: compoundRate,
    piecesExpected: piecesExpected,
    piecesVariancePct: piecesVariancePct,
    piecesFlagged: piecesFlagged,
    materialCost: materialCost,
    costPerPiece: costPerPiece,
    pickingLabourers: pickingLabourers,
    pickingHours: pickingHours,
    pickingLabourHours: pickingLabourHours,
    nonProduction: nonProduction,
    needsWeigh: needsWeigh,
    needsWeight: value,
    needsPack: needsPack,
    remarks: remarks,
  );
}

/// What a deleted run was carrying, so the screen can name what it removed.
class RemovedRun {
  const RemovedRun({
    required this.id,
    required this.machineId,
    this.machine,
    this.batchNo,
    this.stockCleared,
    this.stockNote,
    this.qualityTestsDeleted = 0,
  });

  final String id;
  final String machineId;
  final String? machine;
  final String? batchNo;

  /// What went with it. A run is not only its own row: what it packed was
  /// standing in the yard and what the bench tested was on the lab's table.
  final ClearedStock? stockCleared;

  /// Packed output no group could be found for - unaccounted for in the yard.
  final String? stockNote;
  final int qualityTestsDeleted;

  factory RemovedRun.fromJson(Map<String, dynamic> j) => RemovedRun(
    id: _str(j['id']) ?? '',
    machineId: _str(j['machine_id']) ?? '',
    machine: _str(j['machine']),
    batchNo: _str(j['batch_no']),
    stockCleared: j['stock_cleared'] == null
        ? null
        : ClearedStock.fromJson(_map(j['stock_cleared'])),
    stockNote: _str(j['stock_note']),
    qualityTestsDeleted: _int(j['quality_tests_deleted']) ?? 0,
  );
}

class ClearedStock {
  const ClearedStock({
    required this.id,
    required this.label,
    required this.taken,
    this.left,
    this.removed = false,
  });

  final String id;
  final String label;

  /// Taken back out of that group by this delete.
  final num taken;

  /// What the group holds now.
  final num? left;

  /// The group emptied completely and was deleted with the run.
  final bool removed;

  factory ClearedStock.fromJson(Map<String, dynamic> j) => ClearedStock(
    id: _str(j['id']) ?? '',
    label: _str(j['label']) ?? '',
    taken: _num(j['taken']) ?? 0,
    left: _num(j['left']),
    removed: _bool(j['removed']),
  );
}

/// What undoing a packing gave back: the run, because it is still there, and
/// the yard half.
class UnpackedRun {
  const UnpackedRun({required this.run, this.stockCleared, this.stockNote});
  final Run run;
  final ClearedStock? stockCleared;
  final String? stockNote;

  factory UnpackedRun.fromJson(Map<String, dynamic> j) => UnpackedRun(
    run: Run.fromJson(_map(j['run'])),
    stockCleared: j['stock_cleared'] == null
        ? null
        : ClearedStock.fromJson(_map(j['stock_cleared'])),
    stockNote: _str(j['stock_note']),
  );
}

/// What clearing a weighing gave back. The run comes back owing a weight, and
/// the figure that was cleared travels with it so the screen can name what it
/// removed rather than only that a row moved.
class UnweighedRun {
  const UnweighedRun({
    required this.run,
    this.weightKg,
    this.entriesCleared = 0,
  });
  final Run run;
  final num? weightKg;
  final int entriesCleared;

  factory UnweighedRun.fromJson(Map<String, dynamic> j) => UnweighedRun(
    run: Run.fromJson(_map(j['run'])),
    weightKg: _num(j['weight_kg']),
    entriesCleared: _int(j['entries_cleared']) ?? 0,
  );
}

// --------------------------------------------------------------- stock -----

/// The shop floor's copy of the yard, as `/stock/summary` sends it.
///
/// These fields are the whole response, not a subset the screen chose to draw:
/// the server builds this shape with its own serializer, so a price or a
/// customer is absent from the body rather than merely unrendered. It carries
/// the physical facts about the goods and none of the commercial ones.
class StockSummaryRow {
  const StockSummaryRow({
    required this.id,
    required this.kind,
    required this.label,
    required this.unit,
    required this.availableQty,
    required this.qcStatus,
    this.batchNo,
    this.quality,
    this.availablePacks,
    this.packSize,
    this.availableKg,
    this.firstPackedOn,
    this.lastPackedOn,
    this.periodStart,
    this.periodEnd,
  });

  final String id;

  /// batch | pool | product | lot
  final String kind;
  final String label;

  /// sacks | pieces
  final String unit;
  final num availableQty;

  /// pass | fail | pending
  final String qcStatus;

  /// The shift a lot was made on, or the batch behind a batch group.
  final String? batchNo;
  final String? quality;
  final num? availablePacks;
  final int? packSize;
  final num? availableKg;
  final String? firstPackedOn;
  final String? lastPackedOn;
  final String? periodStart;
  final String? periodEnd;

  factory StockSummaryRow.fromJson(Map<String, dynamic> j) => StockSummaryRow(
    id: _str(j['id']) ?? '',
    kind: _str(j['kind']) ?? 'batch',
    label: _str(j['label']) ?? '',
    unit: _str(j['unit']) ?? 'sacks',
    availableQty: _num(j['available_qty']) ?? _num(j['available_sacks']) ?? 0,
    qcStatus: _str(j['qc_status']) ?? 'pending',
    batchNo: _str(j['batch_no']),
    quality: _str(j['quality']),
    availablePacks: _num(j['available_packs']),
    packSize: _int(j['pack_size']),
    availableKg: _num(j['available_kg']),
    firstPackedOn: _str(j['first_packed_on']),
    lastPackedOn: _str(j['last_packed_on']),
    periodStart: _str(j['period_start']),
    periodEnd: _str(j['period_end']),
  );
}

/// A coarse pool, as far as the yard needs it: how far through its three
/// samples the period is, and whether any came back a hold.
///
/// The samples themselves - the readings, the tester, the report - belong to
/// the lab and stay in the React website with the Quality module. What is here
/// is the progress line the yard card prints.
class StockPool {
  const StockPool({
    required this.id,
    required this.label,
    required this.samplesTaken,
    required this.samplesTotal,
    required this.anyHold,
  });

  final String id;
  final String label;
  final int samplesTaken;
  final int samplesTotal;

  /// Any sample that came back a hold - the thing worth acting on.
  final bool anyHold;

  factory StockPool.fromJson(Map<String, dynamic> j) => StockPool(
    id: _str(j['id']) ?? '',
    label: _str(j['display_label']) ?? _str(j['label']) ?? '',
    samplesTaken: _int(j['samples_taken']) ?? 0,
    samplesTotal: _int(j['samples_total']) ?? 3,
    anyHold: _bool(j['any_hold']),
  );
}

// ------------------------------------------------------------ dispatch -----

class Customer {
  const Customer({required this.id, required this.name, this.active = true});
  final String id;
  final String name;
  final bool active;

  factory Customer.fromJson(Map<String, dynamic> j) => Customer(
    id: _str(j['id']) ?? '',
    name: _str(j['name']) ?? '',
    active: _bool(j['active'], true),
  );
}

/// One line of "what has gone out lately" - the header with its lines summed.
class DispatchSummary {
  const DispatchSummary({
    required this.id,
    required this.lines,
    required this.total,
    this.dispatchDate,
    this.customer,
    this.vehicle,
    this.sacks = 0,
    this.pieces = 0,
    this.sacksByQuality = const {},
  });

  final String id;
  final int lines;
  final num total;
  final String? dispatchDate;
  final String? customer;
  final String? vehicle;
  final num sacks;
  final num pieces;

  /// What went, split by grade or product. A load is one row and usually more
  /// than one product, so a bare count says how much left without saying what.
  final Map<String, num> sacksByQuality;

  factory DispatchSummary.fromJson(Map<String, dynamic> j) {
    final by = _map(j['sacks_by_quality']);
    return DispatchSummary(
      id: _str(j['id']) ?? '',
      lines: _int(j['lines']) ?? 0,
      total: _num(j['total']) ?? 0,
      dispatchDate: _str(j['dispatch_date']),
      customer: _str(j['customer']),
      vehicle: _str(j['vehicle']),
      sacks: _num(j['sacks']) ?? 0,
      pieces: _num(j['pieces']) ?? 0,
      sacksByQuality: by.map((k, v) => MapEntry(k, _num(v) ?? 0)),
    );
  }
}

/// A posted dispatch, as the create route answers.
class DispatchDoc {
  const DispatchDoc({
    required this.id,
    required this.total,
    this.sacks = 0,
    this.pieces = 0,
  });
  final String id;
  final num total;
  final num sacks;
  final num pieces;

  factory DispatchDoc.fromJson(Map<String, dynamic> j) => DispatchDoc(
    id: _str(j['id']) ?? '',
    total: _num(j['total']) ?? 0,
    sacks: _num(j['sacks']) ?? 0,
    pieces: _num(j['pieces']) ?? 0,
  );
}

// --------------------------------------------------------- maintenance -----

/// A breakdown. `status`, `severity`, `title` and `logged_at` are derived by
/// the API from how long the machine was out.
class MaintenanceLog {
  const MaintenanceLog({
    required this.id,
    required this.machineId,
    required this.status,
    required this.title,
    this.machine,
    this.downStart,
    this.repairedAt,
    this.downtimeMin,
    this.rootCause,
    this.resolution,
    this.prevention,
    this.kind = 'breakdown',
    this.severity = 'medium',
    this.loggedAt,
  });

  final String id;
  final String machineId;
  final String status;
  final String title;
  final String? machine;
  final String? downStart;
  final String? repairedAt;
  final num? downtimeMin;
  final String? rootCause;
  final String? resolution;
  final String? prevention;
  final String kind;
  final String severity;
  final String? loggedAt;

  factory MaintenanceLog.fromJson(Map<String, dynamic> j) => MaintenanceLog(
    id: _str(j['id']) ?? '',
    machineId: _str(j['machine_id']) ?? '',
    status: _str(j['status']) ?? 'open',
    title: _str(j['title']) ?? 'Breakdown',
    machine: _str(j['machine']),
    downStart: _str(j['down_start']),
    repairedAt: _str(j['repaired_at']),
    downtimeMin: _num(j['downtime_min']),
    rootCause: _str(j['root_cause']),
    resolution: _str(j['resolution']),
    prevention: _str(j['prevention']),
    kind: _str(j['kind']) ?? 'breakdown',
    severity: _str(j['severity']) ?? 'medium',
    loggedAt: _str(j['logged_at']),
  );
}

/// One temperature reading for one bearing position.
class BearingLog {
  const BearingLog({
    required this.id,
    required this.machineId,
    required this.ts,
    this.machine,
    this.position,
    this.tempC,
    this.kind = 'bearing',
    this.supervisor,
  });

  final String id;
  final String machineId;
  final String ts;
  final String? machine;
  final String? position;
  final num? tempC;
  final String kind;
  final String? supervisor;

  factory BearingLog.fromJson(Map<String, dynamic> j) => BearingLog(
    id: _str(j['id']) ?? '',
    machineId: _str(j['machine_id']) ?? '',
    ts: _str(j['ts']) ?? '',
    machine: _str(j['machine']),
    position: _str(j['position']),
    tempC: _num(j['temp_c']),
    kind: _str(j['kind']) ?? 'bearing',
    supervisor: _str(j['supervisor']),
  );
}

/// One machine's greasing schedule as the API reports it: what it runs on,
/// which positions get a reading, and how far past due it is right now.
/// [dueInMin] is negative once the interval has elapsed.
class BearingDue {
  const BearingDue({
    required this.machineId,
    required this.bearingType,
    required this.positions,
    required this.intervalH,
    required this.dueInMin,
    required this.due,
    this.machine,
    this.lastAt,
  });

  final String machineId;

  /// bearing | bush
  final String bearingType;
  final List<String> positions;
  final num intervalH;
  final num dueInMin;
  final bool due;
  final String? machine;

  /// Epoch milliseconds of the last reading, or null if never logged.
  final num? lastAt;

  factory BearingDue.fromJson(Map<String, dynamic> j) => BearingDue(
    machineId: _str(j['machineId']) ?? '',
    bearingType: _str(j['bearingType']) ?? 'bearing',
    positions: _strList(j['positions']),
    intervalH: _num(j['intervalH']) ?? 0,
    dueInMin: _num(j['dueInMin']) ?? 0,
    due: _bool(j['due']),
    machine: _str(j['machine']),
    lastAt: _num(j['lastAt']),
  );
}

// ---------------------------------------------------- quality and filters ---

/// A lab verdict, as much of one as the shop floor is shown.
///
/// The Quality module is not in this app - filing, correcting and deleting a
/// test stay in the React website with the lab's own screens. What is here is
/// the read `GET /quality-tests` is deliberately left open to everyone signed
/// in for: the Batches tab warns on a held batch, so the floor has to be able
/// to see a verdict it cannot write. Nothing beyond that is modelled, because
/// nothing beyond that is drawn.
class QualityVerdict {
  const QualityVerdict({
    required this.id,
    required this.grade,
    required this.verdict,
    this.kind = 'batch',
    this.batchNo,
    this.testedAt,
  });

  final String id;
  final String grade;

  /// pass | hold
  final String verdict;

  /// batch | pool | product | lot
  final String kind;
  final String? batchNo;
  final String? testedAt;

  factory QualityVerdict.fromJson(Map<String, dynamic> j) => QualityVerdict(
    id: _str(j['id']) ?? '',
    grade: _str(j['grade']) ?? _str(j['quality']) ?? '',
    verdict: _str(j['verdict']) ?? 'pass',
    kind: _str(j['kind']) ?? 'batch',
    batchNo: _str(j['batch_no']) ?? _str(j['batch_id']),
    testedAt: _str(j['tested_at']) ?? _str(j['ts']),
  );

  int get testedMs => DateTime.tryParse(testedAt ?? '')?.millisecondsSinceEpoch ?? 0;
}

/// What the run history covers, for the History tab's pickers.
class RunFilters {
  const RunFilters({
    required this.days,
    required this.shifts,
    required this.machines,
    required this.batches,
  });

  final List<String> days;
  final List<String> shifts;
  final List<({String id, String name})> machines;

  /// Batch numbers on record, newest first.
  final List<String> batches;

  static const empty = RunFilters(
    days: [],
    shifts: [],
    machines: [],
    batches: [],
  );

  factory RunFilters.fromJson(Map<String, dynamic> j) => RunFilters(
    days: _strList(j['days']),
    shifts: _strList(j['shifts']),
    machines: (j['machines'] as List? ?? []).map((m) {
      final map = _map(m);
      return (id: _str(map['id']) ?? '', name: _str(map['name']) ?? '');
    }).toList(),
    batches: _strList(j['batches']),
  );
}
