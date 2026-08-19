/// Numbers, weights and durations, in the words the floor reads them in.
/// A port of client/src/utils/format.ts.
library;

import 'package:intl/intl.dart';

import '../models/models.dart';

final _nf0 = NumberFormat('#,##0', 'en_IN');
final _nf1 = NumberFormat('#,##0.#', 'en_IN');
final _nf2 = NumberFormat('#,##0.##', 'en_IN');

NumberFormat _fmt(int digits) => switch (digits) {
  0 => _nf0,
  1 => _nf1,
  _ => _nf2,
};

String kgOf(num? value, [int digits = 0]) =>
    value == null ? '--' : '${_fmt(digits).format(value)} kg';

String rupees(num? value) => value == null ? '--' : 'Rs ${_nf2.format(value)}';

String num1(num? value, [int digits = 1]) =>
    value == null ? '--' : _fmt(digits).format(value);

/// A finished run's duration, from the minutes the crew recorded.
///
/// Do NOT compute this from started_at/ended_at: the tablets stamp both when
/// they flush the row to the server, so the gap between them is a few seconds
/// regardless of how long the machine actually ran.
String duration(num? runtimeMin, num? hoursRun) {
  final mins = runtimeMin ?? (hoursRun != null ? hoursRun * 60 : null);
  if (mins == null) return '--';
  final total = mins.round();
  final h = total ~/ 60;
  final m = total % 60;
  return h > 0 ? '${h}h ${m.toString().padLeft(2, '0')}m' : '${m}m';
}

/// Milliseconds as H:MM:SS, the way the prototype's timer reads.
String _hms(int ms) {
  final s = (ms < 0 ? 0 : ms) ~/ 1000;
  String p(int n) => n.toString().padLeft(2, '0');
  return '${s ~/ 3600}:${p((s % 3600) ~/ 60)}:${p(s % 60)}';
}

/// Live timer for a run in progress, matching the prototype's H:MM:SS.
String elapsed(String? fromIso, [String? toIso]) {
  final from = DateTime.tryParse(fromIso ?? '');
  if (from == null) return '0:00:00';
  final to = toIso != null ? DateTime.tryParse(toIso) : null;
  return _hms((to ?? DateTime.now()).difference(from).inMilliseconds);
}

/// Every pause a run has taken, in milliseconds: the ones already ended, which
/// the server banks into `paused_ms` on each resume, plus the one it is
/// standing in now, measured off `paused_at`.
int pausedMs(Run? run, [DateTime? at]) {
  final banked = (run?.pausedMs ?? 0).round();
  final base = banked < 0 ? 0 : banked;
  if (run == null || !run.paused) return base;
  final from = DateTime.tryParse(run.pausedAt ?? '');
  if (from == null) return base;
  final open = (at ?? DateTime.now()).difference(from).inMilliseconds;
  return base + (open < 0 ? 0 : open);
}

/// How long a run has actually run, H:MM:SS - the clock since it started, less
/// every pause it has taken.
///
/// A paused machine is not running, so its timer stands still: the figure holds
/// where it was when Pause was tapped and carries on from there on Resume,
/// instead of counting the break in and reading high for the rest of the shift.
/// The same subtraction the server makes when it books the minutes at a stop,
/// so the card and the record agree.
String runElapsed(Run run, [DateTime? at]) {
  final from = DateTime.tryParse(run.startedAt);
  if (from == null) return '0:00:00';
  final now = at ?? DateTime.now();
  return _hms(now.difference(from).inMilliseconds - pausedMs(run, now));
}

/// Hours a run took, in the back office's order of preference: what the crew
/// recorded, then the hour meter either side of it, then the runtime. Never the
/// two timestamps.
num? runHoursOf(Run run) {
  if (run.hoursRun != null) return run.hoursRun;
  if (run.hourEnd != null && run.hourStart != null) {
    final d = run.hourEnd! - run.hourStart!;
    return d < 0 ? 0 : d;
  }
  if (run.runtimeMin != null) return run.runtimeMin! / 60;
  return null;
}

/// kWh for a run, from the total or from the meter readings around it.
num? kwhOf(Run run) {
  if (run.kwh != null) return run.kwh;
  if (run.elecEnd != null && run.elecStart != null) {
    final d = run.elecEnd! - run.elecStart!;
    return d < 0 ? 0 : d;
  }
  return null;
}

/// "3m ago" / "2h 10m ago" - how the bearing sheet dates the last reading.
String ago(Object? at) {
  if (at == null) return '--';
  final ms = at is num
      ? at.round()
      : DateTime.tryParse(at.toString())?.millisecondsSinceEpoch;
  if (ms == null) return '--';
  final secs =
      ((DateTime.now().millisecondsSinceEpoch - ms) / 1000).round();
  if (secs < 60) return '${secs < 0 ? 0 : secs}s ago';
  final mins = (secs / 60).round();
  if (mins < 60) return '${mins}m ago';
  final h = mins ~/ 60;
  final rem = mins % 60;
  return '${h}h${rem > 0 ? ' ${rem}m' : ''} ago';
}

/// Minutes as "2h 10m" - a bearing interval or a downtime span.
String minutesLabel(num? mins) {
  if (mins == null) return '--';
  final total = mins.abs().round();
  final h = total ~/ 60;
  final m = total % 60;
  return h > 0 ? '${h}h ${m.toString().padLeft(2, '0')}m' : '${m}m';
}

/// Two decimals, which is the precision every weight in this app is kept to.
num round2(num n) => (n * 100).round() / 100;

/// A typed number field: blank reads as "not entered", not as zero.
num? asNumber(String value) {
  final t = value.trim();
  if (t.isEmpty) return null;
  return num.tryParse(t);
}

/// A figure the plant has not measured into the system yet reads as such.
String orNotSet(num? value, String unit) =>
    value == null ? 'not set' : '$value $unit';

/// A number as a plain string with no trailing `.0` - what a form field holds.
String numText(num? value) {
  if (value == null) return '';
  if (value is int) return value.toString();
  if (value == value.roundToDouble()) return value.round().toString();
  return value.toString();
}
