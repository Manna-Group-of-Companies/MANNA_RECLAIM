import 'package:flutter/foundation.dart';

import '../config/app_config.dart';

/// What one call to the API came to.
///
/// Deliberately thin. It records what was asked for and what came back, and
/// never what was sent: a request body on this app carries PINs at sign-in and
/// production figures everywhere else, and a diagnostic log that a supervisor
/// can copy to a chat message is exactly the wrong place for either. Headers
/// are not touched at all, which is where the bearer token lives.
@immutable
class LogEntry {
  const LogEntry({
    required this.at,
    required this.method,
    required this.path,
    required this.millis,
    this.status,
    this.message,
    this.note,
  });

  final DateTime at;
  final String method;

  /// The route, without its query string - see [RequestLog.record].
  final String path;
  final int millis;

  /// The HTTP status, or null where the request never reached the server.
  final int? status;

  /// The server's own message on a refusal, kept unchanged. This is the useful
  /// half: "B1041-Fine has only 12 sacks left" is what somebody can act on,
  /// where "409" is not.
  final String? message;

  /// An aside the client adds - a token refresh, a retry.
  final String? note;

  bool get ok => status != null && status! < 400;
  bool get failed => !ok;

  /// A network failure rather than a refusal: nothing reached the server, so
  /// there is no status to read.
  bool get unreachable => status == null;

  String get _clock {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(at.hour)}:${two(at.minute)}:${two(at.second)}';
  }

  /// One line, as the screen shows it and as the clipboard receives it.
  String get line {
    final code = status?.toString() ?? 'ERR';
    return '$_clock  ${method.padRight(6)} ${path.padRight(28)} '
        '${code.padLeft(3)}  ${millis}ms'
        '${note != null ? '  ($note)' : ''}';
  }
}

/// The last few hundred calls this app made, kept in memory.
///
/// The reason it exists: once these tablets are on the plant floor there is no
/// `flutter run` attached to read. A supervisor who says "it would not save"
/// has nothing to hand over, and the failure is usually a refusal the server
/// already explained in words - it just went past in a toast. This keeps those
/// words where they can be read afterwards and copied into a message.
///
/// In memory only, and cleared when the app is killed. It is a diagnostic aid,
/// not a record: the plant's record is the API's own, and a log that persisted
/// would be one more copy of production data sitting on a shared device.
class RequestLog extends ChangeNotifier {
  /// Enough to cover a shift's worth of looking back without growing without
  /// bound on a tablet left open all day.
  static const capacity = 200;

  final List<LogEntry> _entries = [];

  /// Newest first, which is the order somebody reads a log in.
  List<LogEntry> get entries => List.unmodifiable(_entries.reversed);

  int get length => _entries.length;

  int get failures => _entries.where((e) => e.failed).length;

  void record({
    required String method,
    required String path,
    required int millis,
    int? status,
    String? message,
    String? note,
  }) {
    _entries.add(
      LogEntry(
        at: DateTime.now(),
        method: method.toUpperCase(),
        // The query string is dropped rather than trimmed. Nothing this app
        // sends puts a secret there today, and a log is the wrong place to be
        // relying on that staying true.
        path: path.split('?').first,
        millis: millis,
        status: status,
        message: message,
        note: note,
      ),
    );
    if (_entries.length > capacity) {
      _entries.removeRange(0, _entries.length - capacity);
    }
    notifyListeners();
  }

  void clear() {
    if (_entries.isEmpty) return;
    _entries.clear();
    notifyListeners();
  }

  /// The whole log as text, with enough of a header that a pasted copy says
  /// what it is and what it was talking to.
  String asText({String? account, String? role}) {
    final buffer = StringBuffer()
      ..writeln('Manna Supervisor — diagnostic log')
      ..writeln('API: ${AppConfig.apiUrl}')
      ..writeln(
        'Signed in: ${account ?? '—'}${role != null ? ' ($role)' : ''}',
      )
      ..writeln('Copied: ${DateTime.now()}')
      ..writeln('${_entries.length} calls, $failures failed')
      ..writeln('');

    // Oldest first in the copy: read as a sequence, a log runs forwards.
    for (final entry in _entries) {
      buffer.writeln(entry.line);
      if (entry.message != null) buffer.writeln('        └ ${entry.message}');
    }
    return buffer.toString();
  }
}
