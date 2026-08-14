import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/api/api_client.dart';
import 'package:manna_supervisor/core/api/request_log.dart';
import 'package:manna_supervisor/core/config/constants.dart';
import 'package:manna_supervisor/core/theme/app_theme.dart';
import 'package:manna_supervisor/core/theme/layout.dart';
import 'package:manna_supervisor/features/shell/supervisor_shell.dart';
import 'package:manna_supervisor/services/services.dart';
import 'package:manna_supervisor/state/auth_store.dart';
import 'package:manna_supervisor/state/runs_store.dart';
import 'package:manna_supervisor/state/stores.dart';
import 'package:manna_supervisor/state/ui_store.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the tabs live at each size, pumped through the real shell.
///
/// The answer is "along the bottom", at every size - which is worth a test
/// precisely because it is not what Material suggests for a tablet, and because
/// a rail was tried here and taken back out.
///
/// Nothing here is signed in and no call succeeds - the pages come up on their
/// loaders and their empty states, which is all this is asking about.
void main() {
  /// The shell with the stores it reads, wired the way main.dart wires them.
  /// The API has nowhere to go in a test, so every fetch fails and every store
  /// stays empty - deliberately, because a layout should not need data to be
  /// right.
  Future<Widget> shell(Size screen) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final log = RequestLog();
    final tokens = TokenStore(prefs);
    final api = ApiClient(tokens, CookieJar(), log: log);
    final ui = UiStore(prefs);
    final runs = RunsStore(RunService(api), ui);

    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider<RequestLog>.value(value: log),
        ChangeNotifierProvider<UiStore>.value(value: ui),
        ChangeNotifierProvider<RunsStore>.value(value: runs),
        ChangeNotifierProvider(
          create: (_) => AuthStore(AuthService(api), tokens, prefs),
        ),
        ChangeNotifierProvider(
          create: (_) => MachinesStore(MachineService(api)),
        ),
        ChangeNotifierProvider(
          create: (_) =>
              BatchesStore(BatchService(api), QualityReadService(api), ui),
        ),
        ChangeNotifierProvider(
          create: (_) => ProductsStore(ProductService(api)),
        ),
        ChangeNotifierProvider(
          create: (_) => MaintenanceStore(MaintenanceService(api), ui),
        ),
        ChangeNotifierProvider(create: (_) => ReportsStore(ReportService(api))),
        Provider<StockService>(create: (_) => StockService(api)),
        Provider<DispatchService>(create: (_) => DispatchService(api)),
        Provider<CustomerService>(create: (_) => CustomerService(api)),
        Provider<RateService>(create: (_) => RateService(api)),
        Provider<RunService>(create: (_) => RunService(api)),
        Provider<UserService>(create: (_) => UserService(api)),
      ],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: MediaQuery(
          data: MediaQueryData(size: screen),
          child: const SupervisorShell(),
        ),
      ),
    );
  }

  /// Brings the shell up at [screen] and lets its opening round of fetches
  /// fail, then takes it down again.
  ///
  /// Both halves matter. The fetches run under [WidgetTester.runAsync] because
  /// they are real HTTP calls with real timeouts on them, and a fake clock
  /// leaves those timers pending forever. Taking the tree down at the end is
  /// what gives the pages holding a timer - the yard's thirty-second poll, a
  /// running machine's clock - their dispose call.
  Future<void> pumpShell(WidgetTester tester, Size screen) async {
    final tree = await shell(screen);
    await tester.runAsync(() async {
      await tester.pumpWidget(tree);
      // Long enough for that opening round to finish failing, so the tree is
      // never torn down with calls still in the air.
      await Future<void>.delayed(const Duration(milliseconds: 800));
    });
    await tester.pump();
  }

  Future<void> teardown(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
  }

  testWidgets('a phone keeps the tab bar along the bottom', (tester) async {
    await pumpShell(tester, const Size(411, 891));

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);

    await teardown(tester);
  });

  testWidgets('a tablet keeps it there too', (tester) async {
    // A side rail was tried here and taken back out. The crews reach for the
    // tabs at the bottom edge on both devices, and the tablet's extra width
    // goes to card columns instead.
    await pumpShell(tester, const Size(800, 1280));

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);

    await teardown(tester);
  });

  testWidgets('the plate names whoever is signing this tablet', (tester) async {
    // Nobody is signed in here, so the name falls back the way UiStore says it
    // does - to the first of the plant's supervisors. What is being pinned is
    // that the name is on screen at all: it is what goes on an autoclave load
    // and a set of bearing temperatures, and it used to be visible only inside
    // Settings and inside the sheets that already used it.
    await pumpShell(tester, const Size(411, 891));

    expect(find.text(supervisorNames.first), findsOneWidget);
    expect(find.textContaining('signing'), findsOneWidget);

    await teardown(tester);
  });

  testWidgets('the Tab M11 has the same bar both ways up', (tester) async {
    // The plant's tablet, both ways up - 800 x 1280 logical in its cradle and
    // 1280 x 800 on the bench. Same seven tabs in the same place, so a crew
    // that picks the tablet up sideways is not looking for them.
    await pumpShell(tester, KnownScreens.tabM11Portrait);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(tester.takeException(), isNull);
    await teardown(tester);

    await pumpShell(tester, KnownScreens.tabM11Landscape);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(tester.takeException(), isNull);
    await teardown(tester);
  });

  testWidgets('a phone in landscape keeps it as well', (tester) async {
    // The shortest screen the app runs on - 411 of height with the bar's 62
    // taken out of it. It stays, because a tab bar that moves about depending
    // on which way somebody is holding the device is one they have to look for.
    await pumpShell(tester, const Size(891, 411));

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(tester.takeException(), isNull);

    await teardown(tester);
  });
}
