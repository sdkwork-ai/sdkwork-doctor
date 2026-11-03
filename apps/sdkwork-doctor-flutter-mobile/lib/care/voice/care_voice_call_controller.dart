/// Presentation state of one voice call: listen, ask the family doctor, speak.
///
/// The controller owns the turn ordering only; speech recognition, speech
/// synthesis, and the camera sit behind the typed ports, and the actual answer
/// comes from the injected [sendTurn] callback (the same care exchange the chat
/// tab uses). No widget in this flow talks to a plugin
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 4).
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../i18n/care_i18n.dart';
import 'care_voice_ports.dart';

/// Lifecycle of a call, in the order the screens render it.
enum CareCallPhase {
  /// Setting up the recognizer and the speech engine.
  connecting,

  /// The microphone is open and the user can talk.
  listening,

  /// The turn was sent and the family doctor is answering.
  thinking,

  /// The answer is being read aloud; a tap interrupts it.
  speaking,

  /// The call is over; the route pops.
  ended,

  /// The device cannot run a voice call (no recognizer, no permission).
  unavailable,
}

/// Outcome of one spoken turn.
@immutable
class CareCallTurnResult {
  const CareCallTurnResult.reply(this.reply) : error = null;

  const CareCallTurnResult.failure(this.error) : reply = null;

  /// Assistant reply, or `null` when the turn failed.
  final String? reply;

  /// Failure message of a failed turn, or `null`.
  final String? error;
}

/// Runs the call loop for the active care session.
class CareVoiceCallController extends ChangeNotifier {
  CareVoiceCallController({
    required this.locale,
    required this.recognizer,
    required this.synthesizer,
    required this.camera,
    required this.sendTurn,
    this.greeting,
  });

  /// Locale tag of the copy, the recognizer, and the speech engine.
  final String locale;
  final CareSpeechRecognizer recognizer;
  final CareSpeechSynthesizer synthesizer;
  final CareCameraPort camera;

  /// Sends one spoken turn and returns the answer to read aloud.
  final Future<CareCallTurnResult> Function(String text) sendTurn;

  /// Opening line spoken before the first listen, or `null`.
  final String? greeting;

  CareCallPhase _phase = CareCallPhase.connecting;
  String _transcript = '';
  String? _replyText;
  String? _notice;
  bool _micEnabled = true;
  bool _videoEnabled = false;
  bool _synthesizerReady = false;
  bool _disposed = false;

  /// Invalidates an in-flight turn when the user hangs up or interrupts.
  int _turn = 0;

  /// Invalidates stale recognition callbacks of a superseded listen session.
  int _listenToken = 0;

  /// True once the current listen session produced the turn being answered, so
  /// the platform's own "session done" signal does not start a second session.
  bool _turnCommitted = false;

  CareCallPhase get phase => _phase;

  /// What the user is saying right now (interim or final transcript).
  String get transcript => _transcript;

  /// The last answer, kept on screen while it is read aloud.
  String? get replyText => _replyText;

  /// Localized reason shown under the orb, or `null`.
  String? get notice => _notice;

  bool get micEnabled => _micEnabled;

  bool get videoEnabled => _videoEnabled;

  /// True once the call cannot continue on this device.
  bool get isUnavailable => _phase == CareCallPhase.unavailable;

  /// Prepares the ports, speaks the greeting, and starts listening.
  Future<void> start() async {
    final int turn = _turn;
    _synthesizerReady = await synthesizer.initialize(localeTag: locale);
    final bool recognized = await recognizer.initialize(localeTag: locale);
    if (_disposed || turn != _turn) {
      return;
    }
    if (!recognized) {
      _fail();
      return;
    }
    _notice = null;
    final String? line = greeting;
    if (line != null && line.trim().isNotEmpty) {
      await _speak(line);
      if (_disposed || turn != _turn) {
        return;
      }
    }
    await _listen();
  }

  /// Tap on the orb: interrupt the answer, or reopen a finished listen session.
  Future<void> interrupt() async {
    if (_disposed) {
      return;
    }
    if (_phase == CareCallPhase.speaking) {
      _turn++;
      await synthesizer.stop();
      if (_disposed) {
        return;
      }
      _notice = null;
      _phase = CareCallPhase.listening;
      await _listen();
      return;
    }
    if (_phase == CareCallPhase.listening) {
      _turn++;
      _listenToken++;
      _notice = null;
      await recognizer.cancel();
      if (_disposed) {
        return;
      }
      await _listen();
    }
  }

  /// Mutes or reopens the microphone without ending the call.
  Future<void> toggleMic() async {
    if (_disposed) {
      return;
    }
    if (_micEnabled) {
      _micEnabled = false;
      _transcript = '';
      if (_phase == CareCallPhase.listening) {
        _turn++;
        _listenToken++;
        await recognizer.cancel();
        if (_disposed) {
          return;
        }
        _phase = CareCallPhase.listening;
      }
      _notify();
      return;
    }
    _micEnabled = true;
    _notice = null;
    _notify();
    if (_phase == CareCallPhase.listening) {
      await _listen();
    }
  }

