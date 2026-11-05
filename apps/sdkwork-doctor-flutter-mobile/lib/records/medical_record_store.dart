import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../triage.dart';

/// Storage key shared with the browser surfaces and the mini program.
const String kMedicalRecordsStorageKey = 'sdkwork.doctor.medical-records.v1';

/// Newest-first retention cap for device-local case records.
const int kMedicalRecordLimit = 100;

const List<String> kMedicalRecordModes = <String>['hosted', 'offline'];
const List<String> kMedicalRecordStatuses = <String>[
  'awaiting_doctor',
  'confirmed'
];
const List<String> kMedicalDiagnosisSources = <String>['ai', 'doctor'];
const List<String> kMedicalDiagnosisDecisions = <String>[
  'confirmed',
  'amended'
];
const List<String> kMedicalAttachmentKinds = <String>['image', 'video', 'file'];

/// One uploaded attachment; the bytes live at [path] on this device.
class MedicalAttachment {
  const MedicalAttachment({
    required this.id,
    required this.kind,
    required this.name,
    required this.mimeType,
    required this.sizeBytes,
    required this.addedAt,
    this.path,
    this.dataUrl,
  });

  final String id;
  final String kind;
  final String name;
  final String mimeType;
  final int sizeBytes;
  final String addedAt;
  final String? path;
  final String? dataUrl;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'kind': kind,
        'name': name,
        'mimeType': mimeType,
        'sizeBytes': sizeBytes,
        'addedAt': addedAt,
        if (path != null && path!.isNotEmpty) 'path': path,
        if (dataUrl != null && dataUrl!.isNotEmpty) 'dataUrl': dataUrl,
      };

  static MedicalAttachment? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? kind = value['kind'];
    final Object? name = value['name'];
    if (id is! String || id.isEmpty) return null;
    if (kind is! String || !kMedicalAttachmentKinds.contains(kind)) return null;
    if (name is! String || name.isEmpty) return null;
    final Object? sizeBytes = value['sizeBytes'];
    return MedicalAttachment(
      id: id,
      kind: kind,
      name: name,
      mimeType: value['mimeType']?.toString() ?? 'application/octet-stream',
      sizeBytes: sizeBytes is int && sizeBytes >= 0 ? sizeBytes : 0,
      addedAt: value['addedAt']?.toString() ??
          DateTime.fromMillisecondsSinceEpoch(0).toUtc().toIso8601String(),
      path: value['path']?.toString(),
      dataUrl: value['dataUrl']?.toString(),
    );
  }
}

/// One rendered line of the ended conversation.
class MedicalTranscriptEntry {
  const MedicalTranscriptEntry({
    required this.id,
    required this.role,
    required this.text,
    required this.at,
    this.level,
    this.attachmentIds = const <String>[],
  });

  final String id;

  /// `patient` or `assistant`.
  final String role;
  final String text;
  final String at;
  final TriageLevel? level;
  final List<String> attachmentIds;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'role': role,
        'text': text,
        'at': at,
        if (level != null) 'level': _levelName(level!),
        if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
      };

  static MedicalTranscriptEntry? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? role = value['role'];
    final Object? at = value['at'];
    if (id is! String || id.isEmpty) return null;
    if (role != 'patient' && role != 'assistant') return null;
    if (at is! String || at.isEmpty) return null;
    final String text = value['text']?.toString().trim() ?? '';
    final List<String> attachmentIds = _stringList(value['attachmentIds']);
    if (text.isEmpty && attachmentIds.isEmpty) return null;
    return MedicalTranscriptEntry(
      id: id,
      role: role as String,
      text: text,
      at: at,
      level: _parseLevel(value['level']),
      attachmentIds: attachmentIds,
    );
  }
}

/// A diagnosis with its author, its content, and its time.
class MedicalDiagnosis {
  const MedicalDiagnosis({
    required this.id,
    required this.source,
    required this.impression,
    required this.conditions,
    required this.recommendations,
    required this.level,
    required this.createdAt,
    this.doctorId,
    this.doctorLabel,
    this.notes,
    this.basisDiagnosisId,
  });

