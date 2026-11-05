import 'dart:async';

import 'package:flutter/foundation.dart';

import '../care/voice/care_voice_ports.dart';
import 'care_session_store.dart';

/// Drives the 通话回放 tab: walks the visit timeline in order and reads each
/// message with the device speech engine, exactly like the browser surfaces.
///
/// The controller owns ordering and cancellation only. The speech engine stays
/// behind the typed [CareSpeechSynthesizer] port, so a widget test injects a
/// fake and no test opens the platform TTS.
class CarePlaybackController extends ChangeNotifier {
  CarePlaybackController({
    required this.synthesizer,
    required this.localeTag,
    required this.items,
    this.stepDelay = const Duration(milliseconds: 700),
  });

  final CareSpeechSynthesizer synthesizer;
  final String localeTag;
  final List<CarePlaybackItem> items;

  /// Pause between non-spoken items (call markers, attachment-only turns).
  final Duration stepDelay;

  int _index = -1;
  bool _playing = false;
  bool _finished = false;
  bool _ready = false;
  bool _unavailable = false;
  bool _disposed = false;
  int _token = 0;

  int get index => _index;

  bool get playing => _playing;

  bool get finished => _finished;

  /// True once the engine refused to initialize; the timeline stays readable.
  bool get unavailable => _unavailable;

  bool get hasMessages =>
      items.any((CarePlaybackItem item) => item.kind == 'message');

  int get messageCount =>
      items.where((CarePlaybackItem item) => item.kind == 'message').length;

  int get spokenCount {
    if (_index < 0) return 0;
    return items
        .take(_index + 1)
        .where((CarePlaybackItem item) => item.kind == 'message')
        .length;
  }

  double get progress =>
      messageCount == 0 ? 0 : spokenCount / messageCount;

  /// Starts at [from] (an index in [items]) and reads through to the end.
  Future<void> play({int from = 0}) async {
    if (_disposed || items.isEmpty || !hasMessages) return;
    if (!_ready) {
      try {
        _ready = await synthesizer.initialize(localeTag: localeTag);
      } catch (_) {
        _ready = false;
      }
    }
    if (_disposed) return;
    if (!_ready) {
      _unavailable = true;
      _playing = false;
      notifyListeners();
      return;
    }
    final int token = ++_token;
    _finished = false;
    _playing = true;
    int index = from.clamp(0, items.length - 1);
    notifyListeners();
    while (index < items.length && !_disposed && token == _token) {
      final CarePlaybackItem item = items[index];
      _index = index;
      notifyListeners();
      if (item.kind == 'message' && item.text.trim().isNotEmpty) {
        try {
          await synthesizer.speak(item.text, localeTag: localeTag);
        } catch (_) {
          // A failed utterance does not stop the replay.
        }
      } else {
        await Future<void>.delayed(stepDelay);
      }
      index += 1;
    }
    if (_disposed || token != _token) return;
    _playing = false;
    _finished = true;
    _index = -1;
    notifyListeners();
  }

  /// Stops and rewinds to the start.
  Future<void> stop() async {
    _token += 1;
    _playing = false;
    _finished = false;
    _index = -1;
    notifyListeners();
    try {
      await synthesizer.stop();
    } catch (_) {
      // Nothing to interrupt.
    }
  }

  /// Pauses in place; the next [resume] continues from the current item.
  Future<void> pause() async {
    _token += 1;
    _playing = false;
    notifyListeners();
    try {
      await synthesizer.stop();
    } catch (_) {
      // Nothing to interrupt.
    }
  }

  /// Toggles play / pause; a finished replay starts over.
  Future<void> toggle() async {
    if (_playing) {
      await pause();
      return;
    }
    final int from = _finished || _index < 0 ? 0 : _index;
    await play(from: from);
  }

  /// Jumps to [index] and starts reading from there.
  Future<void> playFrom(int index) async {
    await play(from: index);
  }

  @override
  void dispose() {
    _disposed = true;
    _token += 1;
    unawaited(synthesizer.stop());
    super.dispose();
  }
}
