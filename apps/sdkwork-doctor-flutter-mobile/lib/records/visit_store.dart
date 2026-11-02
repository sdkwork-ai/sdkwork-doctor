import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../family.dart';
import '../triage.dart';

/// Storage key shared with the browser and mini program surfaces.
const String kVisitRecordsStorageKey = 'sdkwork.doctor.visit-records.v1';

/// Newest-first retention cap; older consultations are dropped from the device.
const int kVisitRecordLimit = 200;

/// Transport that produced the advice: the hosted agent, the offline triage
/// adapter, or a human doctor the family contacted.
const List<String> kVisitRecordModes = <String>['hosted', 'offline', 'human'];

/// One consultation record. Shape is pinned by
/// `contracts/visit-record.schema.json` and asserted by
/// `test/visit_store_test.dart`.
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
    this.doctorId,
    this.doctorLabel,
    this.doctorOrganizationId,
    this.doctorHospitalLabel,
    this.doctorEmploymentType,
  });

  final String id;
  final String recordedAt;
  final String memberId;
  final String memberLabel;
  final String symptom;
  final String advice;
  final TriageLevel level;
  final String mode;

  /// Human doctor the consultation was routed to, when the family asked a
  /// person. Absent for hosted and offline consulting.
  final String? doctorId;
  final String? doctorLabel;

  /// The practice site the consultation was routed to: the Appbase
  /// organization, the site hospital label, and the engagement at that site
  /// (`DoctorEmploymentType.wireName`). Absent for hosted and offline
  /// consulting.
  final String? doctorOrganizationId;
  final String? doctorHospitalLabel;
  final String? doctorEmploymentType;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'recordedAt': recordedAt,
        'memberId': memberId,
        'memberLabel': memberLabel,
        'symptom': symptom,
        'advice': advice,
        'level': _levelName(level),
        'mode': mode,
        if (doctorId != null && doctorId!.isNotEmpty) 'doctorId': doctorId,
        if (doctorLabel != null && doctorLabel!.isNotEmpty)
          'doctorLabel': doctorLabel,
        if (doctorOrganizationId != null && doctorOrganizationId!.isNotEmpty)
          'doctorOrganizationId': doctorOrganizationId,
        if (doctorHospitalLabel != null && doctorHospitalLabel!.isNotEmpty)
          'doctorHospitalLabel': doctorHospitalLabel,
        if (doctorEmploymentType != null && doctorEmploymentType!.isNotEmpty)
          'doctorEmploymentType': doctorEmploymentType,
      };

  /// Returns null for an entry that does not satisfy the pinned shape.
  static VisitRecord? fromJson(Object? value) {
    if (value is! Map) return null;
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
    if (mode is! String || !kVisitRecordModes.contains(mode)) return null;
    final Object? doctorId = value['doctorId'];
    final Object? doctorLabel = value['doctorLabel'];
    final Object? doctorOrganizationId = value['doctorOrganizationId'];
    final Object? doctorHospitalLabel = value['doctorHospitalLabel'];
    final Object? doctorEmploymentType = value['doctorEmploymentType'];
    return VisitRecord(
      id: id,
      recordedAt: recordedAt,
      memberId: memberId,
      memberLabel: memberLabel,
      symptom: symptom,
      advice: advice,
      level: level,
      mode: mode,
      doctorId: doctorId is String && doctorId.trim().isNotEmpty
          ? doctorId.trim()
          : null,
      doctorLabel: doctorLabel is String && doctorLabel.trim().isNotEmpty
          ? doctorLabel.trim()
          : null,
      doctorOrganizationId:
          doctorOrganizationId is String && doctorOrganizationId.trim().isNotEmpty
              ? doctorOrganizationId.trim()
              : null,
      doctorHospitalLabel:
          doctorHospitalLabel is String && doctorHospitalLabel.trim().isNotEmpty
              ? doctorHospitalLabel.trim()
              : null,
      doctorEmploymentType:
          doctorEmploymentType is String && doctorEmploymentType.trim().isNotEmpty
              ? doctorEmploymentType.trim()
              : null,
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
///
/// A hosted or offline exchange records the patient whose facts were sent; a
/// human consultation records the patient, the entered reason as the symptom,
/// and the "consultation requested" copy as the advice.
VisitRecord createVisitRecord({
  required FamilyMember member,
  required String symptom,
  required String advice,
  required TriageLevel level,
  required String mode,
  String? doctorId,
  String? doctorLabel,
  String? doctorOrganizationId,
  String? doctorHospitalLabel,
  String? doctorEmploymentType,
  String? id,
  DateTime? recordedAt,
}) {
  final String trimmedSymptom = symptom.trim();
  final String trimmedAdvice = advice.trim();
  if (trimmedSymptom.isEmpty) {
    throw ArgumentError('a visit record needs symptom text');
  }
  if (trimmedAdvice.isEmpty) {
    throw ArgumentError('a visit record needs advice text');
  }
  if (!kVisitRecordModes.contains(mode)) {
    throw ArgumentError('unknown transport mode');
  }
  final String trimmedDoctorId = (doctorId ?? '').trim();
  final String trimmedDoctorLabel = (doctorLabel ?? '').trim();
  final String trimmedDoctorOrganizationId = (doctorOrganizationId ?? '').trim();
  final String trimmedDoctorHospitalLabel = (doctorHospitalLabel ?? '').trim();
  final String trimmedDoctorEmploymentType = (doctorEmploymentType ?? '').trim();
  return VisitRecord(
    id: id ?? newVisitRecordId(),
    recordedAt: (recordedAt ?? DateTime.now()).toUtc().toIso8601String(),
    memberId: member.id,
    memberLabel: member.label,
    symptom: trimmedSymptom,
    advice: trimmedAdvice,
    level: level,
    mode: mode,
    doctorId: trimmedDoctorId.isEmpty ? null : trimmedDoctorId,
    doctorLabel: trimmedDoctorLabel.isEmpty ? null : trimmedDoctorLabel,
    doctorOrganizationId:
        trimmedDoctorOrganizationId.isEmpty ? null : trimmedDoctorOrganizationId,
    doctorHospitalLabel:
        trimmedDoctorHospitalLabel.isEmpty ? null : trimmedDoctorHospitalLabel,
    doctorEmploymentType:
        trimmedDoctorEmploymentType.isEmpty ? null : trimmedDoctorEmploymentType,
  );
}

/// Builds one record for a human consultation started through a doctor's
/// configured channel. The reason the family entered is the symptom, and the
/// advice is the "consultation requested" copy, so the record reads correctly
/// without the conversation.
VisitRecord createHumanVisitRecord({
  required FamilyMember member,
  required String reason,
  required String advice,
  required String doctorId,
  required String doctorLabel,
  String? doctorOrganizationId,
  String? doctorHospitalLabel,
  String? doctorEmploymentType,
  String? id,
  DateTime? recordedAt,
}) =>
    createVisitRecord(
      member: member,
      symptom: reason,
      advice: advice,
      level: TriageLevel.routine,
      mode: 'human',
      doctorId: doctorId,
      doctorLabel: doctorLabel,
      doctorOrganizationId: doctorOrganizationId,
      doctorHospitalLabel: doctorHospitalLabel,
      doctorEmploymentType: doctorEmploymentType,
      id: id,
      recordedAt: recordedAt,
    );

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
  if (parsed is! List) return <VisitRecord>[];
  return parsed
      .map(VisitRecord.fromJson)
      .whereType<VisitRecord>()
      .toList(growable: false);
}

String serializeVisitRecords(List<VisitRecord> records) {
  return jsonEncode(records
      .map((VisitRecord record) => record.toJson())
      .toList(growable: false));
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

/// Observable visit-record store shared by the chat, doctor, and records
/// screens.
class VisitRecordStore extends ChangeNotifier {
  VisitRecordStore._(this._storage, this._records);

  static Future<VisitRecordStore> load(VisitRecordStorage storage,
      {VisitRecordStorage? fallback}) async {
    try {
      final String? raw = await storage.read();
      return VisitRecordStore._(storage, parseVisitRecords(raw));
    } catch (_) {
      // A broken storage backend must not take the records screen down.
      return VisitRecordStore._(
          fallback ?? MemoryVisitRecordStorage(), <VisitRecord>[]);
    }
  }

  /// In-memory store for tests.
  factory VisitRecordStore.memory(
      [List<VisitRecord> initial = const <VisitRecord>[]]) {
    return VisitRecordStore._(MemoryVisitRecordStorage(serializeVisitRecords(initial)),
        List<VisitRecord>.of(initial));
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