  final String id;

  /// `ai` or `doctor`.
  final String source;
  final String impression;
  final List<String> conditions;
  final List<String> recommendations;
  final TriageLevel level;
  final String createdAt;
  final String? doctorId;
  final String? doctorLabel;
  final String? notes;
  final String? basisDiagnosisId;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'source': source,
        'impression': impression,
        'conditions': conditions,
        'recommendations': recommendations,
        'level': _levelName(level),
        'createdAt': createdAt,
        if (doctorId != null && doctorId!.isNotEmpty) 'doctorId': doctorId,
        if (doctorLabel != null && doctorLabel!.isNotEmpty)
          'doctorLabel': doctorLabel,
        if (notes != null && notes!.isNotEmpty) 'notes': notes,
        if (basisDiagnosisId != null && basisDiagnosisId!.isNotEmpty)
          'basisDiagnosisId': basisDiagnosisId,
      };

  static MedicalDiagnosis? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? source = value['source'];
    final Object? impression = value['impression'];
    final Object? createdAt = value['createdAt'];
    final TriageLevel? level = _parseLevel(value['level']);
    if (id is! String || id.isEmpty) return null;
    if (source != 'ai' && source != 'doctor') return null;
    if (impression is! String || impression.isEmpty) return null;
    if (createdAt is! String || createdAt.isEmpty) return null;
    if (level == null) return null;
    final String? doctorLabel = value['doctorLabel']?.toString();
    if (source == 'doctor' &&
        (doctorLabel == null || doctorLabel.trim().isEmpty)) {
      return null;
    }
    return MedicalDiagnosis(
      id: id,
      source: source as String,
      impression: impression,
      conditions: _stringList(value['conditions']),
      recommendations: _stringList(value['recommendations']),
      level: level,
      createdAt: createdAt,
      doctorId: value['doctorId']?.toString(),
      doctorLabel: doctorLabel,
      notes: value['notes']?.toString(),
      basisDiagnosisId: value['basisDiagnosisId']?.toString(),
    );
  }
}

/// The doctor's explicit decision on the AI diagnosis.
class MedicalDiagnosisConfirmation {
  const MedicalDiagnosisConfirmation({
    required this.diagnosisId,
    required this.decision,
    required this.doctorLabel,
    required this.confirmedAt,
    this.doctorId,
    this.doctorDiagnosisId,
  });

  final String diagnosisId;

  /// `confirmed` or `amended`.
  final String decision;
  final String doctorLabel;
  final String confirmedAt;
  final String? doctorId;
  final String? doctorDiagnosisId;

  Map<String, Object?> toJson() => <String, Object?>{
        'diagnosisId': diagnosisId,
        'decision': decision,
        'doctorLabel': doctorLabel,
        'confirmedAt': confirmedAt,
        if (doctorId != null && doctorId!.isNotEmpty) 'doctorId': doctorId,
        if (doctorDiagnosisId != null && doctorDiagnosisId!.isNotEmpty)
          'doctorDiagnosisId': doctorDiagnosisId,
      };

  static MedicalDiagnosisConfirmation? fromJson(
      Object? value, String aiDiagnosisId) {
    if (value is! Map) return null;
    final Object? diagnosisId = value['diagnosisId'];
    final Object? decision = value['decision'];
    final Object? doctorLabel = value['doctorLabel'];
    final Object? confirmedAt = value['confirmedAt'];
    if (diagnosisId is! String || diagnosisId != aiDiagnosisId) return null;
    if (decision is! String || !kMedicalDiagnosisDecisions.contains(decision)) {
      return null;
    }
    if (doctorLabel is! String || doctorLabel.trim().isEmpty) return null;
    if (confirmedAt is! String || confirmedAt.isEmpty) return null;
    return MedicalDiagnosisConfirmation(
      diagnosisId: diagnosisId,
      decision: decision,
      doctorLabel: doctorLabel,
      confirmedAt: confirmedAt,
      doctorId: value['doctorId']?.toString(),
      doctorDiagnosisId: value['doctorDiagnosisId']?.toString(),
    );
  }
}

