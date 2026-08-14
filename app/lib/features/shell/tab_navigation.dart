import 'package:flutter/material.dart';

/// What a press on the bottom bar turned out to mean.
enum TabTap {
  /// Go to the tab that was pressed.
  navigate,

  /// Take the tab that was pressed back to the top of its list.
  scrollToTop,

  /// Nothing yet. Either the press was the first half of a double-tap, or it
  /// landed somewhere that has nothing to do.
  none,
}

/// Reads presses on the bottom bar and says what each one meant.
///
/// The rule the shop floor asked for, in three lines:
///
/// - a press on another tab is a plain move, decided immediately;
/// - a press on the tab already showing arms, and says nothing;
/// - a second press on that same tab inside [window] is the double-tap, and
///   that is the only thing that scrolls.
///
/// The arm is what makes this safe. A double-tap aimed at a tab the crew is not
/// standing on lands as move-then-arm and scrolls nothing, so "already on that
/// tab" is enforced at the start of the gesture rather than halfway through it.
/// A single stray press - a sleeve on the bar, an impatient second press on a
/// tab that felt slow to draw - arms and then expires, which is the same as
/// nothing happening.
///
/// The clock is passed in rather than read here so the timing can be tested
/// without waiting on a real one.
class TabTapReader {
  TabTapReader({this.window = const Duration(milliseconds: 500)});

  /// How close together the two presses have to land.
  ///
  /// The platform convention for a double-tap is 300ms. This is a shop-floor
  /// tablet handled with gloves on, so the window is stretched a little - but
  /// not so far that two unrelated presses a beat apart read as one gesture.
  final Duration window;

  int? _armedIndex;
  DateTime? _armedAt;

  /// [tapped] is the destination pressed, [current] the tab on screen.
  TabTap read(int tapped, int current, DateTime now) {
    if (tapped != current) {
      // Crossing to another tab cancels any half-made gesture, so arriving on
      // Weigh and pressing it again arms rather than scrolls.
      _disarm();
      return TabTap.navigate;
    }

    if (_armedIndex != tapped ||
        _armedAt == null ||
        now.difference(_armedAt!) > window) {
      _armedIndex = tapped;
      _armedAt = now;
      return TabTap.none;
    }

    // Consume the gesture, so a third press starts a fresh pair rather than
    // firing a second scroll off the back of this one.
    _disarm();
    return TabTap.scrollToTop;
  }

  /// Forget any pending first press - used when the tab changes underneath the
  /// bar without a press, so a stale arm cannot be completed minutes later.
  void _disarm() {
    _armedIndex = null;
    _armedAt = null;
  }
}

/// Hands [controller] to a tab's subtree as its [PrimaryScrollController].
///
/// This is what lets the shell scroll a page it knows nothing about: the tab
/// pages build plain `ListView`s with no controller of their own, and a
/// controller-less vertical `ScrollView` adopts the primary one. Nothing on the
/// page side has to know the bottom bar exists.
///
/// Flutter's default is to inherit on the mobile platforms only, which would
/// leave the desktop web build - the one the office reads - with a controller
/// attached to nothing. Every tab's list is the primary one on its page,
/// wherever the page is being read, so every platform is opted in.
///
/// Nested scrollables are not caught by this: `ScrollView` inserts a
/// [PrimaryScrollController.none] below itself once it has adopted the primary
/// controller, so a list inside a list keeps its own scrolling.
class TabScrollScope extends StatelessWidget {
  const TabScrollScope({
    super.key,
    required this.controller,
    required this.child,
  });

  final ScrollController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) => PrimaryScrollController(
    controller: controller,
    automaticallyInheritForPlatforms: TargetPlatform.values.toSet(),
    child: child,
  );
}

/// Walks a tab's list back to the top, if it is anywhere else.
///
/// Returns once the list has settled, or immediately when there is nothing to
/// do: the tab may still be on its loader with no list built yet, or already at
/// rest at the top - a double-tap up there should be a no-op, not a twitch.
Future<void> scrollTabToTop(ScrollController controller) async {
  if (!controller.hasClients) return;

  // Read through `positions` rather than `position`: the latter asserts a
  // single attached view, and a page swapping its empty state for its loaded
  // list can briefly have two.
  final pending = [
    for (final position in controller.positions)
      if (position.pixels > position.minScrollExtent + 1) position,
  ];
  if (pending.isEmpty) return;

  await Future.wait([
    for (final position in pending)
      position.animateTo(
        position.minScrollExtent,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      ),
  ]);
}
