import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/widgets/fields.dart';
import 'package:manna_supervisor/widgets/sheet.dart';

/// When a sheet's await comes back, and why it matters.
///
/// Every sheet in this app is written the same way: build the controllers,
/// await the sheet, dispose them on the next line. That is only safe if the
/// await comes back once the fields are off screen - and `showModalBottomSheet`
/// alone comes back the moment the pop is asked for, with the sheet still
/// sliding away. A tablet on the plant floor found it: a store notified in that
/// window, the fields rebuilt, and "A TextEditingController was used after
/// being disposed" landed over the screen the crew was working on.
void main() {
  testWidgets('the await waits for the sheet to be gone, not just popped', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    late BuildContext ctx;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              ctx = context;
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );

    var back = false;
    unawaited(
      showAppSheet<void>(
        context: ctx,
        title: 'Bearing temps',
        body: (context, _) =>
            FieldColumns(children: [TextFieldRow(controller: controller)]),
      ).then((_) => back = true),
    );
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsOneWidget);

    Navigator.of(ctx).pop();
    await tester.pump();

    // Mid-animation: the route is popped and the fields are still mounted. This
    // is the window the assertion used to be thrown in, and the caller must not
    // have been handed control back yet - it would dispose its controllers here.
    expect(find.byType(TextField), findsOneWidget);
    expect(back, isFalse, reason: 'the sheet is still on screen');

    await tester.pumpAndSettle();
    expect(back, isTrue);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('a sheet dismissed by its scrim waits the same way', (
    tester,
  ) async {
    // The other way out of a sheet, and the one nobody writes a test for: a tap
    // on the scrim rather than a button that pops.
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    late BuildContext ctx;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              ctx = context;
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );

    var back = false;
    unawaited(
      showAppSheet<void>(
        context: ctx,
        title: 'Weigh',
        body: (context, _) => TextFieldRow(controller: controller),
      ).then((_) => back = true),
    );
    await tester.pumpAndSettle();

    await tester.tapAt(const Offset(10, 10));
    await tester.pump();
    expect(back, isFalse, reason: 'still sliding away');

    await tester.pumpAndSettle();
    expect(back, isTrue);
  });

  group('where the sheet comes from', _presentation);
}

/// Where a sheet comes from, and what it is anchored to.
///
/// A phone gets it rising off the bottom edge, under the thumb. A tablet gets
/// the same shell as a box in the middle of the work: pinned to the bottom of a
/// 1280-tall screen, it reads as a phone's sheet dropped into the corner of a
/// bigger one, and it puts the fields an arm's length from the actions.
void _presentation() {
  /// The surface itself is resized, not just the MediaQuery: what is being
  /// measured here is where the box actually lands, and a MediaQuery that
  /// disagrees with the viewport would have the widgets laying out for one
  /// screen inside another.
  Future<void> open(WidgetTester tester, Size screen) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = screen;
    addTearDown(tester.view.reset);

    late BuildContext ctx;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              ctx = context;
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );

    unawaited(
      showAppSheet<void>(
        context: ctx,
        title: 'Start R4',
        subtitle: 'refiner · special line',
        body: (context, _) => const SizedBox(height: 120),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// The panel that is actually painted, rather than the routing widget around
  /// it - `Dialog` lays its surface out inside a full-screen box of its own.
  Rect panel(WidgetTester tester, Type of) => tester.getRect(
    find.descendant(of: find.byType(of), matching: find.byType(Material)).first,
  );

  testWidgets('a phone gets it off the bottom edge', (tester) async {
    await open(tester, const Size(411, 891));

    expect(find.byType(BottomSheet), findsOneWidget);
    expect(find.byType(Dialog), findsNothing);

    // Sitting on the bottom edge, which is what the grab handle and the
    // thumb-height actions are drawn for.
    final sheet = panel(tester, BottomSheet);
    expect(sheet.bottom, 891);
    expect(sheet.width, 411);
  });

  testWidgets('a tablet gets it as a box in the middle', (tester) async {
    await open(tester, const Size(800, 1280));

    expect(find.byType(Dialog), findsOneWidget);
    expect(find.byType(BottomSheet), findsNothing);

    final box = panel(tester, Dialog);
    expect(box.width, lessThanOrEqualTo(640));
    // Off the bottom edge and centred across, rather than welded into the
    // corner of a screen twice its height.
    expect(box.bottom, lessThan(1280));
    expect((box.center.dx - 400).abs(), lessThan(1));
    expect((box.center.dy - 640).abs(), lessThan(60));
  });

  testWidgets('the M11 laid down keeps it inside the screen', (tester) async {
    // The short one: 800 of height. The box has to stay inside it and scroll
    // its body rather than run off either end.
    await open(tester, const Size(1280, 800));

    final box = panel(tester, Dialog);
    expect(box.top, greaterThanOrEqualTo(0));
    expect(box.bottom, lessThanOrEqualTo(800));
    expect(tester.takeException(), isNull);
  });
}

/// Deliberately not awaited: the test drives the sheet by pumping frames, and
/// awaiting it here would wait on an animation that only advances when it does.
void unawaited(Future<void> future) => future.ignore();
