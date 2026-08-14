/// What a History row says without being opened.
///
/// History used to draw five figures off a record that holds forty, and the
/// rest - the meter readings either side of the run, the individual weighings,
/// what a press moulded at, the picking gang, the remarks - was only reachable
/// by tapping the row open, one at a time. The card carries all of it now.
///
/// The page is pumped for real. Every call it makes is answered by an
/// interceptor, so nothing here goes near the network.
library;

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/api/api_client.dart';
import 'package:manna_supervisor/core/api/request_log.dart';
import 'package:manna_supervisor/core/theme/app_theme.dart';
import 'package:manna_supervisor/features/history/history_page.dart';
import 'package:manna_supervisor/services/services.dart';
import 'package:manna_supervisor/state/auth_store.dart';
import 'package:manna_supervisor/state/stores.dart';
import 'package:manna_supervisor/state/ui_store.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// A refiner run with both meters read, two weighings and a note on it.
  const grind = {
    'id': 'r-1',
    'machine_id': 'M-R4',
    'machine': 'Refiner 4',
    'line': 'special',
    'shift_date': '2026-08-10',
    'shift': 'Day',
    'started_at': '2026-08-10T09:05:00',
    'ended_at': '2026-08-10T13:40:00',
    'status': 'done',
    'batch_no': '1041',
    'quality': 'Fine',
    'supervisor': 'Mathai',
    'workers': 3,
    'hours_run': 4.5,
    'hour_start': 120.4,
    'hour_end': 128.9,
    'elec_start': 4410,
    'elec_end': 4470,
    'kwh': 180,
    'weight_kg': 78.5,
    'weigh_entries': [40, 38.5],
    'packed_sacks': 3,
    'capacity': 500,
    'tyre_type': 'truck',
    'sources': ['1041', '1043'],
    'remarks': 'belt slipping at the tail',
  };

  /// A press run: no meters at all, and a mould costing instead.
  const press = {
    'id': 'r-2',
    'machine_id': 'M-P1',
    'machine': 'Press 1',
    'line': 'press',
    'shift_date': '2026-08-10',
    'shift': 'Night',
    'started_at': '2026-08-10T21:10:00',
    'ended_at': '2026-08-11T05:30:00',
    'status': 'done',
    'product': 'Loop',
    'pieces': 420,
    'pieces_expected': 450,
    'pieces_variance_pct': -6.7,
    'pieces_flagged': true,
    'cavities': 6,
    'cyclic_min': 4.5,
    'cure_temp_c': 150,
    'flash_kg': 3.2,
    'compound_rate': 62,
    'material_cost': 8100,
    'cost_per_piece': 19.3,
    'packed_pieces': 400,
    'stock_filed': false,
  };

  /// The page with the stores it reads, answering [rows] on `GET /runs` and an
  /// empty envelope on everything else - the filter lists and the yard panel.
  Future<Widget> page(List<Map<String, dynamic>> rows) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final api = ApiClient(TokenStore(prefs), CookieJar(), log: RequestLog());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) => handler.resolve(
          Response<dynamic>(
            requestOptions: options,
            statusCode: 200,
            data: {
              'success': true,
              'data': options.path == '/runs' ? rows : <String, dynamic>{},
            },
          ),
        ),
      ),
    );

    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => UiStore(prefs)),
        ChangeNotifierProvider(create: (_) => ReportsStore(ReportService(api))),
        ChangeNotifierProvider(
          create: (_) => AuthStore(AuthService(api), TokenStore(prefs), prefs),
        ),
        ChangeNotifierProvider(
          create: (_) => MachinesStore(MachineService(api)),
        ),
        Provider<RunService>(create: (_) => RunService(api)),
        Provider<DispatchService>(create: (_) => DispatchService(api)),
      ],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const Scaffold(body: HistoryPage()),
      ),
    );
  }

  Future<void> pumpPage(
    WidgetTester tester,
    List<Map<String, dynamic>> rows,
  ) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(800, 1280);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(await page(rows));
    await tester.pumpAndSettle();
  }

  /// Rich text, because the record is drawn as one span run per card rather
  /// than a widget per figure.
  Finder says(String text) => find.textContaining(text, findRichText: true);

  testWidgets('the meters are on the card, as they were read', (tester) async {
    await pumpPage(tester, [grind]);

    expect(says('hour meter'), findsOneWidget);
    expect(says('120.4 → 128.9'), findsOneWidget);
    expect(says('elec meter'), findsOneWidget);
    expect(says('4,410 → 4,470'), findsOneWidget);
  });

  testWidgets('so is everything else that run recorded', (tester) async {
    await pumpPage(tester, [grind]);

    // The weighings the total was added up from, not just the total.
    expect(says('40 + 38.5'), findsOneWidget);
    expect(says('3 sacks'), findsOneWidget);
    expect(says('500 kg'), findsOneWidget);
    expect(says('Truck tyre 30#'), findsOneWidget);
    expect(says('1041 + 1043'), findsOneWidget);
    expect(says('belt slipping at the tail'), findsOneWidget);
  });

  testWidgets('a press card carries its mould and its costing', (tester) async {
    await pumpPage(tester, [press]);

    expect(says('150°C · 4.5 min · 6 cavities'), findsOneWidget);
    expect(says('3.2 kg'), findsOneWidget);
    expect(says('₹62/kg'), findsOneWidget);
    expect(says('₹8100'), findsOneWidget);
    expect(says('400 pcs'), findsOneWidget);
    // The one state a crew has to be told about: the boxing was recorded and
    // the yard did not take it.
    expect(says('not filed'), findsOneWidget);
    expect(says('450 pcs'), findsOneWidget);
    expect(says('flagged'), findsOneWidget);
  });

  testWidgets('the whole log costs a screenful, not a thousand rows', (
    tester,
  ) async {
    // What this is really pinning is an ANR. History fetches the plant's whole
    // record with `all`, and it used to draw it through a Wrap - which lays
    // every child out, on screen or not. A row of five figures survived that; a
    // row carrying the whole record did not. A phone froze for five seconds on
    // the tab and Android killed it for not answering a touch.
    final many = [
      for (var i = 0; i < 400; i++) {...grind, 'id': 'r-$i', 'machine': 'M$i'},
    ];
    await pumpPage(tester, many);

    // One chevron per card that was actually built.
    final built = find.byIcon(Icons.chevron_right).evaluate().length;
    expect(built, greaterThan(0), reason: 'the log is on screen');
    expect(
      built,
      lessThan(40),
      reason: 'only what the viewport wants, not all 400',
    );
    expect(find.text('M399'), findsNothing);
  });

  testWidgets('a tablet still gets two cards across', (tester) async {
    // The laziness is done by hand here rather than by CardGrid, so the columns
    // it replaced are worth a look.
    await pumpPage(tester, [grind, press]);

    // The press ran the night shift and ended later, so it is the newer of the
    // two and takes the left-hand column - which is the sort's business, not
    // this test's. What is being pinned is that they share a band.
    final grindCard = tester.getRect(find.text('Refiner 4'));
    final pressCard = tester.getRect(find.text('Press 1'));
    expect(
      (pressCard.top - grindCard.top).abs(),
      lessThan(1),
      reason: 'the same band',
    );
    expect(
      (pressCard.left - grindCard.left).abs(),
      greaterThan(300),
      reason: 'in different columns',
    );
  });

  testWidgets('a run says nothing about what it did not record', (
    tester,
  ) async {
    // A blank is not a fact. Thirty dashes on a row that recorded four things
    // is what this list looked like if every field were drawn regardless.
    await pumpPage(tester, [grind]);

    expect(says('picking'), findsNothing);
    expect(says('moulded at'), findsNothing);
    expect(says('carried'), findsNothing);
    expect(says('non-production'), findsNothing);
  });
}
