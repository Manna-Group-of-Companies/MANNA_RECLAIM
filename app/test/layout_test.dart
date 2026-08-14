import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/theme/app_theme.dart';
import 'package:manna_supervisor/core/theme/layout.dart';
import 'package:manna_supervisor/widgets/fields.dart';
import 'package:manna_supervisor/widgets/ui.dart';

/// What the responsive layer promises, pinned at the widths it promises it at.
///
/// A layout rule is the kind of thing that is only wrong on somebody else's
/// device: it looks right on whatever screen it was written on, and the report
/// that comes back from the floor is "it looks squashed", months later. So the
/// arithmetic is tested at the boundaries rather than eyeballed once.
void main() {
  group('which screen this is', () {
    test('a handset is a phone, on either edge of it', () {
      expect(screenFor(360), ScreenSize.phone);
      expect(screenFor(411), ScreenSize.phone);
      expect(screenFor(599.9), ScreenSize.phone);
    });

    test('600 is where the tablet layout starts, inclusively', () {
      // A phone turned on its side lands here too, and should: it has the width
      // for a second column of cards and almost no height to scroll through.
      expect(screenFor(600), ScreenSize.tablet);
      expect(screenFor(800), ScreenSize.tablet);
    });

    test('1000 up is the wide layout', () {
      expect(screenFor(999.9), ScreenSize.tablet);
      expect(screenFor(1000), ScreenSize.wide);
      expect(screenFor(1600), ScreenSize.wide);
    });

    test('the gutter grows with the screen but never runs away with it', () {
      expect(pageGutter(ScreenSize.phone), 14);
      expect(pageGutter(ScreenSize.tablet), greaterThan(14));
      expect(
        pageGutter(ScreenSize.wide),
        greaterThan(pageGutter(ScreenSize.tablet)),
      );
      // Whitespace is not what a tablet's width is for - the cards are.
      expect(pageGutter(ScreenSize.wide), lessThan(40));
    });
  });

  group('how many cards fit across', () {
    test('a phone gets one, whatever the card asks for', () {
      expect(columnsFor(360 - 28), 1);
      expect(columnsFor(411 - 28), 1);
    });

    test('a tablet in portrait gets two', () {
      // 800 across, less the page gutter either side. The default minimum tile
      // is set so that this case - the tablets on the floor, held upright - is
      // two columns rather than one.
      expect(columnsFor(800 - 36), 2);
    });

    test('a tablet in landscape gets three, and stops there', () {
      expect(columnsFor(1280 - 44), 3);
      expect(columnsFor(2400), 3);
      expect(columnsFor(2400, limit: 2), 2);
    });

    test('the gap between columns is counted, not forgotten', () {
      // Two 340s and the 10 between them fit exactly; a pixel less and they do
      // not - which is the whole reason the gap is in the arithmetic.
      expect(columnsFor(690, minTile: 340), 2);
      expect(columnsFor(689, minTile: 340), 1);
    });

    test('a width that has not been laid out yet is one column', () {
      // LayoutBuilder can hand out an infinite or zero width mid-layout, and
      // neither is a reason to divide by it.
      expect(columnsFor(0), 1);
      expect(columnsFor(double.infinity), 1);
    });
  });

  group('the plant\'s tablet, both ways up', () {
    // The Tab M11 is 1920 x 1200 of glass at 1.5 density, which is 800 x 1280
    // logical - so the numbers below are what the app is actually handed, not
    // what is printed on the box.
    const upright = KnownScreens.tabM11Portrait;
    const laidDown = KnownScreens.tabM11Landscape;

    /// What a page actually gets to lay cards out in: the screen, less the
    /// gutter down either side. Nothing else takes width off it - the tab bar
    /// is along the bottom on this device as on every other.
    double content(Size screen) =>
        screen.width - 2 * pageGutter(screenFor(screen.width));

    test('upright in its cradle is the tablet layout', () {
      expect(screenFor(upright.width), ScreenSize.tablet);
      expect(columnsFor(content(upright)), 2);
    });

    test('laid down on the bench is the wide layout', () {
      expect(screenFor(laidDown.width), ScreenSize.wide);
      expect(columnsFor(content(laidDown)), 3);
    });

    test('turning it over never lands on a single column', () {
      // The point of the whole exercise: either way up, the tablet's width is
      // spent on cards rather than on one very wide one.
      for (final size in [upright, laidDown]) {
        expect(columnsFor(content(size)), greaterThan(1));
      }
    });
  });

  group('the card grid', () {
    /// Six numbered cards at a given screen width, laid out as a page is.
    Widget grid(double width) => MaterialApp(
      theme: buildAppTheme(),
      home: MediaQuery(
        data: MediaQueryData(size: Size(width, 900)),
        child: Scaffold(
          body: SizedBox(
            width: width,
            child: CardGrid(
              children: [
                for (var i = 0; i < 6; i++)
                  Panel(child: SizedBox(height: 60, child: Text('card $i'))),
              ],
            ),
          ),
        ),
      ),
    );

    testWidgets('is a plain column on a phone', (tester) async {
      await tester.pumpWidget(grid(400));

      expect(find.byType(Wrap), findsNothing);
      expect(find.text('card 5'), findsOneWidget);
      // Full width, less nothing: a phone gets exactly the layout it had before
      // any of this existed.
      expect(tester.getSize(find.byType(Panel).first).width, 400);
    });

    testWidgets('splits into columns once there is room', (tester) async {
      await tester.pumpWidget(grid(1000));

      expect(find.byType(Wrap), findsOneWidget);
      final tile = tester.getSize(find.byType(Panel).first).width;
      expect(tile, lessThan(400));
      // Three across, so the second card sits beside the first rather than
      // under it.
      final first = tester.getTopLeft(find.byType(Panel).at(0));
      final second = tester.getTopLeft(find.byType(Panel).at(1));
      expect(second.dx, greaterThan(first.dx));
      expect(second.dy, first.dy);
    });

    testWidgets('a card that asks for width gets fewer columns', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildAppTheme(),
          home: Scaffold(
            body: SizedBox(
              width: 1000,
              child: CardGrid(
                minTileWidth: 420,
                maxColumns: 2,
                children: [
                  for (var i = 0; i < 4; i++)
                    Panel(child: SizedBox(height: 60, child: Text('batch $i'))),
                ],
              ),
            ),
          ),
        ),
      );

      final tile = tester.getSize(find.byType(Panel).first).width;
      expect(tile, greaterThan(420));
      expect(tile, lessThan(1000));
    });

    testWidgets('fields pair up on a sheet, never on a phone', (tester) async {
      // FieldColumns is the card grid with a field's minimum width. What is
      // pinned here is the pair of widths that matter: a sheet on a handset is
      // about 380 across and must stay one field per row, and the same sheet on
      // the M11 is 640 - 32 of padding, which is two.
      Widget fields(double width) => MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(
          body: SizedBox(
            width: width,
            child: FieldColumns(
              children: [
                for (final position in ['DE', 'NDE', 'top', 'bottom'])
                  TextFieldRow(
                    controller: TextEditingController(),
                    label: 'Bearing $position',
                    suffix: '°C',
                  ),
              ],
            ),
          ),
        ),
      );

      // Checked on geometry rather than by looking for a Wrap: every field
      // draws its own label line as one, so the widget type says nothing about
      // how the fields themselves were laid out.
      await tester.pumpWidget(fields(379));
      final onPhone = tester.getTopLeft(find.byType(TextField).at(1));
      final phoneFirst = tester.getTopLeft(find.byType(TextField).at(0));
      expect(onPhone.dx, phoneFirst.dx);
      expect(onPhone.dy, greaterThan(phoneFirst.dy));

      await tester.pumpWidget(fields(608));
      final first = tester.getTopLeft(find.byType(TextField).at(0));
      final second = tester.getTopLeft(find.byType(TextField).at(1));
      // Second box beside the first, not under it - four bearings in two rows.
      expect(second.dx, greaterThan(first.dx));
      expect(second.dy, first.dy);
    });

    testWidgets('a form never goes past two columns', (tester) async {
      // However wide the screen gets. A form read in three columns is a form
      // somebody fills in in the wrong order.
      await tester.pumpWidget(
        MaterialApp(
          theme: buildAppTheme(),
          home: Scaffold(
            body: SizedBox(
              width: 1600,
              child: FieldColumns(
                children: [
                  for (var i = 0; i < 6; i++)
                    TextFieldRow(
                      controller: TextEditingController(),
                      label: 'field $i',
                    ),
                ],
              ),
            ),
          ),
        ),
      );

      final third = tester.getTopLeft(find.byType(TextField).at(2));
      final first = tester.getTopLeft(find.byType(TextField).at(0));
      // The third field wraps onto a new row rather than starting a third one.
      expect(third.dx, first.dx);
      expect(third.dy, greaterThan(first.dy));
    });

    testWidgets('nothing to lay out draws nothing', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: CardGrid(children: [])),
        ),
      );

      expect(find.byType(Wrap), findsNothing);
    });
  });
}
