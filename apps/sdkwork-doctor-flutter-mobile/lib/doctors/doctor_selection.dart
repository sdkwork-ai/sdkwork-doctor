import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'doctor_directory.dart';

/// The family's doctor selection.
///
/// Selection is device-local: which doctors a family picked, and which one is
/// their primary doctor. The first doctor selected automatically becomes the
/// primary doctor; removing the primary promotes the next selected doctor
/// instead of leaving a hole. Mirrors `doctors.ts` in
/// `@sdkwork/doctor-common-doctor`.

/// A household may keep this many doctors selected.
const int kDoctorSelectionLimit = 5;

/// Storage key shared by every surface.
const String kDoctorSelectionStorageKey = 'sdkwork.doctor.doctor-selection.v1';

/// Serialized selection document version.
const int kDoctorSelectionVersion = 1;

/// The persisted selection: selected doctor ids in selection order, plus the
/// primary doctor, which is always one of the selected ids.
class DoctorSelectionState {
  const DoctorSelectionState({
    this.selectedIds = const <String>[],
    this.primaryId,
  });

  final List<String> selectedIds;
  final String? primaryId;

  bool isSelected(String doctorId) => selectedIds.contains(doctorId);

  @override
  bool operator ==(Object other) {
    if (other is! DoctorSelectionState) return false;
    if (other.primaryId != primaryId) return false;
    if (other.selectedIds.length != selectedIds.length) return false;
    for (int index = 0; index < selectedIds.length; index += 1) {
      if (other.selectedIds[index] != selectedIds[index]) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hash(primaryId, Object.hashAll(selectedIds));
}

/// Parses a persisted selection; primary must be one of the selected ids and an
/// unknown one falls back to the first selected doctor.
DoctorSelectionState parseDoctorSelection(Object? value) {
  Object? parsed = value;
  if (value is String) {
    if (value.trim().isEmpty) return const DoctorSelectionState();
    try {
      parsed = jsonDecode(value);
    } on FormatException {
      return const DoctorSelectionState();
    }
  }
  final List<Object?> rawSelected;
  Object? rawPrimary;
  if (parsed is List) {
    rawSelected = List<Object?>.from(parsed);
  } else if (parsed is Map) {
    final Object? selected = parsed['selectedIds'];
    rawSelected = selected is List ? List<Object?>.from(selected) : const <Object?>[];
    rawPrimary = parsed['primaryId'];
  } else {
    return const DoctorSelectionState();
  }
  final List<String> selectedIds = <String>[];
  for (final Object? id in rawSelected) {
    if (id is! String) continue;
    final String normalized = id.trim();
    if (normalized.isEmpty || selectedIds.contains(normalized)) continue;
    if (selectedIds.length >= kDoctorSelectionLimit) break;
    selectedIds.add(normalized);
  }
  final String requested = rawPrimary is String ? rawPrimary.trim() : '';
  final String? primaryId =
      selectedIds.contains(requested) ? requested : (selectedIds.isEmpty ? null : selectedIds.first);
  return DoctorSelectionState(
    selectedIds: List<String>.unmodifiable(selectedIds),
    primaryId: primaryId,
  );
}

/// Serializes the selection exactly as the shared document declares:
/// `{"version":1,"selectedIds":[...],"primaryId":...}`.
String serializeDoctorSelection(DoctorSelectionState state) => jsonEncode(
      <String, Object?>{
        'version': kDoctorSelectionVersion,
        'selectedIds': state.selectedIds,
        'primaryId': state.primaryId,
      },
    );

/// Persistence port; the app uses shared preferences, tests use memory.
abstract class DoctorSelectionStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class SharedPreferencesDoctorSelectionStorage implements DoctorSelectionStorage {
  @override
  Future<String?> read() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString(kDoctorSelectionStorageKey);
  }

  @override
  Future<void> write(String value) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString(kDoctorSelectionStorageKey, value);
  }
}

/// In-memory persistence for tests and hosts without storage.
class MemoryDoctorSelectionStorage implements DoctorSelectionStorage {
  MemoryDoctorSelectionStorage([this._value]);

  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async => _value = value;
}

/// Observable selection store shared by the doctor tab and the me tab.
class DoctorSelectionStore extends ChangeNotifier {
  DoctorSelectionStore._(this._storage, this._state);

  static Future<DoctorSelectionStore> load(
    DoctorSelectionStorage storage, {
    DoctorSelectionStorage? fallback,
  }) async {
    try {
      final String? raw = await storage.read();
      return DoctorSelectionStore._(storage, parseDoctorSelection(raw));
    } catch (_) {
      return DoctorSelectionStore._(
        fallback ?? MemoryDoctorSelectionStorage(),
        const DoctorSelectionState(),
      );
    }
  }

  /// In-memory store for tests.
  factory DoctorSelectionStore.memory([DoctorSelectionState? initial]) {
    final DoctorSelectionState state = initial ?? const DoctorSelectionState();
    return DoctorSelectionStore._(
      MemoryDoctorSelectionStorage(serializeDoctorSelection(state)),
      state,
    );
  }

