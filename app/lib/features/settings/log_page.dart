import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api/request_log.dart';
import '../../core/config/app_config.dart';
import '../../core/theme/tokens.dart';
import '../../state/auth_store.dart';
import '../../widgets/ui.dart';

/// What the app has asked the server for, and what came back.
///
/// This screen exists because of where these tablets end up. On a plant floor
/// there is no console attached and nobody to read one, so "it would not save"
/// arrives with nothing behind it - and the answer is nearly always a refusal
/// the server already explained in words, which went past in a toast while
/// somebody's hands were full.
///
/// So the failures are what this leads on. The list is every call, but a failed
/// one carries the server's own sentence under it, and the Copy button puts the
/// lot on the clipboard with a header saying which API and which account. That
/// is a message a supervisor can send from the floor and somebody can act on.
class LogPage extends StatelessWidget {
  const LogPage({super.key});

  @override
  Widget build(BuildContext context) {
    final log = context.watch<RequestLog>();
    final auth = context.watch<AuthStore>();
    final entries = log.entries;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Diagnostic log'),
        actions: [
          IconButton(
            tooltip: 'Copy the whole log',
            icon: const Icon(Icons.copy_all_outlined, size: 20),
            onPressed: entries.isEmpty
                ? null
                : () async {
                    final messenger = ScaffoldMessenger.of(context);
                    await Clipboard.setData(
                      ClipboardData(
                        text: log.asText(
                          account: auth.user?.name,
                          role: auth.user?.role,
                        ),
                      ),
                    );
                    messenger.showSnackBar(
                      SnackBar(content: Text('${log.length} calls copied')),
                    );
                  },
          ),
          IconButton(
            tooltip: 'Clear',
            icon: const Icon(Icons.delete_outline, size: 20),
            onPressed: entries.isEmpty ? null : log.clear,
          ),
        ],
      ),
      body: SafeArea(
        child: ReadableColumn(
          maxWidth: 760,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
                child: Panel(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          StatePill(
                            '${log.length} calls',
                            tone: PillTone.neutral,
                          ),
                          const SizedBox(width: 8),
                          StatePill(
                            '${log.failures} failed',
                            tone: log.failures > 0
                                ? PillTone.down
                                : PillTone.ok,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        AppConfig.apiUrl,
                        style: const TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: T.inkFaint,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: entries.isEmpty
                    ? const EmptyState(
                        icon: Icons.receipt_long_outlined,
                        title: 'Nothing recorded yet',
                        hint:
                            'Every call this app makes to the server lands here '
                            'as it happens, newest first. It is kept in memory '
                            'only — closing the app clears it.',
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(14, 6, 14, 24),
                        itemCount: entries.length,
                        itemBuilder: (context, i) => _Row(entry: entries[i]),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.entry});
  final LogEntry entry;

  @override
  Widget build(BuildContext context) {
    final colour = entry.unreachable
        ? T.warn
        : entry.failed
        ? T.err
        : T.ok;

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
      decoration: BoxDecoration(
        color: entry.failed ? T.sunken : Colors.transparent,
        borderRadius: BorderRadius.circular(T.radiusSm),
        border: Border.all(color: entry.failed ? T.line2 : T.rule),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 34,
                child: Text(
                  entry.status?.toString() ?? 'ERR',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: colour,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              SizedBox(
                width: 46,
                child: Text(
                  entry.method,
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: T.inkFaint,
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  entry.path,
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontFamily: 'monospace',
                    color: T.ink,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${entry.millis}ms',
                style: const TextStyle(
                  fontSize: 10.5,
                  color: T.inkFaint,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          // The server's own sentence, where there was one. This is the part
          // worth reading: it names the group, the tab or the document the work
          // is actually on.
          if (entry.message != null)
            Padding(
              padding: const EdgeInsets.only(left: 34, top: 5),
              child: Text(
                entry.message!,
                style: TextStyle(fontSize: 11.5, height: 1.35, color: colour),
              ),
            ),
          if (entry.note != null)
            Padding(
              padding: const EdgeInsets.only(left: 34, top: 3),
              child: Text(
                entry.note!,
                style: const TextStyle(fontSize: 10.5, color: T.inkFaint),
              ),
            ),
        ],
      ),
    );
  }
}
