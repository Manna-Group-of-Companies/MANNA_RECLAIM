/// The arithmetic behind a run correction.
///
/// A port of client/src/features/history/runDraft.ts. What a correction works
/// out and what it sends lives here, so the sheet only decides how it looks -
/// and so the figures cannot drift from the web client's, which edits the same
/// records against the same API.
library;

import '../../core/config/constants.dart';
import '../../core/models/models.dart';
import '../../core/utils/formats.dart';

/// The editable fields of a run, as a form holds them: everything a string.
///
/// A press run's compound rate is deliberately not here: that is what the
/// product cost when this was moulded, not a figure to correct afterwards.
class Draft {
  Draft(Run run)
    : batchNo = _t(run.batchNo),
      formulation = _t(run.formulation),
      quality = _t(run.quality),
      shiftDate = _t(run.shiftDate),
      shift = _t(run.shift),
      supervisor = _t(run.supervisor),
      workers = numText(run.workers),
      elecStart = numText(run.elecStart),
      elecEnd = numText(run.elecEnd),
      kwh = numText(run.kwh),
      hourStart = numText(run.hourStart),
      hourEnd = numText(run.hourEnd),
      hoursRun = numText(run.hoursRun),
      outWeight = numText(run.weightKg ?? run.outWeight),
      firewoodKg = numText(run.firewoodKg),
      capacity = numText(run.capacity),
      packedSacks = numText(run.packedSacks),
      remarks = _t(run.remarks),
      pieces = numText(run.pieces),
      flashKg = numText(run.flashKg),
      cavities = numText(run.cavities),
      cyclicMin = numText(run.cyclicMin),
      // The picking gang on a cracker shift. Correctable because what the
      // machine recorded was a supervisor's estimate at the end of a long
      // shift, and an estimate is exactly the sort of thing remembered better
      // the next morning. Correcting it re-prices the crumb that window made -
      // there is no stored total behind it to go stale.
      pickingLabourers = numText(run.pickingLabourers),
      pickingHours = numText(run.pickingHours);

  static String _t(Object? v) => v?.toString() ?? '';

  String batchNo;
  String formulation;
  String quality;
  String shiftDate;
  String shift;
  String supervisor;
  String workers;
  String elecStart;
  String elecEnd;
  String kwh;
  String hourStart;
  String hourEnd;
  String hoursRun;
  String outWeight;
  String firewoodKg;
  String capacity;
  String packedSacks;
  String remarks;
  String pieces;
  String flashKg;
  String cavities;
  String cyclicMin;
  String pickingLabourers;
  String pickingHours;

  Map<String, String> get fields => {
    'batchNo': batchNo,
    'formulation': formulation,
    'quality': quality,
    'shiftDate': shiftDate,
    'shift': shift,
    'supervisor': supervisor,
    'workers': workers,
    'elecStart': elecStart,
    'elecEnd': elecEnd,
    'kwh': kwh,
    'hourStart': hourStart,
    'hourEnd': hourEnd,
    'hoursRun': hoursRun,
    'outWeight': outWeight,
    'firewoodKg': firewoodKg,
    'capacity': capacity,
    'packedSacks': packedSacks,
    'remarks': remarks,
    'pieces': pieces,
    'flashKg': flashKg,
    'cavities': cavities,
    'cyclicMin': cyclicMin,
    'pickingLabourers': pickingLabourers,
    'pickingHours': pickingHours,
  };
}

/// What a correction works out, and what cannot be right about it.
class RunMath {
  const RunMath({
    required this.isTod,
    required this.isAuto,
    required this.isPress,
    required this.isCracker,
    required this.pickingLabourHours,
    required this.material,
    required this.perPiece,
    required this.elecDelta,
    required this.hourDelta,
    required this.energy,
    required this.issues,
  });

  /// Soorya reads off a TOD meter showing one phase, so its energy is ×3.
  final bool isTod;
  final bool isAuto;

  /// A moulding press, or a sleeve or loop bench: no meters, no hours -
  /// pieces, weight and flash.
  final bool isPress;

  /// The cracker: the only machine that records the yard's picking gang.
  final bool isCracker;

  /// Labourer-hours of picking - what the crumb costing actually spends.
  final num? pickingLabourHours;

  /// Compound on the weight plus the flash, and that over the pieces made.
  final num? material;
  final num? perPiece;
  final num? elecDelta;
  final num? hourDelta;

  /// What the run will read once saved, on the server's order of preference.
  final num? energy;

  /// Readings that cannot be right, in the words the screen shows them in.
  final List<String> issues;

  bool get elecPair => elecDelta != null;
  bool get hourPair => hourDelta != null;
}