  final DoctorSelectionStorage _storage;
  DoctorSelectionState _state;

  DoctorSelectionState get state => _state;

  List<String> get selectedIds => _state.selectedIds;

  String? get primaryId => _state.primaryId;

  bool isSelected(String doctorId) => _state.isSelected(doctorId.trim());

  /// Adds one doctor; the first selected doctor becomes primary, and the
  /// selection is capped at [kDoctorSelectionLimit].
  Future<DoctorSelectionState> select(String doctorId) async {
    final String id = doctorId.trim();
    if (id.isEmpty || _state.selectedIds.contains(id)) return _state;
    if (_state.selectedIds.length >= kDoctorSelectionLimit) return _state;
    return _commit(
      DoctorSelectionState(
        selectedIds: List<String>.unmodifiable(<String>[..._state.selectedIds, id]),
        primaryId: _state.primaryId ?? id,
      ),
    );
  }

  /// Removes one doctor; removing the primary promotes the next selected one.
  Future<DoctorSelectionState> deselect(String doctorId) async {
    final String id = doctorId.trim();
    if (!_state.selectedIds.contains(id)) return _state;
    final List<String> selectedIds = _state.selectedIds
        .where((String entry) => entry != id)
        .toList(growable: false);
    return _commit(
      DoctorSelectionState(
        selectedIds: List<String>.unmodifiable(selectedIds),
        primaryId: _state.primaryId == id
            ? (selectedIds.isEmpty ? null : selectedIds.first)
            : _state.primaryId,
      ),
    );
  }

  Future<DoctorSelectionState> toggle(String doctorId) =>
      isSelected(doctorId) ? deselect(doctorId) : select(doctorId);

  /// Makes one doctor primary, selecting it first when it is not yet selected.
  Future<DoctorSelectionState> setPrimary(String doctorId) async {
    final String id = doctorId.trim();
    if (id.isEmpty) return _state;
    if (!_state.selectedIds.contains(id)) {
      if (_state.selectedIds.length >= kDoctorSelectionLimit) return _state;
      return _commit(
        DoctorSelectionState(
          selectedIds: List<String>.unmodifiable(<String>[..._state.selectedIds, id]),
          primaryId: id,
        ),
      );
    }
    return _commit(
      DoctorSelectionState(selectedIds: _state.selectedIds, primaryId: id),
    );
  }

  Future<DoctorSelectionState> clear() async {
    if (_state.selectedIds.isEmpty) return _state;
    return _commit(const DoctorSelectionState());
  }

  /// Drops selected ids that are no longer in the roster.
  Future<DoctorSelectionState> prune(List<String> availableIds) async {
    final Set<String> available = availableIds
        .map((String id) => id.trim())
        .where((String id) => id.isNotEmpty)
        .toSet();
    final List<String> selectedIds = _state.selectedIds
        .where(available.contains)
        .toList(growable: false);
    if (selectedIds.length == _state.selectedIds.length) return _state;
    final String? primaryId = _state.primaryId != null &&
            available.contains(_state.primaryId)
        ? _state.primaryId
        : (selectedIds.isEmpty ? null : selectedIds.first);
    return _commit(
      DoctorSelectionState(
        selectedIds: List<String>.unmodifiable(selectedIds),
        primaryId: primaryId,
      ),
    );
  }

  Future<DoctorSelectionState> _commit(DoctorSelectionState next) async {
    if (next == _state) return _state;
    _state = next;
    notifyListeners();
    await _persist();
    return _state;
  }

  Future<void> _persist() async {
    try {
      await _storage.write(serializeDoctorSelection(_state));
    } catch (_) {
      // Keep the session copy when the device rejects the write.
    }
  }
}

/// Selected doctors in selection order, skipping ids that are not in [roster].
List<DoctorProfile> resolveSelectedDoctors(
  DoctorRoster roster,
  DoctorSelectionState selection,
) {
  final List<DoctorProfile> resolved = <DoctorProfile>[];
  for (final String id in selection.selectedIds) {
    for (final DoctorProfile doctor in roster.doctors) {
      if (doctor.id == id) {
        resolved.add(doctor);
        break;
      }
    }
  }
  return List<DoctorProfile>.unmodifiable(resolved);
}

/// The family's primary doctor resolved against the roster on screen, falling
/// back to the first selected doctor that the roster still carries.
DoctorProfile? resolvePrimaryDoctor(
  DoctorRoster roster,
  DoctorSelectionState selection,
) {
  for (final DoctorProfile doctor in roster.doctors) {
    if (doctor.id == selection.primaryId) return doctor;
  }
  for (final String id in selection.selectedIds) {
    for (final DoctorProfile doctor in roster.doctors) {
      if (doctor.id == id) return doctor;
    }
  }
  return null;
}
