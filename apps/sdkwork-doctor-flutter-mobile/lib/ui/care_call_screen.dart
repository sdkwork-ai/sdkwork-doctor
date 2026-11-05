/// Full-screen voice / video call mode of the family doctor conversation.
///
/// Visual language follows the reference call surface: a soft pink-to-blue
/// gradient, one breathing orb, a status line that says what the call is doing,
/// and a single row of round controls (microphone, camera, switch camera, hang
/// up). The conversation itself is the active care session: every spoken turn
/// goes through the same exchange and visit record as a typed turn.
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../care/care_exchange.dart';
import '../care/voice/care_voice_call_controller.dart';
import '../care/voice/care_voice_ports.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/care_session_store.dart';
import '../records/visit_store.dart';
import '../triage.dart';
import 'care_widgets.dart';

/// Keys the tests and the shell share.
const Key careCallScreenKey = Key('care-call-screen');
const Key careCallOrbKey = Key('care-call-orb');
const Key careCallMicKey = Key('care-call-mic');
const Key careCallCameraKey = Key('care-call-camera');
const Key careCallFlipKey = Key('care-call-flip');
const Key careCallHangUpKey = Key('care-call-hangup');
const Key careCallVideoPreviewKey = Key('care-call-video-preview');

/// Ink and surface values of the call chrome (the pastel canvas is its own
/// surface, so the care theme's flat white tokens do not apply here).
const Color _callInk = Color(0xFF2A2B3A);
const Color _callMutedInk = Color(0xB32A2B3A);
const Color _callTranslucent = Color(0x8CFFFFFF);

class CareCallScreen extends StatefulWidget {
  const CareCallScreen({
    super.key,
    required this.locale,
    required this.patient,
    required this.environment,
    required this.conversations,
    required this.records,
    required this.careSessions,
    this.initialVideo = false,
  });

  final String locale;

  /// Patient the call consults for; `null` renders the "create a file first"
  /// state instead of starting a microphone session.
  final PatientProfile? patient;

  /// Platform ports for this call.
  final CareVoiceCallEnvironment environment;

  final CareConversationsController conversations;
  final VisitRecordStore records;
  final CareSessionStore careSessions;

  /// Opens the call with the camera on — the 我的 video-call entry — instead of
  /// starting voice-first and letting the patient turn the camera on.
  final bool initialVideo;

  @override
  State<CareCallScreen> createState() => _CareCallScreenState();
}

