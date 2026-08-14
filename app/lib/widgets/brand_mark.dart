/// The company mark: Manna's green tile with the reclaim loop on it.
///
/// The shell header and the login plate each drew this inline, as a gradient
/// [Container] wrapped around `Icons.autorenew` - two copies, and neither of
/// them the mark. `autorenew` is Material's circular-arrow glyph: the arrows
/// sit at 12 and 6 o'clock and the ring is a near-closed circle, where the
/// company's loop breaks at the top-right and bottom-left with the heads
/// turned in. Beside the website, which draws the real thing, they read as two
/// different companies.
///
/// So the glyph is the website's, point for point: `refresh-cw` from lucide,
/// the same 24-unit outline `client/src/components/layout/Header.tsx` inlines
/// as SVG. Ported as a [Path] rather than pulled in through an SVG package -
/// it is one shape that will not change, and it is not worth a dependency.
///
/// The green is the company's identity rather than a theme colour, so it is
/// written here and not taken from [T]: it stays the same green if the theme
/// moves. It matches `--brand-green` on the web and the launcher icon in
/// `android/app/src/main/res`.
library;

import 'package:flutter/material.dart';

/// Manna's green, top-left to bottom-right. Shared with the web client's
/// `mannaLogo` gradient and the Android adaptive icon's background layer.
const _brandGreen = [Color(0xFF6CB83F), Color(0xFF3F8A22)];

/// The tile and the loop. [size] is the tile's edge; the glyph is inset within
/// it on the same proportion the website uses (24 units of glyph in 36 of
/// tile), so the two marks are the same drawing at any size.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 30});

  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: _brandGreen,
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      // 8 on a 30pt tile, the web client's 10-on-36, kept proportional so the
      // corner does not turn into a circle on the big login plate.
      borderRadius: BorderRadius.circular(size * 0.27),
    ),
    child: Center(
      child: CustomPaint(
        size: Size.square(size * (24 / 36)),
        painter: _ReclaimLoop(),
      ),
    ),
  );
}

/// lucide's `refresh-cw`, drawn in its own 24x24 box and scaled to fit.
///
/// Stroke width tracks the box rather than being fixed: the mark is drawn at
/// 18pt in the header and 26pt on the login plate, and a constant width would
/// be spidery on one and heavy on the other.
class _ReclaimLoop extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 24;
    final path = Path()
      // the two arrow heads
      ..moveTo(23, 4)
      ..lineTo(23, 10)
      ..lineTo(17, 10)
      ..moveTo(1, 20)
      ..lineTo(1, 14)
      ..lineTo(7, 14)
      // upper sweep, left to right, into the head at 23,10
      ..moveTo(3.51, 9)
      ..arcToPoint(
        const Offset(18.36, 5.64),
        radius: const Radius.circular(9),
        clockwise: true,
      )
      ..lineTo(23, 10)
      // lower sweep, right to left, out of the head at 1,14
      ..moveTo(1, 14)
      ..lineTo(5.64, 18.36)
      ..arcToPoint(
        const Offset(20.49, 15),
        radius: const Radius.circular(9),
        clockwise: false,
      );

    canvas.drawPath(
      path.transform(Matrix4.diagonal3Values(k, k, 1).storage),
      Paint()
        ..style = PaintingStyle.stroke
        ..color = Colors.white
        ..strokeWidth = 2.2 * k
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_ReclaimLoop oldDelegate) => false;
}
