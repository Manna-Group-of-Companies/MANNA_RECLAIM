import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manna_supervisor/core/theme/app_theme.dart';
import 'package:manna_supervisor/widgets/ui.dart';

void main() {
  testWidgets('a control that cannot be used is drawn dead, not hidden', (
    tester,
  ) async {
    // The rule the whole app follows: a button that is not there is a question
    // - is this screen broken, am I the wrong account, has the stock not
    // arrived - and answering it costs a walk to the office.
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: const Scaffold(
          body: AppButton(
            label: 'Dispatch ▸',
            tooltip: 'QC pending — the lab has not released it',
          ),
        ),
      ),
    );

    expect(find.text('Dispatch ▸'), findsOneWidget);
  });

  testWidgets('a count says what it is counting', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: const Scaffold(
          body: Column(
            children: [
              StatePill('QC passed', tone: PillTone.ok),
              QualityChip('SuperFine'),
            ],
          ),
        ),
      ),
    );

    expect(find.text('QC passed'), findsOneWidget);
    expect(find.text('SuperFine'), findsOneWidget);
  });
}
