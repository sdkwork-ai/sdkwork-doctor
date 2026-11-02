import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Tech-blue, flat, borderless theme.
///
/// Every value here mirrors `specs/design-tokens.contract.json`: no elevation
/// anywhere, no card/border strokes, separation comes from the tonal canvas and
/// surface-alt layers, and the only saturated colour is the tech blue.
const Color kTechBlue = Color(0xFF0A5CFF);
const Color kTechBlueStrong = Color(0xFF0747C9);
const Color kTechBlueSoft = Color(0xFFE7EFFF);
const Color kTechCyan = Color(0xFF00D2FF);
const Color kChromeNavy = Color(0xFF061A3A);
const Color kChromeInk = Color(0xFFDCE8FF);
const Color kCanvas = Color(0xFFF2F5FA);
const Color kSurface = Color(0xFFFFFFFF);
const Color kSurfaceAlt = Color(0xFFE6EDF8);
const Color kInk = Color(0xFF0A1324);
const Color kMuted = Color(0xFF5A6B85);
const Color kDanger = Color(0xFFE5484D);

ThemeData buildDoctorTheme() {
  final ColorScheme scheme = ColorScheme.fromSeed(seedColor: kTechBlue, brightness: Brightness.light).copyWith(
    primary: kTechBlue,
    onPrimary: Colors.white,
    primaryContainer: kTechBlueSoft,
    onPrimaryContainer: kTechBlueStrong,
    secondary: kTechCyan,
    onSecondary: kChromeNavy,
    secondaryContainer: kTechBlueSoft,
    onSecondaryContainer: kTechBlueStrong,
    surface: Colors.white,
    onSurface: kInk,
    surfaceContainerHighest: kSurfaceAlt,
    error: kDanger,
    onError: Colors.white,
  );

  final RoundedRectangleBorder controlShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));
  const RoundedRectangleBorder cardShape = RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(14)));

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: kCanvas,
    appBarTheme: const AppBarTheme(
      // Aligned with the sdkwork-agents surface: light chrome, centered page
      // title, a menu button on the left and one primary action on the right.
      backgroundColor: Colors.white,
      foregroundColor: kInk,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(color: kInk, fontSize: 17, fontWeight: FontWeight.w600),
      iconTheme: IconThemeData(color: kInk),
      systemOverlayStyle: SystemUiOverlayStyle.dark,
    ),
    drawerTheme: const DrawerThemeData(
      backgroundColor: Colors.white,
      elevation: 0,
    ),
    cardTheme: const CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.only(bottom: 10),
      shape: cardShape,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      elevation: 0,
      height: 70,
      indicatorColor: kTechBlueSoft,
      labelTextStyle: WidgetStateProperty.resolveWith((Set<WidgetState> states) => TextStyle(
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? kTechBlueStrong : kMuted,
          )),
      iconTheme: WidgetStateProperty.resolveWith((Set<WidgetState> states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? kTechBlueStrong : kMuted,
          )),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kSurfaceAlt,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kTechBlue, width: 2),
      ),
      labelStyle: const TextStyle(color: kMuted),
      hintStyle: const TextStyle(color: kMuted),
      floatingLabelStyle: const TextStyle(color: kTechBlueStrong),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kTechBlueSoft,
      side: BorderSide.none,
      shape: const StadiumBorder(),
      labelStyle: const TextStyle(color: kTechBlueStrong, fontSize: 12, fontWeight: FontWeight.w600),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kTechBlue,
        foregroundColor: Colors.white,
        elevation: 0,
        shape: controlShape,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: kTechBlueStrong, shape: controlShape),
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
    ),
    dividerTheme: const DividerThemeData(color: kSurfaceAlt, thickness: 1, space: 1),
    listTileTheme: const ListTileThemeData(iconColor: kMuted, textColor: kInk),
  );
}
