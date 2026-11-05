import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../care/scan/care_qr_ports.dart';
import '../i18n/care_i18n.dart';
import '../theme/doctor_theme.dart';

/// 扫一扫: the full-screen QR scanner behind the "+" menu.
///
/// The screen starts one [CareQrScannerPort] session, draws the WeChat-style
/// scan frame over the live camera, and swaps to a result panel after the first
/// QR code. The port owns the camera; this screen only renders its lifecycle so
/// a denied permission or a missing camera never leaves a blank black page.
class CareScanScreen extends StatefulWidget {
  const CareScanScreen({
    super.key,
    required this.locale,
    required this.scanner,
  });

  /// Catalog locale of every label on the screen.
  final String locale;

  /// Camera session owned by this screen; closed on dispose.
  final CareQrScannerPort scanner;

  @override
  State<CareScanScreen> createState() => _CareScanScreenState();
}

class _CareScanScreenState extends State<CareScanScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _scanLine;
  late CareQrScanStatus _status;
  String? _result;
  bool _detected = false;
  bool _animationsDisabled = false;
  bool _pausedByLifecycle = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _status = widget.scanner.status.value;
    widget.scanner.status.addListener(_onStatus);
    _scanLine = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    );
    // Closing first makes a retry or a lifecycle restart deterministic: the
    // next open always starts from a released camera.
    unawaited(_start());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _animationsDisabled = MediaQuery.of(context).disableAnimations;
    _syncAnimation();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.scanner.status.removeListener(_onStatus);
    unawaited(widget.scanner.close());
    _scanLine.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_pausedByLifecycle) {
        _pausedByLifecycle = false;
        unawaited(_start());
      }
      return;
    }
    // A permission prompt reports `inactive`, not `paused`; treating it as a
    // stop would dispose the camera while the system dialog is still open.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      if (_result == null && !_pausedByLifecycle) {
        _pausedByLifecycle = true;
        unawaited(widget.scanner.close());
      }
    }
  }

  Future<void> _start() async {
    await widget.scanner.close();
    if (!mounted) {
      return;
    }
    setState(() {
      _result = null;
      _detected = false;
    });
    widget.scanner.open(onDetected: _handleDetected);
  }

  void _onStatus() {
    if (!mounted) {
      return;
    }
    setState(() => _status = widget.scanner.status.value);
    _syncAnimation();
  }

  void _syncAnimation() {
    final bool shouldRun =
        _status == CareQrScanStatus.scanning && !_animationsDisabled;
    if (shouldRun && !_scanLine.isAnimating) {
      _scanLine.repeat(reverse: true);
    } else if (!shouldRun && _scanLine.isAnimating) {
      _scanLine.stop();
    }
  }

  void _handleDetected(String value) {
    if (!mounted || _detected) {
      return;
    }
    _detected = true;
    unawaited(widget.scanner.close());
    _scanLine.stop();
    unawaited(HapticFeedback.mediumImpact());
    setState(() {
      _result = value;
      _status = CareQrScanStatus.idle;
    });
  }

  void _retry() => unawaited(_start());

  void _rescan() => unawaited(_start());

  void _finish() => Navigator.of(context).pop<String>(_result);

  @override
  Widget build(BuildContext context) {
    final String locale = widget.locale;
    final String? result = _result;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        title: Text(careText(locale, 'platform.care.scan.title')),
        actions: <Widget>[
          if (_status == CareQrScanStatus.scanning)
            ValueListenableBuilder<CareQrTorch>(
              valueListenable: widget.scanner.torch,
              builder: (BuildContext context, CareQrTorch torch, Widget? _) {
                if (torch == CareQrTorch.unavailable) {
                  return const SizedBox.shrink();
                }
                final bool isOn = torch == CareQrTorch.on;
                return IconButton(
                  tooltip: careText(
                    locale,
                    isOn
                        ? 'platform.care.scan.torchOff'
                        : 'platform.care.scan.torchOn',
                  ),
                  icon: Icon(isOn ? Icons.flashlight_on : Icons.flashlight_off),
                  onPressed: () => unawaited(widget.scanner.toggleTorch()),
                );
              },
            ),
        ],
      ),
      body: result == null
          ? _buildScanner(locale)
          : _ScanResultBody(
              locale: locale,
              value: result,
              onRescan: _rescan,
              onDone: _finish,
            ),
    );
  }

  Widget _buildScanner(String locale) {
    final bool hasFailure = _status == CareQrScanStatus.permissionDenied ||
        _status == CareQrScanStatus.unavailable;
    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        widget.scanner.buildPreview(context),
        if (hasFailure)
          _ScanFailure(
            locale: locale,
            permissionDenied: _status == CareQrScanStatus.permissionDenied,
            onRetry: _retry,
          )
        else if (_status == CareQrScanStatus.scanning)
          _ScanOverlay(locale: locale, progress: _scanLine)
        else
          const Center(
            child: SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                color: Colors.white,
              ),
            ),
          ),
      ],
    );
  }
}

