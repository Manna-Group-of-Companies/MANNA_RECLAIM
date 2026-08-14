import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/config/app_config.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_page.dart';
import 'features/shell/supervisor_shell.dart';
import 'state/auth_store.dart';
import 'state/ui_store.dart';

/// The root. One guard, in one place: signed in gets the shell, everyone else
/// gets the login screen.
///
/// This is the Flutter equivalent of ProtectedRoute in the React client, and it
/// is deliberately the whole of the routing. The web app had two route trees
/// because it carried two products - the back office and the shop floor - and
/// this build carries one.
class MannaSupervisorApp extends StatelessWidget {
  const MannaSupervisorApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: AppConfig.appName,
    debugShowCheckedModeBanner: false,
    theme: buildAppTheme(),
    home: const _Root(),
  );
}

class _Root extends StatefulWidget {
  const _Root();

  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> {
  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  /// The account name last pushed into [UiStore]. Kept so the push happens on
  /// the change rather than on every build - see the note in [build].
  String? _syncedAccount;

  @override
  void initState() {
    super.initState();
    // A token this device already had is re-checked against the server, so a
    // revoked or expired session is found before a screen is drawn on it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthStore>();
      if (auth.isAuthed) unawaited(auth.loadSession());
      _watchConnectivity();
    });
  }

  void _watchConnectivity() {
    final ui = context.read<UiStore>();
    Connectivity().checkConnectivity().then(
      (r) => ui.setOnline(!r.contains(ConnectivityResult.none)),
    );
    _connectivity = Connectivity().onConnectivityChanged.listen(
      (r) => ui.setOnline(!r.contains(ConnectivityResult.none)),
    );
  }

  @override
  void dispose() {
    _connectivity?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();

    // The account's own name is the default supervisor on every sheet, so it
    // follows whoever is signed in.
    //
    // Pushed after the frame rather than during it. Writing to one store while
    // building a widget that depends on another marks the provider dirty
    // mid-build, which Flutter refuses - it threw on the first sign-in and took
    // the frame with it. Guarded on the value so it is a write on the change
    // rather than a post-frame callback on every build.
    final account = auth.user?.name ?? '';
    if (account != _syncedAccount) {
      _syncedAccount = account;
      final ui = context.read<UiStore>();
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => ui.setAccountName(account),
      );
    }

    return auth.isAuthed && auth.mayUseThisApp
        ? const SupervisorShell()
        : const LoginPage();
  }
}
