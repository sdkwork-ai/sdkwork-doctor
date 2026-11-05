import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:sdkwork_doctor_flutter_mobile/care/scan/care_qr_ports.dart';
import 'package:sdkwork_doctor_flutter_mobile/care/scan/system_care_qr_ports.dart';

MobileScannerState _state({
  MobileScannerException? error,
  bool isInitialized = true,
  bool isRunning = true,
  bool isStarting = false,
  TorchState torchState = TorchState.off,
}) =>
    MobileScannerState(
      availableCameras: 2,
      cameraDirection: CameraFacing.back,
      cameraLensType: CameraLensType.any,
      isInitialized: isInitialized,
      isStarting: isStarting,
      isRunning: isRunning,
      size: const Size(1080, 1920),
      torchState: torchState,
      zoomScale: 1,
      deviceOrientation: DeviceOrientation.portraitUp,
      error: error,
    );

/// Contract of the mobile_scanner to care-port state mapping, without a camera.
void main() {
  test('a running camera maps to the scanning lifecycle', () {
    expect(careQrScanStatusFor(_state()), CareQrScanStatus.scanning);
  });

  test('a denied permission keeps its own lifecycle', () {
    expect(
      careQrScanStatusFor(_state(
        isInitialized: false,
        isRunning: false,
        error: const MobileScannerException(
          errorCode: MobileScannerErrorCode.permissionDenied,
        ),
      )),
      CareQrScanStatus.permissionDenied,
    );
  });

  test('a missing camera maps to unavailable', () {
    expect(
      careQrScanStatusFor(_state(
        isInitialized: false,
        isRunning: false,
        error: const MobileScannerException(
          errorCode: MobileScannerErrorCode.unsupported,
        ),
      )),
      CareQrScanStatus.unavailable,
    );
  });

  test('an uninitialized camera maps to starting', () {
    expect(
      careQrScanStatusFor(_state(isInitialized: false, isRunning: false)),
      CareQrScanStatus.starting,
    );
  });

  test('the torch control maps every platform torch state', () {
    expect(careQrTorchFor(TorchState.unavailable), CareQrTorch.unavailable);
    expect(careQrTorchFor(TorchState.off), CareQrTorch.off);
    expect(careQrTorchFor(TorchState.auto), CareQrTorch.off);
    expect(careQrTorchFor(TorchState.on), CareQrTorch.on);
  });
}