  /// Turns the camera on (video mode) or off (voice mode).
  Future<void> toggleCamera() async {
    if (_disposed) {
      return;
    }
    if (_videoEnabled) {
      _videoEnabled = false;
      _notify();
      await camera.close();
      return;
    }
    final bool opened = await camera.open();
    if (_disposed) {
      return;
    }
    if (!opened) {
      _notice = careText(locale, 'platform.care.call.cameraDenied');
      _notify();
      return;
    }
    _videoEnabled = true;
    _notice = null;
    _notify();
  }

  /// Switches between the available cameras while in video mode.
  Future<void> flipCamera() async {
    if (_disposed || !_videoEnabled) {
      return;
    }
    await camera.flip();
  }

  /// Releases the camera while the app is in the background and keeps the call
  /// alive in voice mode; the device reclaims the lens for other apps.
  Future<void> suspendVideo() async {
    if (_disposed || !_videoEnabled) {
      return;
    }
    _videoEnabled = false;
    _notify();
    await camera.close();
  }

  /// Ends the call: the microphone, the speech engine, and the camera close.
  Future<void> hangUp() async {
    if (_disposed) {
      return;
    }
    _phase = CareCallPhase.ended;
    _turn++;
    _listenToken++;
    _notify();
    await recognizer.cancel();
    await synthesizer.stop();
    await camera.close();
  }

  /// Opens one listen session for the current turn.
  Future<void> _listen() async {
    if (_disposed ||
        !_micEnabled ||
        _phase == CareCallPhase.ended ||
        _phase == CareCallPhase.unavailable) {
      return;
    }
    final int turn = _turn;
    final int token = ++_listenToken;
    _phase = CareCallPhase.listening;
    _transcript = '';
    _turnCommitted = false;
    _notify();
    final bool started = await recognizer.listen(
      localeTag: locale,
      onResult: (CareSpeechResult result) {
        if (_isStale(turn, token)) {
          return;
        }
        if (!result.isFinal) {
          _transcript = result.text;
          _notify();
          return;
        }
        final String text = result.text.trim();
        if (text.isEmpty) {
          return;
        }
        _transcript = text;
        _turnCommitted = true;
        _notify();
        unawaited(_submit(text, turn, token));
      },
      onError: (String code) {
        if (_isStale(turn, token)) {
          return;
        }
        _handleSpeechError(code, turn);
      },
      onDone: () {
        if (_isStale(turn, token) ||
            _turnCommitted ||
            _phase != CareCallPhase.listening) {
          return;
        }
        // The platform closes a session after silence; a call keeps listening
        // so the user never has to press a control to be heard again.
        unawaited(_resume(turn));
      },
    );
    if (!started && !_isStale(turn, token)) {
      _fail();
    }
  }

  bool _isStale(int turn, int token) =>
      _disposed || turn != _turn || token != _listenToken;

  void _handleSpeechError(String code, int turn) {
    if (_phase == CareCallPhase.unavailable || _phase == CareCallPhase.ended) {
      return;
    }
    if (code == 'permission') {
      _fail();
      return;
    }
    _transcript = '';
    _notice = careText(locale, 'platform.care.call.missed');
    _notify();
    unawaited(_resume(turn));
  }

  Future<void> _resume(int turn) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (_disposed || turn != _turn || !_micEnabled) {
      return;
    }
    if (_phase == CareCallPhase.unavailable ||
        _phase == CareCallPhase.ended ||
        _phase == CareCallPhase.thinking ||
        _phase == CareCallPhase.speaking) {
      return;
    }
    await _listen();
  }

  /// Sends the final transcript and reads the answer aloud.
  Future<void> _submit(String text, int turn, int token) async {
    await recognizer.stop();
    if (_isStale(turn, token)) {
      return;
    }
    _phase = CareCallPhase.thinking;
    _replyText = null;
    _notice = null;
    _notify();
    final CareCallTurnResult result = await sendTurn(text);
    if (_disposed || turn != _turn) {
      return;
    }
    final String? reply = result.reply;
    if (reply == null || reply.trim().isEmpty) {
      _notice = result.error == null || result.error!.trim().isEmpty
          ? careText(locale, 'platform.care.call.missed')
          : careText(locale, 'platform.care.call.failed',
              params: <String, String>{'message': result.error!});
      _notify();
      await _resume(turn);
      return;
    }
    _replyText = reply;
    await _speak(reply);
    if (_disposed || turn != _turn) {
      return;
    }
    if (_micEnabled) {
      // The answer finished: reopen the microphone for the next turn without a
      // timer, so the call is ready the moment the speech engine stops.
      await _listen();
    } else {
      // Muted: the answer is over even though the microphone stays closed.
      _phase = CareCallPhase.listening;
      _notify();
    }
  }

  Future<void> _speak(String text) async {
    _phase = CareCallPhase.speaking;
    _notify();
    if (!_synthesizerReady) {
      return;
    }
    await synthesizer.speak(text, localeTag: locale);
  }

  void _fail() {
    _phase = CareCallPhase.unavailable;
    _notice = careText(locale, 'platform.care.call.unavailable');
    _notify();
  }

  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _turn++;
    _listenToken++;
    unawaited(recognizer.dispose());
    unawaited(synthesizer.dispose());
    unawaited(camera.close());
    super.dispose();
  }
}
