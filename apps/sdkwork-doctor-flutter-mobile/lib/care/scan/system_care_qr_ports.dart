/// `mobile_scanner` implementation of the QR scan platform ports.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'care_qr_ports.dart';

/// Maps the plugin's camera state to the lifecycle the screen renders.
CareQrScanStatus careQrScanStatusFor(MobileScannerState state) {
  final MobileScannerException? error = state.error;
  if (error != null) {
    return error.errorCode == MobileScannerErrorCode.permissionDenied
        ? CareQrScanStatus.permissionDenied
        : CareQrScanStatus.unavailable;
  }
  if (state.isRunning || state.isInitialized) {
    return CareQrScanStatus.scanning;
  }
  return CareQrScanStatus.starting;
}

/// Maps the plugin's torch state to the torch control state.
CareQrTorch careQrTorchFor(TorchState state) => switch (state) {
      TorchState.on => CareQrTorch.on,
      TorchState.off || TorchState.auto => CareQrTorch.off,
      TorchState.unavailable => CareQrTorch.unavailable,
    };

/// `mobile_scanner` scanner: back camera, QR codes only.
class MobileScannerCareQrScanner implements CareQrScannerPort {
  final ValueNotifier<CareQrScanStatus> _status =
      ValueNotifier<CareQrScanStatus>(CareQrScanStatus.idle);
  final ValueNotifier<CareQrTorch> _torch =
      ValueNotifier<CareQrTorch>(CareQrTorch.unavailable);

  MobileScannerController? _controller;
  ValueChanged<String>? _onDetected;
  bool _detected = false;
  Future<void>? _closeFuture;

  @override
  ValueListenable<CareQrScanStatus> get status => _status;

  @override
  ValueListenable<CareQrTorch> get torch => _torch;

  @override
  void open({required ValueChanged<String> onDetected}) {
    final MobileScannerController? previous = _controller;
    if (previous != null) {
      previous.removeListener(_syncState);
      unawaited(previous.dispose());
    }
    _onDetected = onDetected;
    _detected = false;
    final MobileScannerController controller = MobileScannerController(
      formats: const <BarcodeFormat>[BarcodeFormat.qrCode],
      facing: CameraFacing.back,
    );
    controller.addListener(_syncState);
    _controller = controller;
    _status.value = CareQrScanStatus.starting;
    _torch.value = CareQrTorch.unavailable;
    _syncState();
  }

  @override
  Widget buildPreview(BuildContext context) {
    final MobileScannerController? controller = _controller;
    if (controller == null) {
      return const SizedBox.shrink();
    }
    return MobileScanner(
      controller: controller,
      onDetect: _handleCapture,
      // The screen owns the user-facing permission and failure copy; the raw
      // plugin message must not flash underneath it.
      errorBuilder: (BuildContext context, MobileScannerException error) =>
          const ColoredBox(color: Color(0xFF000000)),
    );
  }

  @override
  Future<void> toggleTorch() async {
    final MobileScannerController? controller = _controller;
    if (controller == null) {
      return;
    }
    try {
      await controller.toggleTorch();
    } on MobileScannerException {
      // A camera without a torch, or one that is still starting, keeps the
      // control in its current state.
    }
  }

  @override
  Future<void> close() async {
    final Future<void>? inFlight = _closeFuture;
    if (inFlight != null) {
      // A lifecycle pause can overlap a retry; both callers wait for the same
      // camera release instead of opening a second session mid-dispose.
      return inFlight;
    }
    final MobileScannerController? controller = _controller;
    _controller = null;
    _onDetected = null;
    _status.value = CareQrScanStatus.idle;
    _torch.value = CareQrTorch.unavailable;
    final Future<void> closing = _release(controller);
    _closeFuture = closing;
    try {
      await closing;
    } finally {
      if (identical(_closeFuture, closing)) {
        _closeFuture = null;
      }
    }
  }

  Future<void> _release(MobileScannerController? controller) async {
    if (controller == null) {
      return;
    }
    controller.removeListener(_syncState);
    await controller.dispose();
  }

  /// Copies the plugin's camera state into the port's listenables.
  void _syncState() {
    final MobileScannerController? controller = _controller;
    if (controller == null) {
      return;
    }
    final MobileScannerState value = controller.value;
    _status.value = careQrScanStatusFor(value);
    _torch.value = careQrTorchFor(value.torchState);
  }

  /// Reports the first QR code and ignores every later frame of this session.
  void _handleCapture(BarcodeCapture capture) {
    final ValueChanged<String>? handler = _onDetected;
    if (_detected || handler == null || capture.barcodes.isEmpty) {
      return;
    }
    final String? value = capture.barcodes.first.rawValue?.trim();
    if (value == null || value.isEmpty) {
      return;
    }
    _detected = true;
    handler(value);
  }
}

/// Composes the `mobile_scanner` platform scanner.
class SystemCareQrScanEnvironment implements CareQrScanEnvironment {
  const SystemCareQrScanEnvironment();

  @override
  CareQrScannerPort createScanner() => MobileScannerCareQrScanner();
}
