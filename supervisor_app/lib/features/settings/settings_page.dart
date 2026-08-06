import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/request_log.dart';
import '../../core/config/app_config.dart';
import '../../core/theme/tokens.dart';
import '../../state/auth_store.dart';
import '../../state/ui_store.dart';
import '../../widgets/supervisor_pick.dart';
import '../../widgets/ui.dart';
import 'log_page.dart';

/// Who is signed in, how the device is connected, and the way out.
///
/// A port of client/src/pages/user/SettingsPage.tsx. The one addition is the
/// supervisor pick: on the web it only ever appeared inside the sheets that
/// sign a record, and on a shared tablet the crew asked to be able to see and
/// set it once at the start of a shift rather than finding it mid-form.
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
      body: SafeArea(
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
                  _Row('API', AppConfig.apiUrl, mono: true),
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
                  const SupervisorPick(
                    note: '— signs every record from this tablet',
                  ),
                  Hint(
                    ui.supervisorIsAccount
                        ? 'Records are signed with the account on this tablet. '
                              'Switch it if somebody else is on the floor.'
                        : 'Switched from the account signed in on this tablet. '
                              'It stays switched until it is changed back.',
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
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.colour, this.mono = false});
  final String label;
  final String value;
  final Color? colour;
  final bool mono;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12.5, color: T.inkFaint),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: mono ? 11 : 13,
              fontFamily: mono ? 'monospace' : null,
              color: colour ?? (mono ? T.inkDim : T.ink),
            ),
          ),
        ),
      ],
    ),
  );
}
