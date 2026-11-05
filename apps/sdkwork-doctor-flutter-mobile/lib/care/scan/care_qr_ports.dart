/// Typed platform ports of the 扫一扫 (QR scan) capability.
///
/// The scan screen depends on these interfaces only
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 7: plugin calls stay
/// behind typed adapters). The plugin-backed implementation lives in
/// `system_care_qr_ports.dart`; tests inject a deterministic fake so no widget
/// test opens a camera or a permission dialog.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Lifecycle of one QR scan session.
enum CareQrScanStatus {
  /// No camera is running.
  idle,

  /// The camera is opening, or the first frame has not arrived yet.
  starting,

  /// The camera is live and QR detection is running.
  scanning,

  /// The user denied the camera permission.
  permissionDenied,

  /// The device has no usable camera.
  unavailable,
}

/// Torch capability and state of the running camera.
enum CareQrTorch {
  /// The device or camera has no torch.
  unavailable,

  /// The torch is off.
  off,

  /// The torch is on.
  on,
}

/// One scanner session owned by the 扫一扫 screen.
///
/// Implementations publish lifecycle through [status] and [torch] so the screen
/// renders loading, permission-denied, and unavailable states without catching
/// provider exceptions.
abstract class CareQrScannerPort {
  /// Lifecycle of the camera, updated as the platform starts or fails.
  ValueListenable<CareQrScanStatus> get status;

  /// Torch capability and state of the running camera.
  ValueListenable<CareQrTorch> get torch;

  /// Starts the camera and QR detection.
  ///
  /// [onDetected] receives the raw text of the first QR code. A session reports
  /// at most one detection; the screen closes the camera before showing the
  /// result.
  void open({required ValueChanged<String> onDetected});

  /// Live camera preview; empty until [open] created a session.
  Widget buildPreview(BuildContext context);

  /// Switches the torch on or off. A no-op when the device has no torch.
  Future<void> toggleTorch();

  /// Stops the camera and releases it. Safe to call more than once.
  Future<void> close();
}

/// Creates the platform scanner of one 扫一扫 screen.
///
/// The shell composes the system environment; tests inject a fake so no widget
/// test touches a camera sensor.
abstract class CareQrScanEnvironment {
  /// Builds a scanner session. The screen owns its lifecycle.
  CareQrScannerPort createScanner();
}
