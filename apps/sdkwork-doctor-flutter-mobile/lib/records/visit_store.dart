import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../family.dart';
import '../triage.dart';

/// Storage key shared with the browser and mini program surfaces.
const String kVisitRecordsStorageKey = 'sdkwork.doctor.visit-records.v1';

/// Newest-first retention cap; older consultations are dropped from the device.
const int kVisitRecordLimit = 200;

/// One consultation record. Shape is pinned by
/// `contracts/visit-record.schema.json` and asserted by `test/visit_store_test.dart`.
class VisitRecord {
  const VisitRecord({
    required this.id,
    required this.recordedAt,
    required this.memberId,
    required this.memberLabel,
    required this.symptom,
    required this.advice,
    required this.level,
    required this.mode,
  });

  final String id;
  final String recordedAt;
  final String memberId;
  final String memberLabel;
  final String symptom;
  final String advice;
  final TriageLevel level;
  final String mode;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'recordedAt': recordedAt,
        'memberId': memberId,
        'memberLabel': memberLabel,
        'symptom': symptom,
        'advice': advice,
        'level': _levelName(level),
        'mode': mode,
      };

  /// Returns null for an entry that does not satisfy the pinned shape.
  static VisitRecord? fromJson(Object? value) {
    if (value is! Map<String, dynamic>) return null;
    final Object? id = value['id'];
    final Object? recordedAt = value['recordedAt'];
    final Object? memberId = value['memberId'];
    final Object? memberLabel = value['memberLabel'];
    final Object? symptom = value['symptom'];
    final Object? advice = value['advice'];
    final TriageLevel? level = _parseLevel(value['level']);
    final Object? mode = value['mode'];
    if (id is! String || id.isEmpty) return null;
    if (recordedAt is! String || recordedAt.isEmpty) return null;
    if (memberId is! String || memberLabel is! String) return null;
    if (symptom is! String || symptom.isEmpty) return null;
    if (advice is! String || advice.isEmpty) return null;
    if (level == null) return null;
    if (mode != 'hosted' && mode != 'offline') return null;
    return VisitRecord(
      id: id,
      recordedAt: recordedAt,
      memberId: memberId,
      memberLabel: memberLabel,
      symptom: symptom,
      advice: advice,
      level: level,
      mode: mode as String,
    );
  }
}

String _levelName(TriageLevel level) {
  switch (level) {
    case TriageLevel.emergency:
      return 'emergency';
    case TriageLevel.urgent:
      return 'urgent';
    case TriageLevel.routine:
      return 'routine';
    case TriageLevel.selfCare:
      return 'self-care';
  }
}

TriageLevel? _parseLevel(Object? value) {
  switch (value) {
    case 'emergency':
      return TriageLevel.emergency;
    case 'urgent':
      return TriageLevel.urgent;
    case 'routine':
      return TriageLevel.routine;
    case 'self-care':
      return TriageLevel.selfCare;
    default:
      return null;
  }
}

/// Builds one record from a completed exchange.
VisitRecord createVisitRecord({
  required FamilyMember member,
  required String symptom,
  required String advice,
  required TriageLevel level,
  required String mode,
  String? id,
  DateTime? recordedAt,
}) {
  final String trimmedSymptom = symptom.trim();
  final String trimmedAdvice = advice.trim();
  if (trimmedSymptom.isEmpty) throw ArgumentError('a visit record needs symptom text');
  if (trimmedAdvice.isEmpty) throw ArgumentError('a visit record needs advice text');
  if (mode != 'hosted' && mode != 'offline') throw ArgumentError('unknown transport mode');
  return VisitRecord(
    id: id ?? newVisitRecordId(),
    recordedAt: (recordedAt ?? DateTime.now()).toUtc().toIso8601String(),
    memberId: member.id,
    memberLabel: member.label,
    symptom: trimmedSymptom,
    advice: trimmedAdvice,
    level: level,
    mode: mode,
  );
}

int _visitCounter = 0;

/// Best-effort unique id; Flutter has no `crypto.randomUUID`.
String newVisitRecordId() {
  _visitCounter += 1;
  final int stamp = DateTime.now().microsecondsSinceEpoch;
  final int random = DateTime.now().millisecond * 1000 + _visitCounter;
  return 'visit-$stamp-$random';
}

/// Newest first, de-duplicated by id, capped at [limit].
List<VisitRecord> appendVisitRecord(
  List<VisitRecord> records,
  VisitRecord record, {
  int limit = kVisitRecordLimit,
}) {
  final List<VisitRecord> next = <VisitRecord>[
    record,
    ...records.where((VisitRecord entry) => entry.id != record.id),
  ];
  return next.take(limit).toList(growable: false);
}

/// Parses persisted records defensively; a corrupt entry is dropped.
List<VisitRecord> parseVisitRecords(Object? value) {
  Object? parsed = value;
  if (value is String) {
    if (value.trim().isEmpty) return <VisitRecord>[];
    try {
      parsed = jsonDecode(value);
    } on FormatException {
      return <VisitRecord>[];
    }
  }
  if (parsed is! List<dynamic>) return <VisitRecord>[];
  return parsed
      .map(VisitRecord.fromJson)
      .whereType<VisitRecord>()
      .toList(growable: false);
}

String serializeVisitRecords(List<VisitRecord> records) {
  return jsonEncode(records.map((VisitRecord record) => record.toJson()).toList(growable: false));
}

/// Persistence port; the app uses shared preferences, tests use memory.
abstract class VisitRecordStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class SharedPreferencesVisitRecordStorage implements VisitRecordStorage {
  @override
  Future<String?> read() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString(kVisitRecordsStorageKey);
  }

  @override
  Future<void> write(String value) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString(kVisitRecordsStorageKey, value);
  }
}

/// In-memory persistence for tests and hosts without storage.
class MemoryVisitRecordStorage implements VisitRecordStorage {
  MemoryVisitRecordStorage([this._value]);

  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async => _value = value;
}

/// Observable visit-record store shared by the chat and records tabs.
class VisitRecordStore extends ChangeNotifier {
  VisitRecordStore._(this._storage, this._records);

  static Future<VisitRecordStore> load(VisitRecordStorage storage, {VisitRecordStorage? fallback}) async {
    try {
      final String? raw = await storage.read();
      return VisitRecordStore._(storage, parseVisitRecords(raw));
    } catch (_) {
      // A broken storage backend must not take the records tab down.
      return VisitRecordStore._(fallback ?? MemoryVisitRecordStorage(), <VisitRecord>[]);
    }
  }

  /// In-memory store for tests.
  factory VisitRecordStore.memory([List<VisitRecord> initial = const <VisitRecord>[]]) {
    return VisitRecordStore._(MemoryVisitRecordStorage(serializeVisitRecords(initial)), List<VisitRecord>.of(initial));
  }

  final VisitRecordStorage _storage;
  List<VisitRecord> _records;

  List<VisitRecord> get records => List<VisitRecord>.unmodifiable(_records);

  bool get isEmpty => _records.isEmpty;

  Future<void> add(VisitRecord record) async {
    _records = appendVisitRecord(_records, record);
    notifyListeners();
    await _persist();
  }

  Future<void> clear() async {
    _records = <VisitRecord>[];
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    try {
      await _storage.write(serializeVisitRecords(_records));
    } catch (_) {
      // Keep the session copy when the device rejects the write.
    }
  }
}