/// One ended conversation turned into a 病历.
class MedicalRecord {
  const MedicalRecord({
    required this.id,
    required this.sessionId,
    required this.memberId,
    required this.memberLabel,
    required this.mode,
    required this.startedAt,
    required this.endedAt,
    required this.summary,
    required this.transcript,
    required this.attachments,
    required this.aiDiagnosis,
    required this.status,
    this.doctorDiagnosis,
    this.confirmation,
  });

  final String id;
  final String sessionId;
  final String memberId;
  final String memberLabel;
  final String mode;
  final String startedAt;
  final String endedAt;
  final String summary;
  final List<MedicalTranscriptEntry> transcript;
  final List<MedicalAttachment> attachments;
  final MedicalDiagnosis aiDiagnosis;
  final MedicalDiagnosis? doctorDiagnosis;
  final MedicalDiagnosisConfirmation? confirmation;
  final String status;

  bool get needsDoctorReview => confirmation == null;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'sessionId': sessionId,
        'memberId': memberId,
        'memberLabel': memberLabel,
        'mode': mode,
        'startedAt': startedAt,
        'endedAt': endedAt,
        'summary': summary,
        'transcript': transcript
            .map((MedicalTranscriptEntry entry) => entry.toJson())
            .toList(),
        'attachments': attachments
            .map((MedicalAttachment attachment) => attachment.toJson())
            .toList(),
        'aiDiagnosis': aiDiagnosis.toJson(),
        if (doctorDiagnosis != null)
          'doctorDiagnosis': doctorDiagnosis!.toJson(),
        if (confirmation != null) 'confirmation': confirmation!.toJson(),
        'status': status,
      };

  static MedicalRecord? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? sessionId = value['sessionId'];
    final Object? memberId = value['memberId'];
    final Object? memberLabel = value['memberLabel'];
    final Object? mode = value['mode'];
    final Object? startedAt = value['startedAt'];
    final Object? endedAt = value['endedAt'];
    final Object? summary = value['summary'];
    if (id is! String || id.isEmpty) return null;
    if (sessionId is! String || sessionId.isEmpty) return null;
    if (memberId is! String || memberId.isEmpty) return null;
    if (memberLabel is! String || memberLabel.isEmpty) return null;
    if (mode is! String || !kMedicalRecordModes.contains(mode)) return null;
    if (startedAt is! String || startedAt.isEmpty) return null;
    if (endedAt is! String || endedAt.isEmpty) return null;
    if (summary is! String || summary.isEmpty) return null;
    final Object? transcriptValue = value['transcript'];
    if (transcriptValue is! List || transcriptValue.isEmpty) return null;
    final List<MedicalTranscriptEntry> transcript = <MedicalTranscriptEntry>[];
    for (final Object? entry in transcriptValue) {
      final MedicalTranscriptEntry? parsed =
          MedicalTranscriptEntry.fromJson(entry);
      if (parsed == null) return null;
      transcript.add(parsed);
    }
    final List<MedicalAttachment> attachments = <MedicalAttachment>[];
    final Object? attachmentsValue = value['attachments'];
    if (attachmentsValue is List) {
      for (final Object? entry in attachmentsValue) {
        final MedicalAttachment? parsed = MedicalAttachment.fromJson(entry);
        if (parsed == null) return null;
        attachments.add(parsed);
      }
    }
    final MedicalDiagnosis? aiDiagnosis =
        MedicalDiagnosis.fromJson(value['aiDiagnosis']);
    if (aiDiagnosis == null || aiDiagnosis.source != 'ai') return null;
    final MedicalDiagnosis? doctorDiagnosis = value['doctorDiagnosis'] == null
        ? null
        : MedicalDiagnosis.fromJson(value['doctorDiagnosis']);
    if (value['doctorDiagnosis'] != null && doctorDiagnosis == null) {
      return null;
    }
    if (doctorDiagnosis != null && doctorDiagnosis.source != 'doctor') {
      return null;
    }
    final MedicalDiagnosisConfirmation? confirmation =
        value['confirmation'] == null
            ? null
            : MedicalDiagnosisConfirmation.fromJson(
                value['confirmation'], aiDiagnosis.id);
    if (value['confirmation'] != null && confirmation == null) return null;
    return MedicalRecord(
      id: id,
      sessionId: sessionId,
      memberId: memberId,
      memberLabel: memberLabel,
      mode: mode,
      startedAt: startedAt,
      endedAt: endedAt,
      summary: summary,
      transcript: transcript,
      attachments: attachments,
      aiDiagnosis: aiDiagnosis,
      doctorDiagnosis: doctorDiagnosis,
      confirmation: confirmation,
      status: confirmation == null ? 'awaiting_doctor' : 'confirmed',
    );
  }
}