class _CareCallScreenState extends State<CareCallScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _breath;
  CareVoiceCallController? _controller;

  /// The visit session the call belongs to; a call is one segment of a visit.
  String? _visitId;
  String? _callId;
  bool _createdVisit = false;
  String _callChannel = 'voice';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _breath = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3600),
    )..repeat(reverse: true);
    final PatientProfile? patient = widget.patient;
    if (patient == null) {
      return;
    }
    _callChannel = widget.initialVideo ? 'video' : 'voice';
    // Opening the visit session mutates a shared store, so it runs after the
    // first frame instead of during this widget's build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_prepareCall(patient));
    });
    final CareConversationsController conversations = widget.conversations;
    final VisitRecordStore records = widget.records;
    final CareSessionStore careSessions = widget.careSessions;
    final String locale = widget.locale;
    final CareVoiceCallController controller = CareVoiceCallController(
      locale: locale,
      recognizer: widget.environment.createRecognizer(),
      synthesizer: widget.environment.createSynthesizer(),
      camera: widget.environment.createCamera(),
      greeting: careText(locale, 'platform.care.call.greeting'),
      sendTurn: (String text) async {
        final String? reply = await sendCareExchange(
          locale: locale,
          conversations: conversations,
          records: records,
          patient: patient,
          text: text,
        );
        if (reply != null) {
          final String channel = _callChannel;
          final CareSession session = await careSessions.ensureActive(
            patient: patient,
            mode: conversations.mode,
            sessionId: conversations.activeSessionId,
          );
          await careSessions.startCall(session.id, channel);
          final CareSession? current = careSessions.find(session.id);
          if (current != null) {
            _visitId = session.id;
            _callId = _openCall(current)?.id;
          }
          await careSessions.appendMessage(
            session.id,
            role: 'patient',
            text: text,
            channel: channel,
            level: triageSymptoms(text).level,
          );
          await careSessions.appendMessage(
            session.id,
            role: 'assistant',
            text: reply,
            channel: channel,
          );
          return CareCallTurnResult.reply(reply);
        }
        return CareCallTurnResult.failure(conversations.error);
      },
    );
    controller.addListener(() {
      _callChannel = controller.videoEnabled ? 'video' : 'voice';
    });
    _controller = controller;
    // Let the first frame paint the connecting state before the ports start.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      unawaited(controller.start());
      if (widget.initialVideo) {
        unawaited(controller.toggleCamera());
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // An accessibility request to reduce motion keeps the orb still.
    if (MediaQuery.maybeDisableAnimationsOf(context) == true &&
        _breath.isAnimating) {
      _breath
        ..stop()
        ..value = 0.5;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      unawaited(_controller?.suspendVideo() ?? Future<void>.value());
    }
  }

  CareSessionCall? _openCall(CareSession session) {
    for (final CareSessionCall call in session.calls.reversed) {
      if (call.endedAt == null) return call;
    }
    return null;
  }

  Future<void> _prepareCall(PatientProfile patient) async {
    final CareSession? existing = widget.careSessions.findActive(patient.id);
    _createdVisit = existing == null;
    final CareSession session = await widget.careSessions.ensureActive(
      patient: patient,
      mode: widget.conversations.mode,
      sessionId: widget.conversations.activeSessionId,
    );
    _visitId = session.id;
    final CareSession? started =
        await widget.careSessions.startCall(session.id, _callChannel);
    _callId = started == null ? null : _openCall(started)?.id;
  }

  Future<void> _endCall() async {
    final String? id = _visitId;
    if (id == null) return;
    final String? callId = _callId;
    if (callId != null) {
      await widget.careSessions.endCall(id, callId);
    }
    final CareSession? latest = widget.careSessions.find(id);
    if (_createdVisit && latest != null && latest.transcript.isEmpty) {
      await widget.careSessions.remove(id);
    }
    _visitId = null;
    _callId = null;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _breath.dispose();
    unawaited(_endCall());
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _hangUp() async {
    await _controller?.hangUp();
    await _endCall();
    if (!mounted) {
      return;
    }
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final CareVoiceCallController? controller = _controller;
    final PatientProfile? patient = widget.patient;
    if (patient == null) {
      return _CallFrame(
        key: careCallScreenKey,
        child: _UnavailableCall(
          locale: widget.locale,
          message: careText(widget.locale, 'platform.care.call.patientMissing'),
          onHangUp: () => Navigator.of(context).maybePop(),
        ),
      );
    }
    if (controller == null) {
      return const SizedBox.shrink();
    }
    return AnimatedBuilder(
      animation: Listenable.merge(<Listenable>[controller, _breath]),
      builder: (BuildContext context, Widget? _) =>
          _buildCall(context, controller, patient),
    );
  }

  Widget _buildCall(
    BuildContext context,
    CareVoiceCallController controller,
    PatientProfile patient,
  ) {
    final bool video = controller.videoEnabled;
    final Color ink = video ? Colors.white : _callInk;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      // The camera feed is dark: keep the status bar icons readable there.
      value: video ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: _CallFrame(
        key: careCallScreenKey,
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            const _CallBackdrop(),
            if (video)
              KeyedSubtree(
                key: careCallVideoPreviewKey,
                // The camera feed is also the interrupt target: the status line
                // promises "speak, or tap to interrupt" in video mode too.
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => unawaited(controller.interrupt()),
                  child: Semantics(
                    button: true,
                    label: careText(
                      widget.locale,
                      'platform.care.call.interrupt',
                    ),
                    child: controller.camera.buildPreview(context),
                  ),
                ),
              )
            else
              Center(
                child: Semantics(
                  button: true,
                  label: careText(
                    widget.locale,
                    'platform.care.call.interrupt',
                  ),
                  child: GestureDetector(
                    key: careCallOrbKey,
                    behavior: HitTestBehavior.opaque,
                    onTap: () => unawaited(controller.interrupt()),
                    child: _CareCallOrb(
                      animation: _breath,
                      phase: controller.phase,
                    ),
                  ),
                ),
              ),
            if (video) const IgnorePointer(child: _VideoScrim()),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 18),
                child: Column(
                  children: <Widget>[
                    _CallTopBar(
                      locale: widget.locale,
                      patientLabel: carePatientLabel(widget.locale, patient),
                      title: careText(
                        widget.locale,
                        video
                            ? 'platform.care.call.videoTitle'
                            : 'platform.care.call.title',
                      ),
                      ink: ink,
                      onHangUp: _hangUp,
                    ),
                    const Spacer(),
                    _CallStatus(
                      locale: widget.locale,
                      controller: controller,
                      ink: ink,
                    ),
                    const SizedBox(height: 24),
                    _CallControls(
                      locale: widget.locale,
                      controller: controller,
                      onHangUp: _hangUp,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      careText(widget.locale, 'platform.care.call.aiNotice'),
                      style: TextStyle(
                        fontSize: 11,
                        letterSpacing: 0.4,
                        color: video ? const Color(0xB3FFFFFF) : _callMutedInk,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Pastel canvas and the missing-patient state share this frame.
class _CallFrame extends StatelessWidget {
  const _CallFrame({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5E9F1),
      body: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          const _CallBackdrop(),
          SafeArea(child: child),
        ],
      ),
    );
  }
}

class _UnavailableCall extends StatelessWidget {
  const _UnavailableCall({
    required this.locale,
    required this.message,
    required this.onHangUp,
  });

  final String locale;
  final String message;
  final VoidCallback onHangUp;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          const Icon(Icons.mic_off_rounded, color: _callMutedInk, size: 44),
          const SizedBox(height: 16),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, height: 1.5, color: _callInk),
          ),
          const SizedBox(height: 28),
          _RoundControl(
            key: careCallHangUpKey,
            icon: Icons.close_rounded,
            tooltip: careText(locale, 'platform.care.call.hangUp'),
            onPressed: onHangUp,
            diameter: 58,
            iconColor: const Color(0xFFE5484D),
            background: _callTranslucent,
          ),
        ],
      ),
    );
  }
}

