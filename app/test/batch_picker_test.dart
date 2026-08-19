/// The History tab's batch picker.
///
/// The plant is at 468 batch numbers, so this control exists because a dropdown
/// stopped working: the number somebody wants is below the fold, and reading the
/// first screenful and concluding the list has not got your batch is the correct
/// reading of a dropdown that long. What is held here is that typing finds it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/theme/app_theme.dart';
import 'package:manna_supervisor/widgets/fields.dart';

/// A picker with more numbers on it than any screen shows at once.
Widget _harness({
  required String value,
  required ValueChanged<String?> onChanged,
  int count = 200,
}) => MaterialApp(
  theme: buildAppTheme(),
  home: Scaffold(
    body: SearchSelectRow<String>(
      label: 'Batch',
      sheetTitle: 'Find a batch',
      value: value,
      items: [
        (value: '', label: 'All batches'),
        for (var i = 0; i < count; i++)
          (value: '${3000 + i}', label: '#${3000 + i}'),
      ],
      onChanged: onChanged,
    ),
  ),
);

void main() {
  testWidgets('the field shows the current choice, not a menu', (tester) async {
    await tester.pumpWidget(_harness(value: '3079', onChanged: (_) {}));

    expect(find.text('#3079'), findsOneWidget);
    // Nothing is listed until it is asked for - the point of the control is
    // that four hundred numbers are not on the screen.
    expect(find.text('#3080'), findsNothing);
  });

  testWidgets('typing a number finds one that was never on screen', (
    tester,
  ) async {
    String? picked;
    await tester.pumpWidget(
      _harness(value: '', onChanged: (v) => picked = v),
    );

    await tester.tap(find.text('All batches'));
    await tester.pumpAndSettle();

    // 3187 is deep in the list. A dropdown would have needed it scrolled to;
    // this is the whole reason the control changed.
    await tester.enterText(find.byType(TextField).first, '3187');
    await tester.pumpAndSettle();

    expect(find.text('#3187'), findsOneWidget);
    expect(find.text('#3000'), findsNothing, reason: 'the rest is narrowed away');

    await tester.tap(find.text('#3187'));
    await tester.pumpAndSettle();

    expect(picked, '3187');
  });

  testWidgets('a search that matches nothing says so', (tester) async {
    await tester.pumpWidget(_harness(value: '', onChanged: (_) {}));

    await tester.tap(find.text('All batches'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'zzzz');
    await tester.pumpAndSettle();

    expect(find.textContaining('Nothing matches'), findsOneWidget);
  });

  testWidgets('a long list offers all of itself, not a first screenful', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(value: '', onChanged: (_) {}));

    await tester.tap(find.text('All batches'));
    await tester.pumpAndSettle();

    // Untyped, every one of the 201 entries is on offer. The picker used to
    // draw the first sixty and say so, which left the crew reading down the
    // numbers - "which batch was the one before this" - with no way to get at
    // the rest but to guess a character to type.
    expect(find.textContaining('shown'), findsNothing);

    // The last number is reached by scrolling. It is not built until it is
    // scrolled to, which is what keeps a list this long affordable.
    final list = find.descendant(
      of: find.byType(ListView),
      matching: find.byType(Scrollable),
    );
    expect(find.text('#3199'), findsNothing);
    await tester.scrollUntilVisible(find.text('#3199'), 300, scrollable: list);
    expect(find.text('#3199'), findsOneWidget);
  });

  testWidgets('All batches is a choice, not the absence of one', (
    tester,
  ) async {
    String? picked = 'unset';
    await tester.pumpWidget(
      _harness(value: '3079', onChanged: (v) => picked = v),
    );

    await tester.tap(find.text('#3079'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('All batches').last);
    await tester.pumpAndSettle();

    // Empty string, and it reached the caller. A picker that popped the value
    // could not tell this apart from the sheet being swiped away, which is why
    // it answers with a position instead.
    expect(picked, '');
  });
}