/// Maps a MIME type onto the three attachment kinds the product renders.
String medicalAttachmentKind(String mimeType) {
  final String normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  return 'file';
}

int _attachmentCounter = 0;

/// Builds one attachment row; the file bytes live at [path] on this device.
MedicalAttachment createMedicalAttachment({
  required String name,
  required String mimeType,
  required int sizeBytes,
  String? kind,
  String? path,
  String? dataUrl,
  String? id,
  DateTime? addedAt,
}) {
  final String fileName = name.trim();
  if (fileName.isEmpty) {
    throw ArgumentError('an attachment needs a file name');
  }
  _attachmentCounter += 1;
  final String resolvedMime =
      mimeType.trim().isEmpty ? 'application/octet-stream' : mimeType.trim();
  final String resolvedKind = kMedicalAttachmentKinds.contains(kind)
      ? kind!
      : medicalAttachmentKind(resolvedMime);
  return MedicalAttachment(
    id: (id ?? '').trim().isEmpty
        ? 'attachment-${DateTime.now().microsecondsSinceEpoch}-$_attachmentCounter'
        : id!.trim(),
    kind: resolvedKind,
    name: fileName,
    mimeType: resolvedMime,
    sizeBytes: sizeBytes < 0 ? 0 : sizeBytes,
    addedAt: (addedAt ?? DateTime.now()).toUtc().toIso8601String(),
    path: (path ?? '').trim().isEmpty ? null : path!.trim(),
    dataUrl: (dataUrl ?? '').trim().isEmpty ? null : dataUrl!.trim(),
  );
}

/// Builds the AI diagnosis of a freshly ended conversation.
MedicalDiagnosis createAiDiagnosis({
  required String id,
  required String impression,
  List<String> conditions = const <String>[],
  List<String> recommendations = const <String>[],
  required TriageLevel level,
  required DateTime createdAt,
  String? notes,
}) {
  if (impression.trim().isEmpty) {
    throw ArgumentError('a diagnosis needs an impression');
  }
  return MedicalDiagnosis(
    id: id,
    source: 'ai',
    impression: impression.trim(),
    conditions: _unique(conditions),
    recommendations: _unique(recommendations),
    level: level,
    createdAt: createdAt.toUtc().toIso8601String(),
    notes: (notes ?? '').trim().isEmpty ? null : notes!.trim(),
  );
}

/// Content the attending doctor supplies for their own diagnosis.
class DoctorDiagnosisDraft {
  const DoctorDiagnosisDraft({
    required this.doctorLabel,
    required this.impression,
    this.conditions = const <String>[],
    this.recommendations = const <String>[],
    required this.level,
    this.notes,
    this.doctorId,
  });

  final String doctorLabel;
  final String impression;
  final List<String> conditions;
  final List<String> recommendations;
  final TriageLevel level;
  final String? notes;
  final String? doctorId;
}