/// Soft pink → lilac → blue wash of the reference call surface.
///
/// One opaque multi-stop linear gradient: transparent full-screen stops dither
/// visibly on Impeller's low-precision path (the emulator GPU), so the wash is
/// painted with opaque stops only.
class _CallBackdrop extends StatelessWidget {
  const _CallBackdrop();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Color(0xFFFBE2EA),
            Color(0xFFF6E2F3),
            Color(0xFFE9ECFA),
            Color(0xFFE3EFFC),
            Color(0xFFEDF5FC),
          ],
          stops: <double>[0.0, 0.26, 0.52, 0.76, 1.0],
        ),
      ),
    );
  }
}

/// Three-part chrome: mode title, patient pill, and the way back to text.
class _CallTopBar extends StatelessWidget {
  const _CallTopBar({
    required this.locale,
    required this.patientLabel,
    required this.title,
    required this.ink,
    required this.onHangUp,
  });

  final String locale;
  final String patientLabel;
  final String title;
  final Color ink;
  final VoidCallback onHangUp;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        SizedBox(
          width: 56,
          child: Text(
            title,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: ink.withValues(alpha: 0.7),
            ),
          ),
        ),
        Expanded(
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
              decoration: const BoxDecoration(
                color: Color(0xA6FFFFFF),
                borderRadius: BorderRadius.all(Radius.circular(999)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const Icon(Icons.person_outline_rounded,
                      size: 15, color: _callInk),
                  const SizedBox(width: 6),
                  Text(
                    patientLabel,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: _callInk,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        SizedBox(
          width: 56,
          child: TextButton(
            onPressed: onHangUp,
            style: TextButton.styleFrom(
              foregroundColor: ink,
              padding: EdgeInsets.zero,
              minimumSize: const Size(44, 44),
            ),
            child: Text(
              careText(locale, 'platform.care.call.toText'),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }
}

/// The interrupt marker, the live status line, and the transcript caption.
class _CallStatus extends StatelessWidget {
  const _CallStatus({
    required this.locale,
    required this.controller,
    required this.ink,
  });

  final String locale;
  final CareVoiceCallController controller;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    final CareCallPhase phase = controller.phase;
    final String? notice = controller.notice;
    final String status = _statusText(locale, controller);
    final String? caption = phase == CareCallPhase.speaking
        ? controller.replyText
        : (controller.transcript.isEmpty ? null : controller.transcript);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        if (phase == CareCallPhase.speaking)
          Container(
            width: 14,
            height: 14,
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(
              color: ink.withValues(alpha: 0.72),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        Text(
          status,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.4,
            color: notice == null ? ink.withValues(alpha: 0.72) : ink,
          ),
        ),
        if (caption != null && caption.trim().isNotEmpty) ...<Widget>[
          const SizedBox(height: 10),
          Text(
            caption,
            textAlign: TextAlign.center,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              height: 1.5,
              color: ink.withValues(alpha: 0.55),
            ),
          ),
        ],
        if (notice != null) ...<Widget>[
          const SizedBox(height: 10),
          Text(
            notice,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              height: 1.5,
              color: ink.withValues(alpha: 0.8),
            ),
          ),
        ],
      ],
    );
  }
}

String _statusText(String locale, CareVoiceCallController controller) {
  switch (controller.phase) {
    case CareCallPhase.connecting:
      return careText(locale, 'platform.care.call.connecting');
    case CareCallPhase.listening:
      return controller.micEnabled
          ? careText(locale, 'platform.care.call.listening')
          : careText(locale, 'platform.care.call.muted');
    case CareCallPhase.thinking:
      return careText(locale, 'platform.care.call.thinking');
    case CareCallPhase.speaking:
      return careText(locale, 'platform.care.call.interrupt');
    case CareCallPhase.ended:
      return '';
    case CareCallPhase.unavailable:
      return careText(locale, 'platform.care.call.title');
  }
}

/// Microphone, camera, switch camera, hang up.
class _CallControls extends StatelessWidget {
  const _CallControls({
    required this.locale,
    required this.controller,
    required this.onHangUp,
  });

  final String locale;
  final CareVoiceCallController controller;
  final VoidCallback onHangUp;

  @override
  Widget build(BuildContext context) {
    final bool video = controller.videoEnabled;
    if (controller.isUnavailable) {
      // No microphone session exists, so the only honest control is hanging up.
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          _RoundControl(
            key: careCallHangUpKey,
            diameter: 60,
            icon: Icons.close_rounded,
            tooltip: careText(locale, 'platform.care.call.hangUp'),
            onPressed: onHangUp,
            background: _callTranslucent,
            iconColor: const Color(0xFFE5484D),
          ),
        ],
      );
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        _RoundControl(
          key: careCallMicKey,
          diameter: 68,
          icon:
              controller.micEnabled ? Icons.mic_rounded : Icons.mic_off_rounded,
          tooltip: controller.micEnabled
              ? careText(locale, 'platform.care.call.micOn')
              : careText(locale, 'platform.care.call.micOff'),
          onPressed: () => unawaited(controller.toggleMic()),
          background: controller.micEnabled
              ? const Color(0xF2FFFFFF)
              : const Color(0x59FFFFFF),
          iconColor: controller.micEnabled ? _callInk : _callMutedInk,
        ),
        _RoundControl(
          key: careCallCameraKey,
          diameter: video ? 56 : 60,
          icon: video ? Icons.videocam_rounded : Icons.videocam_off_rounded,
          tooltip: video
              ? careText(locale, 'platform.care.call.cameraOff')
              : careText(locale, 'platform.care.call.cameraOn'),
          onPressed: () => unawaited(controller.toggleCamera()),
          background: video ? const Color(0xF2FFFFFF) : _callTranslucent,
          iconColor: video ? _callInk : _callMutedInk,
        ),
        if (video)
          _RoundControl(
            key: careCallFlipKey,
            diameter: 56,
            icon: Icons.cameraswitch_rounded,
            tooltip: careText(locale, 'platform.care.call.flip'),
            onPressed: () => unawaited(controller.flipCamera()),
            background: _callTranslucent,
            iconColor: Colors.white,
          ),
        _RoundControl(
          key: careCallHangUpKey,
          diameter: 60,
          icon: Icons.close_rounded,
          tooltip: careText(locale, 'platform.care.call.hangUp'),
          onPressed: onHangUp,
          background: _callTranslucent,
          iconColor: const Color(0xFFE5484D),
        ),
      ],
    );
  }
}

