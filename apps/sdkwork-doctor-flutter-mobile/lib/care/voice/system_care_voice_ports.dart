/// Plugin-backed implementations of the voice-call platform ports.
///
/// This is the only file that names a plugin class or a speech/camera API, so a
/// widget never depends on `speech_to_text`, `flutter_tts`, or `camera`
/// directly (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 6).
library;

import 'package:camera/camera.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import 'care_voice_ports.dart';

/// Composes the real device ports for one voice call.
class SystemCareVoiceCallEnvironment implements CareVoiceCallEnvironment {
  const SystemCareVoiceCallEnvironment();

  @override
  CareSpeechRecognizer createRecognizer() => SpeechToTextCareRecognizer();

  @override
  CareSpeechSynthesizer createSynthesizer() => FlutterTtsCareSynthesizer();

  @override
  CareCameraPort createCamera() => CameraPluginCareCameraPort();
}

/// Locale id the Android speech recognizer expects (`zh_CN`, `en_US`).
String speechLocaleId(String localeTag) => localeTag.replaceAll('-', '_');

/// Maps a raw recognizer message to a stable short code the UI can branch on.
///
/// Only a permission failure is fatal to the call; every other recognizer
/// message (no speech detected, timeout, network hiccup) means "that turn was
/// not understood", and the call keeps listening.
String speechErrorCode(String? message) {
  final String value = (message ?? '').toLowerCase();
  if (value.contains('permission') ||
      value.contains('not allowed') ||
      value.contains('insufficient')) {
    return 'permission';
  }
  if (value.contains('no_match') || value.contains('no match')) {
    return 'no_match';
  }
  if (value.contains('timeout') || value.contains('no_speech')) {
    return 'timeout';
  }
  if (value.contains('network')) {
    return 'network';
  }
  return 'other';
}

/// `speech_to_text` recognizer: one utterance per listen session.
class SpeechToTextCareRecognizer implements CareSpeechRecognizer {
  SpeechToTextCareRecognizer({SpeechToText? speech})
      : _speech = speech ?? SpeechToText();

  final SpeechToText _speech;
  bool _initialized = false;
  void Function(CareSpeechResult result)? _onResult;
  void Function(String code)? _onError;
  void Function()? _onDone;

  @override
  Future<bool> initialize({required String localeTag}) async {
    if (_initialized) {
      return true;
    }
    try {
      final bool available = await _speech.initialize(
        onError: (SpeechRecognitionError error) {
          _onError?.call(speechErrorCode(error.errorMsg));
        },
        onStatus: (String status) {
          if (status == 'done' || status == 'notListening') {
            _onDone?.call();
          }
        },
      );
      _initialized = available;
      return available;
    } on Exception {
      // No recognizer, no permission, or a missing plugin: the caller shows
      // the unavailable state instead of a control that does nothing.
      _initialized = false;
      return false;
    }
  }

  @override
  Future<bool> listen({
    required void Function(CareSpeechResult result) onResult,
    required void Function(String code) onError,
    void Function()? onDone,
    required String localeTag,
  }) async {
    if (!_initialized) {
      return false;
    }
    _onResult = onResult;
    _onError = onError;
    _onDone = onDone;
    try {
      await _speech.listen(
        onResult: (SpeechRecognitionResult result) {
          _onResult?.call(CareSpeechResult(
            text: result.recognizedWords,
            isFinal: result.finalResult,
          ));
        },
        listenOptions: SpeechListenOptions(
          partialResults: true,
          cancelOnError: true,
          listenMode: ListenMode.dictation,
          pauseFor: const Duration(seconds: 3),
          listenFor: const Duration(seconds: 30),
          localeId: speechLocaleId(localeTag),
        ),
      );
      // `speech.listen` reports failures by throwing; the plugin's listening
      // flag is updated asynchronously and is not a reliable synchronous
      // result, so a completed call means the session was accepted.
      return true;
    } on Exception {
      return false;
    }
  }

  @override
  Future<void> stop() async {
    if (!_initialized) {
      return;
    }
    try {
      await _speech.stop();
    } on Exception {
      // A session that already ended needs no further cleanup.
    }
  }

  @override
  Future<void> cancel() async {
    if (!_initialized) {
      return;
    }
    try {
      await _speech.cancel();
    } on Exception {
      // A session that already ended needs no further cleanup.
    }
  }

  @override
  Future<void> dispose() async {
    await cancel();
    _onResult = null;
    _onError = null;
    _onDone = null;
  }
}

/// `flutter_tts` synthesizer with awaited utterance completion.
class FlutterTtsCareSynthesizer implements CareSpeechSynthesizer {
  FlutterTtsCareSynthesizer({FlutterTts? tts}) : _tts = tts ?? FlutterTts();

  final FlutterTts _tts;
  bool _initialized = false;

  @override
  Future<bool> initialize({required String localeTag}) async {
    try {
      await _tts.awaitSpeakCompletion(true);
      await _tts.setLanguage(localeTag);
      await _tts.setSpeechRate(0.5);
      await _tts.setPitch(1);
      _initialized = true;
      return true;
    } on Exception {
      _initialized = false;
      return false;
    }
  }

  @override
  Future<void> speak(String text, {required String localeTag}) async {
    if (!_initialized || text.trim().isEmpty) {
      return;
    }
    try {
      await _tts.setLanguage(localeTag);
      await _tts.speak(text);
    } on Exception {
      // Speech is an enhancement: the reply stays on screen as a caption.
    }
  }

  @override
  Future<void> stop() async {
    try {
      await _tts.stop();
    } on Exception {
      // Stopping an idle engine is a no-op.
    }
  }

  @override
  Future<void> dispose() async {
    await stop();
  }
}

/// `camera` plugin preview, fitted to cover the screen.
class CameraPluginCareCameraPort implements CareCameraPort {
  List<CameraDescription> _cameras = const <CameraDescription>[];
  CameraController? _controller;
  int _index = 0;

  @override
  Future<bool> open() async {
    if (_controller != null) {
      return true;
    }
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        return false;
      }
      final int front = _cameras.indexWhere(
        (CameraDescription camera) =>
            camera.lensDirection == CameraLensDirection.front,
      );
      _index = front >= 0 ? front : 0;
      final CameraController controller = await _create(_index);
      _controller = controller;
      return true;
    } on CameraException {
      await close();
      return false;
    } on Exception {
      await close();
      return false;
    }
  }

  @override
  Future<void> flip() async {
    final CameraController? current = _controller;
    if (current == null || _cameras.length < 2) {
      return;
    }
    final int next = (_index + 1) % _cameras.length;
    try {
      final CameraController controller = await _create(next);
      _index = next;
      _controller = controller;
      await current.dispose();
    } on CameraException {
      // Keep the working camera rather than blanking the preview.
    }
  }

  Future<CameraController> _create(int index) async {
    final CameraController controller = CameraController(
      _cameras[index],
      ResolutionPreset.medium,
      enableAudio: false,
    );
    await controller.initialize();
    return controller;
  }

  @override
  Future<void> close() async {
    final CameraController? controller = _controller;
    _controller = null;
    await controller?.dispose();
  }

  @override
  Widget buildPreview(BuildContext context) {
    final CameraController? controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const SizedBox.shrink();
    }
    // The preview reports landscape dimensions; swap them so the portrait
    // screen is filled without letterboxing.
    final Size preview = controller.value.previewSize ?? const Size(1, 1);
    return FittedBox(
      fit: BoxFit.cover,
      clipBehavior: Clip.hardEdge,
      child: SizedBox(
        width: preview.height,
        height: preview.width,
        child: CameraPreview(controller),
      ),
    );
  }
}