MedicalDiagnosis _doctorDiagnosis(
  MedicalRecord record,
  DoctorDiagnosisDraft draft,
  DateTime at,
) {
  final String label = draft.doctorLabel.trim();
  if (label.isEmpty) {
    throw ArgumentError('a doctor diagnosis needs the attending doctor label');
  }
  if (draft.impression.trim().isEmpty) {
    throw ArgumentError('a doctor diagnosis needs an impression');
  }
  return MedicalDiagnosis(
    id: record.doctorDiagnosis?.id ??
        'diagnosis-${DateTime.now().microsecondsSinceEpoch}',
    source: 'doctor',
    doctorId: draft.doctorId ?? record.doctorDiagnosis?.doctorId,
    doctorLabel: label,
    impression: draft.impression.trim(),
    conditions: _unique(draft.conditions),
    recommendations: _unique(draft.recommendations),
    level: draft.level,
    notes: (draft.notes ?? '').trim().isEmpty ? null : draft.notes!.trim(),
    basisDiagnosisId: record.aiDiagnosis.id,
    createdAt: at.toUtc().toIso8601String(),
  );
}

/// The doctor confirms the AI diagnosis, accepting it or amending it.
MedicalRecord confirmAiDiagnosis(
  MedicalRecord record, {
  required String doctorLabel,
  required String decision,
  DoctorDiagnosisDraft? doctorDiagnosis,
  String? doctorId,
  DateTime? confirmedAt,
}) {
  final String label = doctorLabel.trim();
  if (label.isEmpty) {
    throw ArgumentError(
        'confirming an AI diagnosis needs the attending doctor label');
  }
  if (!kMedicalDiagnosisDecisions.contains(decision)) {
    throw ArgumentError('confirming an AI diagnosis needs a known decision');
  }
  if (decision == 'amended' && doctorDiagnosis == null) {
    throw ArgumentError('amending an AI diagnosis needs the doctor diagnosis');
  }
  final DateTime at = confirmedAt ?? DateTime.now();
  final MedicalDiagnosis? own = doctorDiagnosis == null
      ? record.doctorDiagnosis
      : _doctorDiagnosis(record, doctorDiagnosis, at);
  final MedicalDiagnosisConfirmation confirmation =
      MedicalDiagnosisConfirmation(
    diagnosisId: record.aiDiagnosis.id,
    decision: decision,
    doctorId: doctorId,
    doctorLabel: label,
    confirmedAt: at.toUtc().toIso8601String(),
    doctorDiagnosisId: own?.id,
  );
  return MedicalRecord(
    id: record.id,
    sessionId: record.sessionId,
    memberId: record.memberId,
    memberLabel: record.memberLabel,
    mode: record.mode,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    summary: record.summary,
    transcript: record.transcript,
    attachments: record.attachments,
    aiDiagnosis: record.aiDiagnosis,
    doctorDiagnosis: own,
    confirmation: confirmation,
    status: 'confirmed',
  );
}

/// Records the doctor's own diagnosis without touching the AI confirmation.
MedicalRecord addDoctorDiagnosis(
  MedicalRecord record,
  DoctorDiagnosisDraft draft, {
  DateTime? createdAt,
}) {
  final DateTime at = createdAt ?? DateTime.now();
  final MedicalDiagnosis own = _doctorDiagnosis(record, draft, at);
  final MedicalDiagnosisConfirmation? confirmation = record.confirmation == null
      ? null
      : MedicalDiagnosisConfirmation(
          diagnosisId: record.confirmation!.diagnosisId,
          decision: record.confirmation!.decision,
          doctorId: record.confirmation!.doctorId,
          doctorLabel: record.confirmation!.doctorLabel,
          confirmedAt: record.confirmation!.confirmedAt,
          doctorDiagnosisId: own.id,
        );
  return MedicalRecord(
    id: record.id,
    sessionId: record.sessionId,
    memberId: record.memberId,
    memberLabel: record.memberLabel,
    mode: record.mode,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    summary: record.summary,
    transcript: record.transcript,
    attachments: record.attachments,
    aiDiagnosis: record.aiDiagnosis,
    doctorDiagnosis: own,
    confirmation: confirmation,
    status: confirmation == null ? 'awaiting_doctor' : 'confirmed',
  );
}

List<MedicalRecord> appendMedicalRecord(
  List<MedicalRecord> records,
  MedicalRecord record, {
  int limit = kMedicalRecordLimit,
}) {
  return <MedicalRecord>[
    record,
    ...records.where((MedicalRecord entry) => entry.id != record.id),
  ].take(limit).toList(growable: false);
}