/// Dimmed live preview with the scan frame, corner brackets, and hint.
class _ScanOverlay extends StatelessWidget {
  const _ScanOverlay({required this.locale, required this.progress});

  final String locale;
  final Animation<double> progress;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final Size size = constraints.biggest;
        final double side =
            (size.shortestSide * 0.68).clamp(180.0, 300.0).toDouble();
        final Rect frame = Rect.fromCenter(
          center: Offset(size.width / 2, size.height / 2 - 24),
          width: side,
          height: side,
        );
        return Stack(
          children: <Widget>[
            Positioned.fill(
              child: AnimatedBuilder(
                animation: progress,
                builder: (BuildContext context, Widget? _) => CustomPaint(
                  painter: _ScanFramePainter(
                    frame: frame,
                    progress: progress.value,
                  ),
                ),
              ),
            ),
            Positioned(
              left: 24,
              right: 24,
              top: frame.bottom + 26,
              child: Text(
                careText(locale, 'platform.care.scan.hint'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Permission-denied and no-camera state, with the same retry action.
class _ScanFailure extends StatelessWidget {
  const _ScanFailure({
    required this.locale,
    required this.permissionDenied,
    required this.onRetry,
  });

  final String locale;
  final bool permissionDenied;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                permissionDenied
                    ? Icons.no_photography_outlined
                    : Icons.videocam_off_outlined,
                size: 44,
                color: Colors.white70,
              ),
              const SizedBox(height: 16),
              Text(
                careText(
                  locale,
                  permissionDenied
                      ? 'platform.care.scan.permissionDenied'
                      : 'platform.care.scan.unavailable',
                ),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 22),
              FilledButton(
                onPressed: onRetry,
                child: Text(careText(locale, 'platform.care.scan.retry')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Result panel: the decoded content, plus rescan and finish.
class _ScanResultBody extends StatelessWidget {
  const _ScanResultBody({
    required this.locale,
    required this.value,
    required this.onRescan,
    required this.onDone,
  });

  final String locale;
  final String value;
  final VoidCallback onRescan;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const Spacer(),
            const Icon(Icons.qr_code_2, size: 48, color: kTechCyan),
            const SizedBox(height: 12),
            Text(
              careText(locale, 'platform.care.scan.resultTitle'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              careText(locale, 'platform.care.scan.resultHint'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white60, fontSize: 13),
            ),
            const SizedBox(height: 18),
            Container(
              constraints: const BoxConstraints(maxHeight: 220),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: kSurface,
                borderRadius: BorderRadius.circular(14),
              ),
              child: SingleChildScrollView(
                child: SelectableText(
                  value,
                  style: const TextStyle(
                    color: kInk,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton(
                    onPressed: onRescan,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white24),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(careText(locale, 'platform.care.scan.rescan')),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: onDone,
                    child: Text(careText(locale, 'platform.care.scan.done')),
                  ),
                ),
              ],
            ),
            const Spacer(flex: 2),
          ],
        ),
      ),
    );
  }
}

/// Dim mask with a rounded cutout, corner brackets, and the moving scan line.
class _ScanFramePainter extends CustomPainter {
  const _ScanFramePainter({required this.frame, required this.progress});

  final Rect frame;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final Path mask = Path()..addRect(Offset.zero & size);
    final RRect window =
        RRect.fromRectAndRadius(frame, const Radius.circular(16));
    final Path hole = Path()..addRRect(window);
    canvas.drawPath(
      Path.combine(PathOperation.difference, mask, hole),
      Paint()..color = const Color(0x99000000),
    );
    canvas.drawRRect(
      window,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = Colors.white24,
    );

    const double bracket = 26;
    final Path corners = Path()
      ..moveTo(frame.left, frame.top + bracket)
      ..lineTo(frame.left, frame.top)
      ..lineTo(frame.left + bracket, frame.top)
      ..moveTo(frame.right - bracket, frame.top)
      ..lineTo(frame.right, frame.top)
      ..lineTo(frame.right, frame.top + bracket)
      ..moveTo(frame.right, frame.bottom - bracket)
      ..lineTo(frame.right, frame.bottom)
      ..lineTo(frame.right - bracket, frame.bottom)
      ..moveTo(frame.left + bracket, frame.bottom)
      ..lineTo(frame.left, frame.bottom)
      ..lineTo(frame.left, frame.bottom - bracket);
    canvas.drawPath(
      corners,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round
        ..color = Colors.white,
    );

    final double y = frame.top + 10 + (frame.height - 20) * progress;
    final Rect line =
        Rect.fromLTWH(frame.left + 12, y - 1.5, frame.width - 24, 3);
    canvas.drawRect(line, Paint()..color = kTechCyan);
    final Rect glow =
        Rect.fromLTWH(frame.left + 12, y - 16, frame.width - 24, 16);
    canvas.drawRect(
      glow,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            Colors.transparent,
            kTechCyan.withValues(alpha: 0.35),
          ],
        ).createShader(glow),
    );
  }

  @override
  bool shouldRepaint(_ScanFramePainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.frame != frame;
}
