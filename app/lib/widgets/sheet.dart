/// The sheet every write on the shop floor happens in - a port of
/// client/src/components/ui/BottomSheet.tsx.
///
/// It slides up over a scrim, scrolls its body, keeps its actions pinned at the
/// bottom where a thumb can reach them, and lifts clear of the keyboard so the
/// number pad never covers the Save button. That last part is not a nicety: on
/// the tablets this replaces, a pad sitting over the actions is the difference
/// between a weighing that got filed and one that did not.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../core/theme/layout.dart';
import '../core/theme/tokens.dart';
import 'ui.dart';

/// Opens a sheet and waits for it to be gone.
///
/// [builder] is handed a `setSheetState` so the sheet can redraw its own
/// arithmetic as the crew types - a meter difference, a material cost, the
/// pieces still unboxed - without the page behind it rebuilding.
///
/// "Gone" is load-bearing, and it is not what `showModalBottomSheet` means by
/// it. That future completes the instant the route is popped, while the sheet
/// is still on screen sliding away - and every caller in this app does the same
/// thing on the line after the await:
///
///     await showAppSheet(...);
///     controller.dispose();
///
/// So the controllers behind the fields were being disposed with the fields
/// still mounted. Nothing happens as long as nothing rebuilds them in that
/// quarter of a second, which is why it survived to a shop-floor tablet before
/// anybody saw it. But a store notifying in that window - a toast landing, a
/// fetch coming back, the yard's poll - rebuilds the tree under the sheet, the
/// fields rebuild with it, and Flutter throws "A TextEditingController was used
/// after being disposed" over whatever the crew is looking at.
///
/// Waiting here for the sheet's own subtree to be torn down makes every one of
/// those callers correct as written, including the ones nobody has written yet.
/// The cost is that the await returns one animation later than it used to.
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
}) async {
  // Where the sheet comes from depends on what it is opening over.
  //
  // On a phone it rises from the bottom edge and stays there, which is right:
  // the crew is filling it in one-handed and everything on it should be under
  // the thumb.
  //
  // On a tablet that same sheet is wrong twice over. It is pinned to the far
  // edge of a screen held in two hands, so the fields are at arm's length from
  // the actions; and a 640 column welded to the bottom of a 1280-tall screen
  // reads as a phone's sheet that has been dropped into the corner of a bigger
  // one. So it becomes what it always was on that screen - a box in the middle
  // of the work, over a dimmed page, at the height of whatever it holds.
  //
  // Same shell, same body, same actions either way. The only difference is
  // where it comes from and what it is anchored to.
  final asDialog =
      screenFor(MediaQuery.sizeOf(context).width) != ScreenSize.phone;

  final gone = Completer<void>();
  Widget content(BuildContext _) => _SheetLifetime(
    onGone: () {
      if (!gone.isCompleted) gone.complete();
    },
    child: StatefulBuilder(
      builder: (context, setSheetState) => _SheetShell(
        title: title,
        subtitle: subtitle,
        led: led,
        centred: asDialog,
        body: body(context, setSheetState),
        actions: actions?.call(context, setSheetState),
        after: after?.call(context, setSheetState),
      ),
    ),
  );

  final result = asDialog
      ? await showDialog<R>(
          context: context,
          barrierDismissible: dismissible,
          barrierColor: Colors.black.withValues(alpha: 0.66),
          builder: (dialogContext) => Dialog(
            backgroundColor: T.panel,
            surfaceTintColor: Colors.transparent,
            clipBehavior: Clip.antiAlias,
            // Dialog adds the keyboard's own inset to this, so the box lifts
            // clear of the number pad without the shell doing it again.
            insetPadding: const EdgeInsets.symmetric(
              horizontal: 40,
              vertical: 32,
            ),
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(18)),
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 640),
              child: content(dialogContext),
            ),
          ),
        )
      : await showModalBottomSheet<R>(
          context: context,
          isScrollControlled: true,
          isDismissible: dismissible,
          enableDrag: dismissible,
          useSafeArea: true,
          backgroundColor: T.panel,
          barrierColor: Colors.black.withValues(alpha: 0.66),
          builder: content,
        );

  // Bounded, because a caller left waiting on a sheet that somehow never built
  // is a screen that has stopped responding - which is a worse failure than the
  // one this is here to prevent. A second is several times the animation.
  await gone.future.timeout(const Duration(seconds: 1), onTimeout: () {});
  return result;
}

/// Says when the sheet's subtree has actually been taken down.
///
/// Sits inside the route, so its `dispose` runs when the route is removed -
/// after the sheet has finished sliding away, not when the pop was asked for.
/// That is the moment the fields are no longer mounted and the controllers
/// behind them are safe to throw away.
class _SheetLifetime extends StatefulWidget {
  const _SheetLifetime({required this.onGone, required this.child});

  final VoidCallback onGone;
  final Widget child;

  @override
  State<_SheetLifetime> createState() => _SheetLifetimeState();
}

class _SheetLifetimeState extends State<_SheetLifetime> {
  @override
  void dispose() {
    widget.onGone();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _SheetShell extends StatelessWidget {
  const _SheetShell({
    required this.title,
    required this.body,
    this.subtitle,
    this.led,
    this.actions,
    this.after,
    this.centred = false,
  });

  final String title;
  final String? subtitle;
  final Color? led;
  final Widget body;
  final List<Widget>? actions;
  final Widget? after;

  /// Drawn as a box in the middle of the screen rather than rising from the
  /// bottom edge - what a tablet gets. Two things follow from it: there is no
  /// edge to drag it back down to, so the grab handle goes; and [Dialog] has
  /// already made room for the keyboard, so the shell must not do it twice.
  final bool centred;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return Padding(
      // The keyboard's own height, so the actions ride above the number pad
      // rather than under it.
      padding: EdgeInsets.only(bottom: centred ? 0 : media.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: media.size.height * (centred ? 0.86 : 0.92),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            if (!centred)
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
            // A gesture bar to clear at the bottom edge of a phone; nothing to
            // clear in the middle of a tablet, where the box has its own margin.
            SizedBox(height: centred ? 12 : 10 + media.padding.bottom * 0.2),
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
