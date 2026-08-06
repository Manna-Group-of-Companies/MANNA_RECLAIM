/// The sheet every write on the shop floor happens in - a port of
/// client/src/components/ui/BottomSheet.tsx.
///
/// It slides up over a scrim, scrolls its body, keeps its actions pinned at the
/// bottom where a thumb can reach them, and lifts clear of the keyboard so the
/// number pad never covers the Save button. That last part is not a nicety: on
/// the tablets this replaces, a pad sitting over the actions is the difference
/// between a weighing that got filed and one that did not.
library;

import 'package:flutter/material.dart';

import '../core/theme/tokens.dart';
import 'ui.dart';

/// Opens a sheet and waits for it to close.
///
/// [builder] is handed a `setSheetState` so the sheet can redraw its own
/// arithmetic as the crew types - a meter difference, a material cost, the
/// pieces still unboxed - without the page behind it rebuilding.
Future<R?> showAppSheet<R>({
  required BuildContext context,
  required String title,
  String? subtitle,
  Color? led,
  required Widget Function(BuildContext context, StateSetter setSheetState)
  body,
  List<Widget> Function(BuildContext context, StateSetter setSheetState)?
  actions,

  /// A row of its own under the actions - where the destructive button goes
  /// that must not sit beside the others.
  Widget Function(BuildContext context, StateSetter setSheetState)? after,
  bool dismissible = true,
}) {
  return showModalBottomSheet<R>(
    context: context,
    isScrollControlled: true,
    isDismissible: dismissible,
    enableDrag: dismissible,
    useSafeArea: true,
    backgroundColor: T.panel,
    barrierColor: Colors.black.withValues(alpha: 0.66),
    builder: (sheetContext) => StatefulBuilder(
      builder: (context, setSheetState) => _SheetShell(
        title: title,
        subtitle: subtitle,
        led: led,
        body: body(context, setSheetState),
        actions: actions?.call(context, setSheetState),
        after: after?.call(context, setSheetState),
      ),
    ),
  );
}

class _SheetShell extends StatelessWidget {
  const _SheetShell({
    required this.title,
    required this.body,
    this.subtitle,
    this.led,
    this.actions,
    this.after,
  });

  final String title;
  final String? subtitle;
  final Color? led;
  final Widget body;
  final List<Widget>? actions;
  final Widget? after;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return Padding(
      // The keyboard's own height, so the actions ride above the number pad
      // rather than under it.
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.92),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 38,
              height: 4,
              decoration: BoxDecoration(
                color: T.line2,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (led != null)
                    Container(
                      margin: const EdgeInsets.only(top: 6, right: 9),
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: led,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: led!.withValues(alpha: 0.6),
                            blurRadius: 8,
                          ),
                        ],
                      ),
                    ),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w800,
                        color: T.ink,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close, size: 20),
                    color: T.inkFaint,
                    tooltip: 'Close',
                  ),
                ],
              ),
            ),
            if (subtitle != null && subtitle!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                child: SizedBox(
                  width: double.infinity,
                  child: Text(
                    subtitle!,
                    style: const TextStyle(
                      fontSize: 11.5,
                      height: 1.45,
                      color: T.inkFaint,
                    ),
                  ),
                ),
              ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
                child: body,
              ),
            ),
            if (actions != null && actions!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Row(
                  children: [
                    for (var i = 0; i < actions!.length; i++) ...[
                      if (i > 0) const SizedBox(width: 10),
                      Expanded(child: actions![i]),
                    ],
                  ],
                ),
              ),
            if (after != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                child: after!,
              ),
            SizedBox(height: 10 + media.padding.bottom * 0.2),
          ],
        ),
      ),
    );
  }
}

/// A yes/no the crew has to answer twice - what every destructive control in
/// this app puts between the tap and the write.
///
/// The consequence is spelled out in [body] rather than left to the toast
/// afterwards: what these calls move is usually not on the screen the button is
/// on, and that is exactly the part somebody pressing Delete is least likely to
/// have in mind.
Future<bool> confirmSheet({
  required BuildContext context,
  required String title,
  String? subtitle,
  required String body,
  String keepLabel = 'Keep it',
  String goLabel = 'Yes, delete',
}) async {
  final answer = await showAppSheet<bool>(
    context: context,
    title: title,
    subtitle: subtitle,
    led: T.err,
    body: (context, _) => Hint(body),
    actions: (context, _) => [
      AppButton(
        label: keepLabel,
        onPressed: () => Navigator.of(context).pop(false),
      ),
      AppButton(
        label: goLabel,
        variant: ButtonVariant.danger,
        onPressed: () => Navigator.of(context).pop(true),
      ),
    ],
  );
  return answer ?? false;
}
