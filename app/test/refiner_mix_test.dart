/// Two batches on one machine.
///
/// A refiner pass carries the tailings of the batch before it through with the
/// batch on the grid often enough that the crew asked for it by name. The
/// special line has recorded it since it was written - four batches in all,
/// kept in the run's four source columns - and a plain refiner had no way of
/// saying it at all, so a pass with two batches in it went on record as a pass
/// on one.
///
/// What is held here is that both are picked off the one Batch grid: tap the
/// batch being refined, tap the next, both are lit. The first tap decides what
/// the run is filed under, the second mixes one in, and a third is refused -
/// two batches is what the machine takes at a time.
library;

import 'dart:async';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/api/api_client.dart';
import 'package:manna_supervisor/core/api/request_log.dart';
import 'package:manna_supervisor/core/models/models.dart';
import 'package:manna_supervisor/core/theme/app_theme.dart';
import 'package:manna_supervisor/features/machines/start_sheet.dart';
import 'package:manna_supervisor/services/services.dart';
import 'package:manna_supervisor/state/runs_store.dart';
import 'package:manna_supervisor/state/stores.dart';
import 'package:manna_supervisor/state/ui_store.dart';
import 'package:manna_supervisor/widgets/ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _r3 = Machine(
  id: 'R3',
  name: 'Refiner 3',
  short: 'R3',
  kind: 'refiner',
  groupName: 'Refiners',
  enabled: true,
);

Batch _batch(String ref, {bool out = true}) => Batch(
  id: ref,
  ref: ref,
  machineId: 'AC_A',
  status: 'open',
  formulation: 'special',
  autoclaveDone: out,
);

/// A Pick tile by the number on it, lit or otherwise.
Finder _pick(String title, {bool? selected}) => find.byWidgetPredicate(
  (w) =>
      w is Pick &&
      w.title == title &&
      (selected == null || w.selected == selected),
);

void main() {
  /// The start sheet, opened on [machine] with [open] on the floor.
  ///
  /// The API has nowhere to go in a test and nothing here calls it: the sheet
  /// is filled in and read, never started. The batches are put on the store
  /// directly for the same reason - the fetch behind them is not what this is
  /// asking about.
  Future<UiStore> openSheet(
    WidgetTester tester, {
    required Machine machine,
    required List<Batch> open,
  }) async {
    tester.view.physicalSize = const Size(1600, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final api = ApiClient(TokenStore(prefs), CookieJar(), log: RequestLog());
    final ui = UiStore(prefs);
    final batches = BatchesStore(BatchService(api), QualityReadService(api), ui)
      ..items = open;

    late BuildContext ctx;
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<UiStore>.value(value: ui),
          ChangeNotifierProvider<RunsStore>.value(
            value: RunsStore(RunService(api), ui),
          ),
          ChangeNotifierProvider<BatchesStore>.value(value: batches),
          ChangeNotifierProvider(
            create: (_) => ProductsStore(ProductService(api)),
          ),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: Scaffold(
            body: Builder(
              builder: (context) {
                ctx = context;
                return const SizedBox.expand();
              },
            ),
          ),
        ),
      ),
    );

    unawaited(showStartSheet(context: ctx, machine: machine));
    await tester.pumpAndSettle();
    return ui;
  }

  /// A tap on a batch tile, wherever the grid has put it.
  Future<void> tapBatch(WidgetTester tester, String ref) async {
    await tester.ensureVisible(_pick(ref));
    await tester.pumpAndSettle();
    await tester.tap(_pick(ref));
    await tester.pumpAndSettle();
  }

  testWidgets('a refiner takes a second batch off the same grid', (
    tester,
  ) async {
    await openSheet(
      tester,
      machine: _r3,
      open: [_batch('3109'), _batch('3113')],
    );

    // One tile per open batch, and no second list of the same numbers.
    expect(_pick('3109'), findsOneWidget);
    expect(_pick('3113'), findsOneWidget);
    expect(find.text('MIXED FROM'), findsNothing);

    await tapBatch(tester, '3109');
    await tapBatch(tester, '3113');

    expect(_pick('3109', selected: true), findsOneWidget);
    expect(_pick('3113', selected: true), findsOneWidget);
    // Two tiles lit the same way do not say which number the run is keyed on,
    // so the sheet says it in words.
    expect(
      find.text('Filed under 3109 — 3113 goes through with it as tailings.'),
      findsOneWidget,
    );
  });

  testWidgets('a third batch is refused', (tester) async {
    final ui = await openSheet(
      tester,
      machine: _r3,
      open: [_batch('3109'), _batch('3113'), _batch('3117')],
    );

    await tapBatch(tester, '3109');
    await tapBatch(tester, '3113');
    await tapBatch(tester, '3117');

    // Two is what the machine takes: the batch it is filed under and one going
    // through with it. The third tile does not light, and the sheet says why
    // rather than leaving it looking like a missed tap.
    expect(_pick('3117', selected: false), findsOneWidget);
    expect(ui.toasts.map((t) => t.message), contains('Two batches at a time'));
    expect(
      find.text('Filed under 3109 — 3113 goes through with it as tailings.'),
      findsOneWidget,
    );

    await tester.pump(const Duration(milliseconds: 3300));
  });

  testWidgets('untapping the one it is filed under hands the job on', (
    tester,
  ) async {
    await openSheet(
      tester,
      machine: _r3,
      open: [_batch('3109'), _batch('3113')],
    );

    await tapBatch(tester, '3109');
    await tapBatch(tester, '3113');
    // The crew take the first batch back off the machine. The second is still
    // going through it, so it becomes what the run is filed under rather than
    // the pick being emptied.
    await tapBatch(tester, '3109');

    expect(_pick('3109', selected: false), findsOneWidget);
    expect(_pick('3113', selected: true), findsOneWidget);
    expect(find.textContaining('Filed under'), findsNothing);
  });

  testWidgets('a charge still in the vessel cannot be mixed in', (
    tester,
  ) async {
    final ui = await openSheet(
      tester,
      machine: _r3,
      open: [_batch('3109'), _batch('3120', out: false)],
    );

    await tapBatch(tester, '3109');
    await tapBatch(tester, '3120');

    // It is on the grid, marked as still cooking - the pick says why it is not
    // ready rather than leaving the number off the screen - and it has no
    // tailings to put through anything until it is discharged. The refusal is
    // said out loud: a tile that simply does not light reads as a tablet that
    // missed the tap.
    expect(find.text('in autoclave'), findsOneWidget);
    expect(_pick('3120', selected: false), findsOneWidget);
    expect(find.textContaining('Filed under'), findsNothing);
    expect(
      ui.toasts.map((t) => t.message),
      contains('3120 is still in the autoclave'),
    );

    // The toast takes itself off after 3.2s, and the test may not end with that
    // timer still pending.
    await tester.pump(const Duration(milliseconds: 3300));
  });
}
