/// Dates and shifts, as the plant reads them. A port of
/// client/src/utils/date.ts - the shift rule here is the same one the server
/// applies, so a run started at 20:31 belongs to the same shift on both.
library;

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

String _pad(int n) => n.toString().padLeft(2, '0');

/// 'YYYY-MM-DD' in plant-local time. Never UTC: the shift date is a fact about
/// the day the crew worked, not about Greenwich.
String todayISO([DateTime? at]) {
  final d = at ?? DateTime.now();
  return '${d.year}-${_pad(d.month)}-${_pad(d.day)}';
}

/// Day shift 08:30-20:30, night otherwise - the same rule as the server.
String shiftForMinutes(int mins) =>
    mins >= 510 && mins < 1230 ? 'Day' : 'Night';

String currentShift([DateTime? at]) {
  final d = at ?? DateTime.now();
  return shiftForMinutes(d.hour * 60 + d.minute);
}

/// The shift a 'HH:MM' entry falls in. Blank means the sheet was left on "now",
/// so the clock decides it.
String shiftForTime(String? time) {
  if (time == null || time.trim().isEmpty) return currentShift();
  final parts = time.split(':');
  final h = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 0;
  final m = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
  return shiftForMinutes(h * 60 + m);
}

/// 24-hour HH:MM off a timestamp - the clock the shop floor reads.
String clock24(String? iso) {
  final d = _parse(iso);
  if (d == null) return '—';
  return '${_pad(d.hour)}:${_pad(d.minute)}';
}

/// The same clock, down to the second - HH:MM:SS. What a running machine shows:
/// the time it was started at, to the second the crew tapped Start, so it can be
/// copied straight onto the shift's sheet.
String clockSec(String? iso) {
  final d = _parse(iso);
  if (d == null) return '—';
  return '${_pad(d.hour)}:${_pad(d.minute)}:${_pad(d.second)}';
}

/// The same, in the 12-hour form the cards use for "last run".
String clock(String? iso) {
  final d = _parse(iso);
  if (d == null) return '--';
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '$h:${_pad(d.minute)} ${d.hour < 12 ? 'am' : 'pm'}';
}

/// "29 Jul" - the short date on every card and table row.
String dayMonth(String? iso) {
  if (iso == null || iso.isEmpty) return '--';
  // A bare 'YYYY-MM-DD' is split by hand rather than parsed: DateTime.parse
  // reads it as UTC midnight and shows as the previous day west of Greenwich,
  // which would date a whole shift wrongly.
  if (iso.length >= 10 && iso[4] == '-' && iso[7] == '-' && !iso.contains('T')) {
    final y = int.tryParse(iso.substring(0, 4));
    final m = int.tryParse(iso.substring(5, 7));
    final d = int.tryParse(iso.substring(8, 10));
    if (y != null && m != null && d != null && m >= 1 && m <= 12) {
      return '${_pad(d)} ${_months[m - 1]}';
    }
  }
  final parsed = _parse(iso);
  if (parsed == null) return '--';
  return '${_pad(parsed.day)} ${_months[parsed.month - 1]}';
}

/// "7 Jul 2026" from a plain 'YYYY-MM-DD', parsed by hand for the same reason.
String dayLong(String? day) {
  if (day == null || day.isEmpty) return '--';
  final parts = day.split('-');
  if (parts.length < 3) return day;
  final y = parts[0];
  final m = int.tryParse(parts[1]);
  final d = int.tryParse(parts[2]);
  if (m == null || d == null || m < 1 || m > 12) return day;
  return '$d ${_months[m - 1]} $y';
}

int _monthOf(String? day) {
  if (day == null || day.length < 7) return 0;
  final m = int.tryParse(day.substring(5, 7)) ?? 0;
  return m >= 1 && m <= 12 ? m : 0;
}

/// The letter a coarse batch number is prefixed with: the month it was charged
/// in, A for January through L for December. A blank or unparseable day gives
/// back '' rather than a guess - a wrong letter is worse than none, because the
/// crew would leave it standing.
String monthLetter(String? day) {
  final m = _monthOf(day);
  return m == 0 ? '' : String.fromCharCode(64 + m);
}

/// "Mar" for the month of a 'YYYY-MM-DD', so the letter can be spelt out.
String monthShort(String? day) {
  final m = _monthOf(day);
  return m == 0 ? '' : _months[m - 1];
}

/// A local 'YYYY-MM-DD' + 'HH:MM' pair as an instant, in plant-local time.
/// Null when either half is missing or the pair does not parse.
String? atLocal(String? day, String? time) {
  if (day == null || day.isEmpty || time == null || time.isEmpty) return null;
  final d = day.split('-');
  final t = time.split(':');
  if (d.length < 3 || t.length < 2) return null;
  final y = int.tryParse(d[0]);
  final mo = int.tryParse(d[1]);
  final da = int.tryParse(d[2]);
  final h = int.tryParse(t[0]);
  final mi = int.tryParse(t[1]);
  if (y == null || mo == null || da == null || h == null || mi == null) {
    return null;
  }
  return DateTime(y, mo, da, h, mi).toUtc().toIso8601String();
}

/// The window the Reports tab asks for: the last n days ending today.
({String from, String to}) lastNDays(int n) {
  final to = DateTime.now();
  final from = to.subtract(Duration(days: n - 1));
  return (from: todayISO(from), to: todayISO(to));
}

DateTime? _parse(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  final d = DateTime.tryParse(iso);
  return d?.toLocal();
}

/// A 'HH:MM' entry read as today's clock, rolled back a day if that would put
/// it in the future. Used by every sheet that takes a time and means "just now"
/// when it is left blank - a breakdown, a bearing reading.
String? todayAtOrYesterday(String? time) {
  if (time == null || time.trim().isEmpty) return null;
  final at = DateTime.tryParse('${todayISO()}T$time');
  if (at == null) return null;
  final resolved = at.isAfter(DateTime.now())
      ? at.subtract(const Duration(days: 1))
      : at;
  return resolved.toUtc().toIso8601String();
}
