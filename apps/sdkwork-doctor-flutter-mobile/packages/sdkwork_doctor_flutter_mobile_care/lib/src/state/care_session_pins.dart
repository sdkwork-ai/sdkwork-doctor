/// Pinned conversations of the care drawer.
///
/// Pinning is a presentation preference of this device, not a property the
/// agents transport stores: the session list keeps the order the transport
/// returns and the controller floats the pinned ids to the top. Keeping it in
/// its own document means a hosted session and an on-device session pin the
/// same way, and no transport has to grow a pin field.
library;

import 'package:shared_preferences/shared_preferences.dart';

/// Storage key of the pinned-session document.
const String kCareSessionPinsStorageKey =
    'sdkwork.doctor.care.pinned-sessions.v1';

/// Persistence port of the pinned session ids.
///
/// Injected by the application bootstrap; tests and previews use the in-memory
/// implementation so no widget test touches a platform plugin.
abstract interface class CareSessionPinStorage {
  /// Pinned session ids in pin order; empty when none are pinned.
  Future<List<String>> read();

  /// Replaces the pinned set.
  Future<void> write(List<String> sessionIds);
}

/// `shared_preferences` implementation of [CareSessionPinStorage].
class SharedPreferencesCareSessionPinStorage implements CareSessionPinStorage {
  const SharedPreferencesCareSessionPinStorage({
    this.storageKey = kCareSessionPinsStorageKey,
  });

  /// Document key, exposed so a test can seed one store.
  final String storageKey;

  @override
  Future<List<String>> read() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(storageKey) ?? const <String>[];
  }

  @override
  Future<void> write(List<String> sessionIds) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(storageKey, sessionIds);
  }
}

/// In-memory implementation for tests and hosts without storage.
class MemoryCareSessionPinStorage implements CareSessionPinStorage {
  MemoryCareSessionPinStorage([Iterable<String> sessionIds = const <String>[]])
      : _sessionIds = List<String>.of(sessionIds);

  List<String> _sessionIds;

  @override
  Future<List<String>> read() async => List<String>.of(_sessionIds);

  @override
  Future<void> write(List<String> sessionIds) async {
    _sessionIds = List<String>.of(sessionIds);
  }
}
