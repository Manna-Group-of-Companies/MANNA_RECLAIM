import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/request_log.dart';
import '../../core/theme/tokens.dart';
import '../../state/auth_store.dart';
import '../../state/ui_store.dart';
import '../../widgets/ui.dart';
import 'log_page.dart';

/// Who is signed in, how the device is connected, and the way out.
///
/// A port of client/src/pages/user/SettingsPage.tsx, and it is a read: every
/// line on it says what the tablet is doing and none of them changes it.
///
/// Two things were on this page and are not now. The supervisor pick was here
/// so a shift could be set up once at the start of it; it is asked for on the
/// sheet that signs the record instead, which is both where the web app asks
/// and where the person signing is actually looking. The server address was
/// read out under Connection; it is in the diagnostic log when a call fails,
/// which is the only time anybody wants it.
///
/// There is no "open back office" link. The back office is the React website
/// and a native app cannot hand a session to a browser - a manager who needs it
/// signs in there.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    final ui = context.watch<UiStore>();

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      // Read rather than worked, so it keeps a column's width on a tablet
      // instead of putting each label a foot from its value.
      body: SafeArea(
        child: ReadableColumn(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
            children: [
              Panel(
                child: Column(
                  children: [
                    _Row('Signed in as', auth.user?.name ?? '--'),
                    _Row('Role', auth.user?.role ?? '--'),
                    _Row(
                      'Connection',
                      ui.online ? 'Online' : 'Offline',
                      colour: ui.online ? T.ok : T.warn,
                    ),
                    // The server address is deliberately not read out here.
                    // Settings is open on a tablet that sits on the line all
                    // shift, and where the plant's API lives is not something
                    // the floor needs off it. When a call fails, the address is
                    // in the diagnostic log below with the refusal beside it,
                    // which is where anybody asking the question actually is.
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SheetLabel(
                      'Signing',
                      note: '— whose name goes on this shift',
                    ),
                    // Read out, not offered. The pick used to be here so a
                    // shift could be set up once at the start of it, and what
                    // that actually bought was a tablet whose signature could
                    // be changed by anybody who opened Settings, a screen
                    // nobody is watching. It is asked for on the sheet that
                    // signs the record instead - the autoclave load, the
                    // bearing temperatures - where the name is in front of the
                    // person putting it on the record.
                    _Row('Records signed by', ui.supervisorName),
                    Hint(
                      ui.supervisorIsAccount
                          ? 'Records are signed with the account on this '
                                'tablet. If somebody else is on the floor, '
                                'their name is picked on the entry itself.'
                          : 'Switched from the account signed in on this '
                                'tablet. It stays switched until it is changed '
                                'back on an entry.',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SheetLabel(
                      'Diagnostic log',
                      note: '— what the app has asked the server for',
                    ),
                    Builder(
                      builder: (context) {
                        final log = context.watch<RequestLog>();
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Hint(
                              log.length == 0
                                  ? 'Nothing recorded yet this session.'
                                  : '${log.length} calls this session, '
                                        '${log.failures} of them failed. Open it '
                                        'when something would not save — the '
                                        "server's own reason is in there, and it "
                                        'can be copied out.',
                            ),
                            AppButton(
                              label: log.failures > 0
                                  ? 'Open the log · ${log.failures} failed'
                                  : 'Open the log',
                              expand: true,
                              variant: log.failures > 0
                                  ? ButtonVariant.danger
                                  : ButtonVariant.ghost,
                              onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => const LogPage(),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SheetLabel('Elsewhere'),
                    const Hint(
                      'Quality, the customer records, the rate card and the back '
                      'office reports are on the Manna website. This app is the '
                      'shop floor.',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              AppButton(
                label: 'Sign out',
                variant: ButtonVariant.danger,
                expand: true,
                onPressed: () async {
                  await context.read<AuthStore>().logout();
                  if (context.mounted) Navigator.of(context).maybePop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.colour});
  final String label;
  final String value;
  final Color? colour;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12.5, color: T.inkFaint)),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(fontSize: 13, color: colour ?? T.ink),
          ),
        ),
      ],
    ),
  );
}
