/// The batch number a sleeve or loop run will be recorded under, worked out
/// here so the crew can read it before they start.
///
/// Nobody types it. A shift is the day it was worked and which shift worked it,
/// and there is nothing else about it to name - so asking an operator for a
/// running number would be asking them to keep a series in their head, on a
/// shared tablet, at the end of a twelve-hour shift.
///
///     03/Aug/26-day     03/Aug/26-night
///
/// The date is the shift date rather than the clock's, so a night shift that
/// runs past midnight stays one number instead of splitting either side of
/// 00:00. The product is not in the string: it is its own field on the run, the
/// stock group and the lab test, and the number names the shift - so sleeve and
/// loop made on the same shift share this number and are told apart by the
/// product beside it.
///
/// This is a copy, and it is worth being plain about which copy is which. The
/// server generates the number that gets stored and never accepts one from a
/// request. What this is for is showing the crew, before the run starts, what
/// the server is going to call it. The two agreeing is the point; if they ever
/// disagree, the server is right.
///
/// Mirrors client/src/utils/mouldingBatch.ts and server/src/utils/mouldingBatch.js.
library;

import '../config/constants.dart';

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/// `2026-08-03` -> `03/Aug/26`. Split by hand rather than through DateTime,
/// which would read the bare date as UTC midnight and show the crew yesterday's
/// lot west of Greenwich.
String plantDate(String? day) {
  final raw = (day ?? '');
  if (raw.length < 10) return '';
  final parts = raw.substring(0, 10).split('-');
  if (parts.length < 3) return '';
  final m = int.tryParse(parts[1]);
  if (parts[0].isEmpty || m == null || m < 1 || m > 12 || parts[2].isEmpty) {
    return '';
  }
  final year = parts[0].substring(parts[0].length - 2);
  return '${parts[2].padLeft(2, '0')}/${_months[m - 1]}/$year';
}

/// The number, or '' when the date or the shift is missing. The empty string is
/// a real answer and the sheet shows it as such - "pick a date and a shift"
/// rather than a number with a hole in it.
String mouldingBatchNo({String? shiftDate, String? shift}) {
  final date = plantDate(shiftDate);
  final when = (shift ?? '').trim().toLowerCase();
  if (date.isEmpty || when.isEmpty) return '';
  return '$date-$when';
}

/// How many pieces the cycle and the mould say a run of this length should have
/// made, or null when the product has not been measured into the system.
///
/// Whole cycles only: a run stopped two thirds of the way through a cycle has
/// an unfinished piece in the mould, not two thirds of one.
int? expectedPieces({num? runtimeMin, num? cyclicMin, num? cavities}) {
  final minutes = runtimeMin ?? 0;
  final cycle = cyclicMin ?? 0;
  final moulds = cavities ?? 0;
  if (minutes <= 0 || cycle <= 0 || moulds <= 0) return null;
  return (minutes / cycle).floor() * moulds.round();
}

/// The gap as a signed percentage - negative for a lot that came up short.
num? variancePct(num? actual, num? expected) {
  if (actual == null || expected == null || expected <= 0) return null;
  return ((actual - expected) / expected * 1000).round() / 10;
}

/// Whether that gap is wide enough to be worth somebody looking at.
bool overVariance(num? pct) => pct != null && pct.abs() > piecesVariancePct;

/// Minutes between two instants, for the expected count on a run still going.
///
/// `lessMs` comes off the gap - the time the bench stood paused, which the
/// mould made nothing in. Leaving it in would measure a lot against a cycle it
/// never had the minutes for, and flag every paused run as short.
int? minutesBetween(String? from, [DateTime? to, int lessMs = 0]) {
  if (from == null || from.isEmpty) return null;
  final started = DateTime.tryParse(from);
  if (started == null) return null;
  final ms =
      (to ?? DateTime.now()).difference(started).inMilliseconds -
      (lessMs < 0 ? 0 : lessMs);
  return ms < 0 ? 0 : ms ~/ 60000;
}
