import 'package:flutter/material.dart';

/// The shop-floor look, as one block of tokens.
///
/// A direct port of the `:root` block in client/src/index.css, and it keeps the
/// same rule: no widget sets a raw colour, everything reads a token from here,
/// so a re-skin is a change to this file and nothing else.
class T {
  const T._();

  // ---------- ground ----------
  // An elevation ladder rather than a set of greys: the page is the darkest
  // thing on screen, a card sits above it, a raised surface above that, and a
  // well is cut back below.
  static const bg = Color(0xFF0A0E14);
  static const bg2 = Color(0xFF0E131A);
  static const panel = Color(0xFF151D27);
  static const panel2 = Color(0xFF1B2531);

  /// Recessed surfaces - input wells, list rows, anything set *into* a panel.
  static const sunken = Color(0xFF10161E);

  static const line = Color(0xFF26323F);
  static const line2 = Color(0xFF3B4B5C);

  /// The hairline between rows of a list or table: quieter than a border.
  static const rule = Color(0xFF1C2531);

  static const hover = Color(0x0EFFFFFF);

  // ---------- type ----------
  // Not pure white: #fff on a near-black panel haloes under plant lighting and
  // is tiring on a screen somebody reads for a whole shift.
  static const ink = Color(0xFFE7EEF6);
  static const inkDim = Color(0xFFA9BACB);
  static const inkFaint = Color(0xFF7E91A4);

  // ---------- accents ----------
  /// The one colour that means "this is live / this is the action".
  static const brand = Color(0xFF4D9FE8);
  static const brandSoft = Color(0xFF7CBCF2);
  static const brandDeep = Color(0xFF2F78BB);

  /// Text and glyphs sitting *on* any saturated fill. One token, because on a
  /// dark theme every fill in this palette is a light one.
  static const onFill = Color(0xFF08131D);

  static const elec = Color(0xFF5CC8DE);
  static const steel = Color(0xFF8A9EB0);
  static const ember = Color(0xFFF79C56);

  static const ok = Color(0xFF3FCF9A);
  static const warn = Color(0xFFF0C453);
  static const err = Color(0xFFFC675C);

  /// The name the markup grew up with; the brand accent under an older name.
  static const amber = brand;

  // ---------- state tints ----------
  // Every tinted box in the app is one of these pairs: a deep fill and a
  // slightly stronger line, with the saturated token above supplying the text.
  static const tBrandBg = Color(0xFF0F2133);
  static const tBrandLine = Color(0xFF2A4F75);
  static const tElecBg = Color(0xFF0D2229);
  static const tElecLine = Color(0xFF22525F);
  static const tOkBg = Color(0xFF0C2320);
  static const tOkLine = Color(0xFF1E4A3C);
  static const tWarnBg = Color(0xFF241D0D);
  static const tWarnLine = Color(0xFF57431A);
  static const tErrBg = Color(0xFF2A1512);
  static const tErrLine = Color(0xFF5E2B25);
  static const tEmberBg = Color(0xFF271A0F);
  static const tEmberLine = Color(0xFF5B3B1E);

  // ---------- metrics ----------
  static const radius = 12.0;
  static const radiusSm = 8.0;
  static const gap = 12.0;
}
