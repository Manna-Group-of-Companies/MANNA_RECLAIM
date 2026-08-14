/// Where the app changes shape, and the arithmetic behind it.
///
/// One file, for the same reason [T] is one file: a layout rule that lives in
/// three pages drifts in two of them. Everything that asks "how wide is this
/// device" asks here.
///
/// The app is written phone-first - a card is a column of chips and a button,
/// sized for a gloved thumb - and that is the shape it keeps on a handset. What
/// a tablet gets is not a different app and not a different set of controls: it
/// is the same cards, laid out two or three across so the width is not wasted.
///
/// The tab bar stays along the bottom on every device. A side rail was tried on
/// the tablet and taken back out - the crews reach for the tabs at the bottom
/// edge whichever device is in their hands, and a bar that moves depending on
/// the screen is one they have to look for.
library;

import 'package:flutter/widgets.dart';

/// The three widths this app draws differently.
enum ScreenSize {
  /// A handset, or a small window. One card per row, and a sheet that fills
  /// the screen.
  phone,

  /// The shop-floor tablets held upright, and a phone turned on its side.
  /// Cards two across, sheets held to a centred column.
  tablet,

  /// The tablet laid down, or the desktop web build the office reads. Cards
  /// three across.
  wide,
}

/// The two widths where the layout changes.
///
/// 600 is the long-standing Material handset/tablet line, and it is also where
/// a phone in landscape lands - which is deliberate. A handset on its side has
/// the width for a second column of cards, and its own reason to want one:
/// almost no height to scroll through.
///
/// 1000 is set where it is because of the hardware below - it is the line the
/// plant's tablet crosses when it is laid down, so upright it reads in two
/// columns and on the bench in three.
class Breaks {
  const Breaks._();

  static const tablet = 600.0;
  static const wide = 1000.0;
}

/// The devices this is actually drawn for, in logical pixels.
///
/// Written down because the only thing worse than a magic number is a magic
/// number somebody has to re-derive from a spec sheet. Physical pixels are not
/// what any of this is measured in - a Tab M11 is 1920 x 1200 of glass, and
/// Android hands Flutter 1280 x 800 of it at its 1.5 density.
///
///   Lenovo Tab M11    800 x 1280 upright   -> tablet: 2 columns
///   (the plant's)    1280 x 800  laid down -> wide:   3 columns
///   moto g73 5G       411 x 914  upright   -> phone:  1 column
///                     914 x 411  sideways  -> tablet: 2 columns
///
/// The upright tablet is the case the column arithmetic is tuned against: 800
/// less the gutters is about 760, and [columnsFor]'s default minimum tile is
/// set so that is two columns and not one - with room to spare, which is what
/// keeps it two after the bar went back to the bottom and gave the width back.
///
/// A device that is not on this list needs nothing done to it. The classes are
/// read off the width at build time, so an unfamiliar screen lands in whichever
/// of the three it belongs to.
class KnownScreens {
  const KnownScreens._();

  /// The Tab M11 held upright, which is how it sits in a charging cradle.
  static const tabM11Portrait = Size(800, 1280);

  /// And laid down on the bench, which is how it is read at the machine.
  static const tabM11Landscape = Size(1280, 800);
}

/// Which of the three a given width is.
ScreenSize screenFor(double width) => width >= Breaks.wide
    ? ScreenSize.wide
    : width >= Breaks.tablet
    ? ScreenSize.tablet
    : ScreenSize.phone;

extension ScreenQuery on BuildContext {
  /// The size class of the window this widget is being drawn in.
  ScreenSize get screenSize => screenFor(MediaQuery.sizeOf(this).width);
}

/// The breathing room down either side of a page's content.
///
/// It grows with the screen, but only a little: a card that is easy to read on
/// a phone does not become easier to read by being pushed further from the
/// bezel, and on a tablet held in two hands the outer inch is where the thumbs
/// are.
double pageGutter(ScreenSize size) => switch (size) {
  ScreenSize.phone => 14,
  ScreenSize.tablet => 18,
  ScreenSize.wide => 22,
};

/// How many cards fit across [width], given the narrowest one worth drawing.
///
/// The cards in this app were drawn for a phone, and stretching one to the full
/// width of a landscape tablet does not make it say more - it makes a line of
/// text a foot long with a button marooned at the end of it. So the width is
/// spent on more columns rather than wider cards, up to [limit]: past three the
/// cards are back to being narrow and the eye has too many places to start.
///
/// [gap] is counted, so the tiles this returns really do fit side by side.
/// The default [minTile] is set off the tablets this app is actually used on:
/// 800dp across in portrait, less the page gutter either side, leaves about
/// 760 - which is two columns of a card that was drawn for a handset, with the
/// gap between them.
int columnsFor(
  double width, {
  double minTile = 320,
  double gap = 10,
  int limit = 3,
}) {
  if (width <= 0 || !width.isFinite) return 1;
  final columns = ((width + gap) / (minTile + gap)).floor();
  return columns.clamp(1, limit);
}

/// The widest a column of prose or a form should ever get.
///
/// Settings, the diagnostic log and the login card are read rather than worked,
/// and a line that runs the whole width of a tablet is one the eye loses its
/// place in on the way back.
const readableWidth = 620.0;