class _RoundControl extends StatelessWidget {
  const _RoundControl({
    required super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    required this.background,
    required this.iconColor,
    required this.diameter,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;
  final Color background;
  final Color iconColor;
  final double diameter;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: background,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: diameter,
            height: diameter,
            child: Icon(icon, color: iconColor, size: diameter * 0.36),
          ),
        ),
      ),
    );
  }
}

/// The breathing orb: bloom, body, and one highlight, all soft-edged.
class _CareCallOrb extends StatelessWidget {
  const _CareCallOrb({required this.animation, required this.phase});

  final Animation<double> animation;
  final CareCallPhase phase;

  @override
  Widget build(BuildContext context) {
    final Size screen = MediaQuery.sizeOf(context);
    final double diameter = math.min(screen.width * 0.68, 300);
    final double pulse = phase == CareCallPhase.listening ? 0.06 : 0.025;
    final double scale = 1 + pulse * animation.value;
    return Transform.scale(
      scale: scale,
      child: SizedBox(
        width: diameter * 1.12,
        height: diameter * 1.12,
        child: Stack(
          alignment: Alignment.center,
          children: <Widget>[
            // The bloom is a box shadow, not an image filter: transparent
            // full-size gradients dither on low-precision GPUs and a blur
            // filter is what the emulator GPU could not survive.
            Container(
              width: diameter,
              height: diameter,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  center: Alignment(-0.3, -0.35),
                  radius: 0.85,
                  colors: <Color>[
                    Color(0xFFF9BDD3),
                    Color(0xFFD8B6F2),
                    Color(0xFFBCCDF4),
                    Color(0xFFA9C4F1),
                  ],
                  stops: <double>[0.0, 0.36, 0.72, 1.0],
                ),
                boxShadow: <BoxShadow>[
                  BoxShadow(
                    color: Color(0x3DE9A7C6),
                    blurRadius: 72,
                  ),
                  BoxShadow(
                    color: Color(0x268B7BE8),
                    blurRadius: 120,
                  ),
                ],
              ),
            ),
            Positioned(
              left: diameter * 0.22,
              top: diameter * 0.26,
              child: Container(
                width: diameter * 0.34,
                height: diameter * 0.34,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: <Color>[Color(0x59FFFFFF), Color(0x00FFFFFF)],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Darkens the top and bottom of the camera feed so the chrome stays legible.
class _VideoScrim extends StatelessWidget {
  const _VideoScrim();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            Color(0x66000000),
            Color(0x00000000),
            Color(0x00000000),
            Color(0x99000000),
          ],
          stops: <double>[0.0, 0.24, 0.5, 1.0],
        ),
      ),
    );
  }
}
