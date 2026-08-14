import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/features/shell/tab_navigation.dart';

void main() {
  group('reading the bottom bar', () {
    // A fixed clock. Presses are placed on it by hand so the double-tap window
    // can be walked up to and stepped over without waiting on a real one.
    final start = DateTime(2026, 8, 7, 9);
    late TabTapReader reader;

    setUp(
      () => reader = TabTapReader(window: const Duration(milliseconds: 500)),
    );

    test('a single press on another tab moves, and nothing else', () {
      expect(reader.read(3, 0, start), TabTap.navigate);
    });

    test('a double-tap on the tab already showing scrolls to the top', () {
      expect(reader.read(2, 2, start), TabTap.none);
      expect(
        reader.read(2, 2, start.add(const Duration(milliseconds: 180))),
        TabTap.scrollToTop,
      );
    });

    test('the second press has to land inside the window', () {
      expect(reader.read(2, 2, start), TabTap.none);
      // 900ms later is a separate press, not the back half of a gesture.
      expect(
        reader.read(2, 2, start.add(const Duration(milliseconds: 900))),
        TabTap.none,
      );
    });

    test('a lone press on the tab showing does not move the list', () {
      // The accidental case: a sleeve on the bar, or an impatient second press
      // on a tab that felt slow to draw. It arms and then expires.
      expect(reader.read(1, 1, start), TabTap.none);
    });

    test('double-tapping across to another tab moves but does not scroll', () {
      // The whole point of arming: the crew was on Machines, so a fast pair of
      // presses on Weigh is a move followed by an arm - Weigh's list stays
      // where it was.
      expect(reader.read(2, 0, start), TabTap.navigate);
      expect(
        reader.read(2, 2, start.add(const Duration(milliseconds: 120))),
        TabTap.none,
      );
    });

    test('an arm on one tab cannot be completed from another', () {
      // Arm on Machines, step across to Stock, come back - all inside the
      // window the first press opened. The stale arm must not still be live.
      expect(reader.read(0, 0, start), TabTap.none);
      expect(
        reader.read(4, 0, start.add(const Duration(milliseconds: 100))),
        TabTap.navigate,
      );
      expect(
        reader.read(0, 4, start.add(const Duration(milliseconds: 200))),
        TabTap.navigate,
      );
      expect(
        reader.read(0, 0, start.add(const Duration(milliseconds: 300))),
        TabTap.none,
      );
    });

    test('a third press starts a fresh pair rather than scrolling again', () {
      expect(reader.read(5, 5, start), TabTap.none);
      expect(
        reader.read(5, 5, start.add(const Duration(milliseconds: 100))),
        TabTap.scrollToTop,
      );
      expect(
        reader.read(5, 5, start.add(const Duration(milliseconds: 200))),
        TabTap.none,
      );
      expect(
        reader.read(5, 5, start.add(const Duration(milliseconds: 300))),
        TabTap.scrollToTop,
      );
    });

    test('a press exactly on the window still counts', () {
      expect(reader.read(1, 1, start), TabTap.none);
      expect(
        reader.read(1, 1, start.add(const Duration(milliseconds: 500))),
        TabTap.scrollToTop,
      );
    });
  });

  group('scrolling a tab back to the top', () {
    /// A stand-in for a tab page: a plain `ListView` with no controller of its
    /// own, which is what every page in this app builds.
    Widget tab(ScrollController controller) => MaterialApp(
      home: Scaffold(
        body: TabScrollScope(
          controller: controller,
          child: ListView(
            children: [
              for (var i = 0; i < 60; i++)
                SizedBox(height: 80, child: Text('row $i')),
            ],
          ),
        ),
      ),
    );

    testWidgets('a page-owned list adopts the tab controller', (tester) async {
      final controller = ScrollController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(tab(controller));

      // The load-bearing assumption: the shell can scroll a page that knows
      // nothing about it.
      expect(controller.hasClients, isTrue);
    });

    testWidgets('a scrolled list comes back to the top', (tester) async {
      final controller = ScrollController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(tab(controller));
      controller.jumpTo(1400);
      await tester.pump();

      // Not awaited here: the animation only advances as frames are pumped, so
      // awaiting it before pumping would wait on a clock that never runs.
      final settled = scrollTabToTop(controller);
      await tester.pumpAndSettle();
      await settled;

      expect(controller.offset, 0);
    });

    testWidgets('a list already at the top is left alone', (tester) async {
      final controller = ScrollController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(tab(controller));

      var done = false;
      final settled = scrollTabToTop(controller).then((_) => done = true);
      await tester.pump();

      // Finished inside a single frame, so no animation was ever started: a
      // double-tap at the top is a no-op, not a twitch.
      expect(done, isTrue);
      expect(controller.offset, 0);
      await settled;
    });

    testWidgets('a tab still on its loader is a no-op, not a crash', (
      tester,
    ) async {
      final controller = ScrollController();
      addTearDown(controller.dispose);

      // What a page looks like before its list exists - PageLoader, no
      // ScrollView, so the controller has nothing attached.
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TabScrollScope(
              controller: controller,
              child: const Center(child: CircularProgressIndicator()),
            ),
          ),
        ),
      );

      expect(controller.hasClients, isFalse);
      await expectLater(scrollTabToTop(controller), completes);
    });
  });
}
