import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/api/request_log.dart';
import 'services/services.dart';
import 'state/auth_store.dart';
import 'state/runs_store.dart';
import 'state/stores.dart';
import 'state/ui_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final prefs = await SharedPreferences.getInstance();

  // The refresh token is an httpOnly cookie the server sets - see
  // auth.controller.js - so this jar is what stands in for the browser's. It is
  // persisted, so a session survives the app being closed the same way it
  // survives a page reload.
  final dir = await getApplicationSupportDirectory();
  final cookies = PersistCookieJar(storage: FileStorage('${dir.path}/cookies'));

  final tokens = TokenStore(prefs);
  late final AuthStore auth;
  // Every call the app makes is recorded here, so a tablet on the plant floor
  // can say what went wrong without a cable attached - see RequestLog.
  final requestLog = RequestLog();
  final api = ApiClient(
    tokens,
    cookies,
    log: requestLog,
    // Raised when a refresh has finally failed. The web client did this with a
    // `manna:signed-out` window event; here the store is told directly.
    onSignedOut: () => auth.sessionExpired(),
  );

  final ui = UiStore(prefs);
  auth = AuthStore(AuthService(api), tokens, prefs);
  ui.setAccountName(auth.user?.name ?? '');

  final runs = RunsStore(RunService(api), ui);

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider<RequestLog>.value(value: requestLog),
        ChangeNotifierProvider<UiStore>.value(value: ui),
        ChangeNotifierProvider<AuthStore>.value(value: auth),
        ChangeNotifierProvider<RunsStore>.value(value: runs),
        ChangeNotifierProvider(create: (_) => MachinesStore(MachineService(api))),
        ChangeNotifierProvider(
          create: (_) =>
              BatchesStore(BatchService(api), QualityReadService(api), ui),
        ),
        ChangeNotifierProvider(create: (_) => ProductsStore(ProductService(api))),
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
      child: const MannaSupervisorApp(),
    ),
  );
}
