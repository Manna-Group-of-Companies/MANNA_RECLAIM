/// What Settings is allowed to do, which is nothing.
///
/// Every line on the page is a read: who is signed in, whether the tablet can
/// reach the server, what it has asked for, and the way out. Two controls that
/// used to be here are gone and are meant to stay gone - the supervisor pick,
/// which let a shared tablet's signature be changed on a screen nobody is
/// watching, and the server address, which was read out under Connection.
library;

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/api/api_client.dart';
import 'package:manna_supervisor/core/api/request_log.dart';
import 'package:manna_supervisor/core/config/app_config.dart';
import 'package:manna_supervisor/core/theme/app_theme.dart';
import 'package:manna_supervisor/features/settings/settings_page.dart';
import 'package:manna_supervisor/services/services.dart';
import 'package:manna_supervisor/state/auth_store.dart';
import 'package:manna_supervisor/state/ui_store.dart';
import 'package:manna_supervisor/widgets/supervisor_pick.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Settings as the shell builds it, on a tablet that has been switched to
  /// sign with Rahul rather than the account signed in on it.
  Future<Widget> settings() async {
    SharedPreferences.setMockInitialValues({
      'flutter.${StorageKeys.supervisor}': 'Rahul',
    });
    final prefs = await SharedPreferences.getInstance();
    final api = ApiClient(TokenStore(prefs), CookieJar(), log: RequestLog());

    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => RequestLog()),
        ChangeNotifierProvider(
          create: (_) => UiStore(prefs, accountName: 'Mathai'),
        ),
        ChangeNotifierProvider(
          create: (_) => AuthStore(AuthService(api), TokenStore(prefs), prefs),
        ),
      ],
      child: MaterialApp(theme: buildAppTheme(), home: const SettingsPage()),
    );
  }

  Future<void> pumpSettings(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(800, 1280);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(await settings());
    await tester.pumpAndSettle();
  }

  testWidgets('the supervisor cannot be changed from here', (tester) async {
    await pumpSettings(tester);

    expect(find.byType(SupervisorPick), findsNothing);
    // Nor by any other pick that might be dropped in beside it later.
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('it still says who the tablet is signing with', (tester) async {
    // Taking the control away is not taking the answer away: a crew that walks
    // up to a tablet mid-shift has to be able to see whose name is going on
    // what they are about to record.
    await pumpSettings(tester);

    expect(find.text('Records signed by'), findsOneWidget);
    expect(find.text('Rahul'), findsOneWidget);
  });

  testWidgets('the server address is not read out', (tester) async {
    await pumpSettings(tester);

    expect(find.textContaining(AppConfig.apiUrl), findsNothing);
    expect(find.textContaining('http'), findsNothing);
    expect(find.text('API'), findsNothing);
  });

  testWidgets('what is left is a read, and the way out', (tester) async {
    await pumpSettings(tester);

    expect(find.text('Signed in as'), findsOneWidget);
    expect(find.text('Connection'), findsOneWidget);
    expect(find.text('Sign out'), findsOneWidget);
    expect(find.textContaining('Open the log'), findsOneWidget);
  });
}