RunMath runMath(Run run, Draft draft) {
  final isTod = run.machineId == todMachineId;
  final elecStart = asNumber(draft.elecStart);
  final elecEnd = asNumber(draft.elecEnd);
  final hourStart = asNumber(draft.hourStart);
  final hourEnd = asNumber(draft.hourEnd);
  final elecDelta = (elecStart != null && elecEnd != null)
      ? round2(elecEnd - elecStart)
      : null;
  final hourDelta = (hourStart != null && hourEnd != null)
      ? round2(hourEnd - hourStart)
      : null;

  // A press run re-costs itself as it is corrected: material follows the weight
  // and the flash, at the rate the run was moulded under, and cost per piece
  // follows the count. The rate itself is not editable, so it comes off the run.
  //
  // A sleeve or loop run corrects the same way and is included here. What it
  // does not do is take a corrected product, date or shift - those three are
  // its batch number, and moving it would leave its boxed pieces standing in
  // the yard under a lot that no longer exists. The server refuses that
  // outright.
  final isPress = run.kind == 'press' || isMoulding(run.kind);
  final rate = run.compoundRate;
  final charged = round2(
    (asNumber(draft.outWeight) ?? 0) + (asNumber(draft.flashKg) ?? 0),
  );
  final material = (isPress && rate != null && charged > 0)
      ? round2(rate * charged)
      : null;
  final pieces = asNumber(draft.pieces);
  final perPiece = (material != null && pieces != null && pieces > 0)
      ? round2(material / pieces)
      : null;

  // The picking gang that fed the cracker. Both halves or neither: half an
  // answer multiplied out is zero, which reads exactly like a shift that did no
  // picking.
  final cracker = isCracker(run.machineId);
  final pickLabourers = asNumber(draft.pickingLabourers);
  final pickHours = asNumber(draft.pickingHours);
  final pickingLabourHours =
      ((pickLabourers ?? 0) > 0 && (pickHours ?? 0) > 0)
      ? round2(pickLabourers! * pickHours!)
      : null;

  final issues = <String>[];
  if (elecDelta != null && elecDelta < 0) {
    issues.add('The electricity meter reads lower at the end than at the '
        'start.');
  }
  if (hourDelta != null && hourDelta < 0) {
    issues.add('The hour meter reads lower at the end than at the start.');
  }
  if (isPress && pieces != null && pieces <= 0) {
    issues.add('A run that made no pieces has nothing to cost.');
  }
  if (cracker && ((pickLabourers ?? 0) > 0) != ((pickHours ?? 0) > 0)) {
    issues.add('Picking needs both the labourers and the hours, or neither.');
  }

  return RunMath(
    isTod: isTod,
    isAuto: run.kind == 'autoclave',
    isPress: isPress,
    isCracker: cracker,
    pickingLabourHours: pickingLabourHours,
    material: material,
    perPiece: perPiece,
    elecDelta: elecDelta,
    hourDelta: hourDelta,
    energy: elecDelta != null
        ? round2(isTod ? elecDelta * 3 : elecDelta)
        : asNumber(draft.kwh),
    issues: issues,
  );
}

/// The patch a correction sends: only the fields that moved, each in the shape
/// the API takes them.
///
/// A complete meter pair is the authority on its own figure, so the direct kWh
/// and hours boxes are left out rather than fighting the readings - the server
/// re-derives both from whichever readings changed.
Map<String, dynamic> buildPayload(Draft draft, Draft base, RunMath math) {
  const textFields = {'batchNo', 'formulation', 'supervisor', 'remarks'};
  final payload = <String, dynamic>{};
  final now = draft.fields;
  final was = base.fields;

  for (final field in was.keys) {
    if (now[field] == was[field]) continue;
    final value = now[field]!;
    if (textFields.contains(field)) {
      payload[field] = value.trim().isEmpty ? null : value.trim();
    } else if (field == 'quality') {
      payload['quality'] = value.isEmpty ? null : value;
    } else if (field == 'shift') {
      if (value.isNotEmpty) payload['shift'] = value;
    } else if (field == 'shiftDate') {
      if (value.isNotEmpty) payload['shiftDate'] = value;
    } else {
      payload[field] = asNumber(value);
    }
  }

  if (math.elecPair) payload.remove('kwh');
  if (math.hourPair) payload.remove('hoursRun');
  return payload;
}

/// What a delete actually took, as a sentence for the crew.
///
/// A run is not only its own row. What it packed was standing in the yard and
/// what the bench tested was on the lab's table, and deleting the run takes
/// both - so "Entry deleted" on its own understates it by exactly the part
/// somebody would want to check.
///
/// The batch card is the third place a run leaves a mark - the discharge on its
/// autoclave load, the tick on the grade a refiner settled - and the delete
/// takes those back too. That one is named for a different reason than the
/// yard: nobody would ever connect a grade that has quietly unticked itself to
/// a run somebody deleted last week.
///
/// The unaccounted case is the one worth saying out loud: packed output no
/// group could be found for is a discrepancy in the yard that no screen would
/// otherwise show, so the server's note is passed straight through.
({String message, bool warn}) deletedSummary(RemovedRun removed) {
  final parts = <String>['Entry deleted'];
  final cleared = removed.stockCleared;
  if (cleared != null) {
    parts.add(
      cleared.removed
          ? '${cleared.label} cleared from stock'
          : '${cleared.taken} off ${cleared.label}',
    );
  }
  if (removed.qualityTestsDeleted > 0) {
    final n = removed.qualityTestsDeleted;
    parts.add('$n lab test${n > 1 ? 's' : ''} removed');
  }
  final batch = removed.batchCleared;
  if (batch != null) {
    if (batch.qualitiesCleared.isNotEmpty) {
      parts.add('${batch.qualitiesCleared.join(', ')} unmarked on ${batch.ref}');
    }
    if (batch.dischargeCleared) parts.add('${batch.ref} back in the autoclave');
  }
  if (removed.stockNote != null) {
    return (message: removed.stockNote!, warn: true);
  }
  return (message: parts.join(' · '), warn: false);
}
