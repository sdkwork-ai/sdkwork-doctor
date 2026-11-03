/// Typed platform ports of voice-call mode.
///
/// Widgets and the call controller depend on these interfaces only
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 6: platform channels and
/// plugin calls stay behind typed adapters). The plugin-backed implementations
/// live in `system_care_voice_ports.dart`; tests inject deterministic fakes.
library;

import 'package:flutter/widgets.dart';

/// One recognition update produced while the user speaks.
@immutable
class CareSpeechResult {
  const CareSpeechResult({required this.text, required this.isFinal});

  /// Best transcript of the current utterance.
  final String text;

  /// True once the recognizer considers the utterance complete.
  final bool isFinal;
}

/// Platform speech recognizer: turns one spoken utterance into text.
abstract class CareSpeechRecognizer {
  /// Prepares the recognizer and asks for microphone permission.
  ///
  /// Returns `false` when the device has no usable recognizer or the user
  /// denied the microphone, so the call screen can say so instead of waiting.
  Future<bool> initialize({required String localeTag});

  /// Starts listening for one utterance.
  ///
  /// [onResult] receives interim and final transcripts; [onError] receives a
  /// stable short code; [onDone] fires when the session ends without a final
  /// result (timeout, silence, or a platform stop). Returns `false` when the
  /// session could not start.
  Future<bool> listen({
    required void Function(CareSpeechResult result) onResult,
    required void Function(String code) onError,
    required void Function() onDone,
    required String localeTag,
  });

  /// Ends the session, keeping what was already recognized.
  Future<void> stop();

  /// Ends the session and discards the current utterance.
  Future<void> cancel();

  Future<void> dispose();
}

/// Platform text-to-speech: reads one assistant reply aloud.
abstract class CareSpeechSynthesizer {
  /// Prepares the engine for [localeTag]. Returns `false` when unavailable;
  /// the call still runs and shows the reply as a caption.
  Future<bool> initialize({required String localeTag});

  /// Speaks [text] and completes when speech ends or is stopped.
  Future<void> speak(String text, {required String localeTag});

  /// Interrupts the current utterance.
  Future<void> stop();

  Future<void> dispose();
}

/// Platform camera preview for video-call mode.
abstract class CareCameraPort {
  /// Opens the front camera. Returns `false` when there is no camera or the
  /// permission was denied; the call then stays in voice mode.
  Future<bool> open();

  /// Switches to the next available camera.
  Future<void> flip();

  Future<void> close();

  /// Full-bleed preview of the opened camera; empty while it is closed.
  Widget buildPreview(BuildContext context);
}

/// Creates the platform ports of one call.
///
/// The shell composes [SystemCareVoiceCallEnvironment]; a test injects fakes so
/// no widget test touches a plugin, a permission dialog, or a device sensor.
abstract class CareVoiceCallEnvironment {
  CareSpeechRecognizer createRecognizer();

  CareSpeechSynthesizer createSynthesizer();

  CareCameraPort createCamera();
}