List<MedicalRecord> saveMedicalRecord(
  List<MedicalRecord> records,
  MedicalRecord record, {
  int limit = kMedicalRecordLimit,
}) {
  final int index =
      records.indexWhere((MedicalRecord entry) => entry.id == record.id);
  if (index < 0) return appendMedicalRecord(records, record, limit: limit);
  final List<MedicalRecord> next = records.toList(growable: true);
  next[index] = record;
  return next.take(limit).toList(growable: false);
}

List<MedicalRecord> parseMedicalRecords(Object? value) {
  Object? parsed = value;
  if (value is String) {
    if (value.trim().isEmpty) return <MedicalRecord>[];
    try {
      parsed = jsonDecode(value);
    } on FormatException {
      return <MedicalRecord>[];
    }
  }
  if (parsed is! List) return <MedicalRecord>[];
  return parsed
      .map(MedicalRecord.fromJson)
      .whereType<MedicalRecord>()
      .toList(growable: false);
}

String serializeMedicalRecords(List<MedicalRecord> records) {
  return jsonEncode(
      records.map((MedicalRecord record) => record.toJson()).toList());
}

/// Persistence port; the app uses shared preferences, tests use memory.
abstract class MedicalRecordStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class SharedPreferencesMedicalRecordStorage implements MedicalRecordStorage {
  @override
  Future<String?> read() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString(kMedicalRecordsStorageKey);
  }

  @override
  Future<void> write(String value) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString(kMedicalRecordsStorageKey, value);
  }
}

class MemoryMedicalRecordStorage implements MedicalRecordStorage {
  MemoryMedicalRecordStorage([this._value]);

  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async => _value = value;
}

/// Observable 病历 store shared by the chat and records screens.
class MedicalRecordStore extends ChangeNotifier {
  MedicalRecordStore._(this._storage, this._records);

  static Future<MedicalRecordStore> load(MedicalRecordStorage storage,
      {MedicalRecordStorage? fallback}) async {
    try {
      return MedicalRecordStore._(
          storage, parseMedicalRecords(await storage.read()));
    } catch (_) {
      return MedicalRecordStore._(
          fallback ?? MemoryMedicalRecordStorage(), <MedicalRecord>[]);
    }
  }

  factory MedicalRecordStore.memory(
      [List<MedicalRecord> initial = const <MedicalRecord>[]]) {
    return MedicalRecordStore._(
        MemoryMedicalRecordStorage(serializeMedicalRecords(initial)),
        List<MedicalRecord>.of(initial));
  }

  final MedicalRecordStorage _storage;
  List<MedicalRecord> _records;

  List<MedicalRecord> get records => List<MedicalRecord>.unmodifiable(_records);

  bool get isEmpty => _records.isEmpty;

  int get awaitingDoctorCount =>
      _records.where((MedicalRecord record) => record.needsDoctorReview).length;

  Future<void> add(MedicalRecord record) async {
    _records = appendMedicalRecord(_records, record);
    notifyListeners();
    await _persist();
  }

  Future<void> save(MedicalRecord record) async {
    _records = saveMedicalRecord(_records, record);
    notifyListeners();
    await _persist();
  }

  Future<void> clear() async {
    _records = <MedicalRecord>[];
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    try {
      await _storage.write(serializeMedicalRecords(_records));
    } catch (_) {
      // Keep the session copy when the device rejects the write.
    }
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

List<String> _stringList(Object? value) {
  if (value is! List) return const <String>[];
  final List<String> result = <String>[];
  for (final Object? entry in value) {
    if (entry is String &&
        entry.trim().isNotEmpty &&
        !result.contains(entry.trim())) {
      result.add(entry.trim());
    }
  }
  return result;
}

List<String> _unique(List<String> values) {
  final List<String> result = <String>[];
  for (final String value in values) {
    final String trimmed = value.trim();
    if (trimmed.isNotEmpty && !result.contains(trimmed)) {
      result.add(trimmed);
    }
  }
  return result;
}
