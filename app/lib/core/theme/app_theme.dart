import 'package:flutter/material.dart';
import 'tokens.dart';

/// The one ThemeData the app runs on. Dark by design: these are tablets held on
/// a plant floor for a whole shift, and the web client has only ever had the
/// one scheme.
ThemeData buildAppTheme() {
  const scheme = ColorScheme.dark(
    primary: T.brand,
    onPrimary: T.onFill,
    secondary: T.elec,
    onSecondary: T.onFill,
    error: T.err,
    onError: T.onFill,
    surface: T.panel,
    onSurface: T.ink,
  );

  const inputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(T.radiusSm)),
    borderSide: BorderSide(color: T.line),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: T.bg,
    canvasColor: T.bg,
    dividerColor: T.rule,
    splashFactory: InkRipple.splashFactory,
    fontFamily: 'Roboto',
    textTheme: const TextTheme(
      bodyLarge: TextStyle(color: T.ink, fontSize: 15),
      bodyMedium: TextStyle(color: T.ink, fontSize: 13.5, height: 1.35),
      bodySmall: TextStyle(color: T.inkFaint, fontSize: 11.5, height: 1.35),
      titleLarge: TextStyle(
        color: T.ink,
        fontSize: 20,
        fontWeight: FontWeight.w800,
      ),
      titleMedium: TextStyle(
        color: T.ink,
        fontSize: 15,
        fontWeight: FontWeight.w700,
      ),
      labelLarge: TextStyle(
        color: T.ink,
        fontSize: 13,
        fontWeight: FontWeight.w700,
      ),
    ),
    iconTheme: const IconThemeData(color: T.inkDim),
    appBarTheme: const AppBarTheme(
      backgroundColor: T.bg2,
      surfaceTintColor: Colors.transparent,
      foregroundColor: T.ink,
      elevation: 0,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: T.panel,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: T.panel,
      surfaceTintColor: Colors.transparent,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: T.sunken,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      hintStyle: const TextStyle(color: T.inkFaint, fontSize: 13.5),
      border: inputBorder,
      enabledBorder: inputBorder,
      focusedBorder: inputBorder.copyWith(
        borderSide: const BorderSide(color: T.brand, width: 1.4),
      ),
      errorBorder: inputBorder.copyWith(
        borderSide: const BorderSide(color: T.err),
      ),
      focusedErrorBorder: inputBorder.copyWith(
        borderSide: const BorderSide(color: T.err, width: 1.4),
      ),
      suffixStyle: const TextStyle(color: T.inkFaint, fontSize: 12),
    ),
    dropdownMenuTheme: const DropdownMenuThemeData(
      menuStyle: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(T.panel2),
        surfaceTintColor: WidgetStatePropertyAll(Colors.transparent),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: T.bg2,
      surfaceTintColor: Colors.transparent,
      indicatorColor: T.brand.withValues(alpha: 0.16),
      labelTextStyle: const WidgetStatePropertyAll(
        TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: T.inkDim),
      ),
      iconTheme: const WidgetStatePropertyAll(IconThemeData(color: T.inkDim)),
      height: 62,
    ),
    // The same bar, stood on its end for a tablet - so it is dressed the same:
    // the plate's ground, the brand as the indicator, and labels that read as
    // quietly as the ones along the bottom edge of a phone.
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: T.bg2,
      indicatorColor: T.brand.withValues(alpha: 0.16),
      useIndicator: true,
      selectedLabelTextStyle: const TextStyle(
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
        color: T.brand,
      ),
      unselectedLabelTextStyle: const TextStyle(
        fontSize: 10.5,
        fontWeight: FontWeight.w600,
        color: T.inkDim,
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: T.brand,
      linearTrackColor: T.line,
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: T.panel2,
      contentTextStyle: TextStyle(color: T.ink, fontSize: 13),
    ),
  );
}
