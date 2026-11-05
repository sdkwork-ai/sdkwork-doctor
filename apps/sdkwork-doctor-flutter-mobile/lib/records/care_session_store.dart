import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../patients/patient_store.dart';
import '../triage.dart';
import 'medical_record_store.dart';

/// Storage key shared with the browser surfaces and the mini program.
const String kCareSessionsStorageKey = 'sdkwork.doctor.care-sessions.v1';

/// Newest-first retention cap for local visit sessions.
const int kCareSessionLimit = 200;

const List<String> kCareSessionChannels = <String>['text', 'voice', 'video'];
const List<String> kCareSessionStatuses = <String>['active', 'ended'];
const List<String> kCareSessionCallModes = <String>['voice', 'video'];

const int _titleLimit = 40;

int _sessionCounter = 0;

String newCareSessionId([DateTime? now]) {
  _sessionCounter += 1;
  return 'session-${(now ?? DateTime.now()).millisecondsSinceEpoch}-$_sessionCounter';
}

String careSessionMemberLabel(PatientProfile patient) =>
    '${patient.displayName} (${patient.relation.name})';

String _clampTitle(String text) {
  final String value = text.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (value.isEmpty) return '';
  return value.length > _titleLimit
      ? '${value.substring(0, _titleLimit - 1)}…'
      : value;
}

String _firstPatientText(List<CareSessionMessage> transcript) {
  for (final CareSessionMessage message in transcript) {
    if (message.role != 'patient') continue;
    final String title = _clampTitle(message.text);
    if (title.isNotEmpty) return title;
  }
  return '';
}

/// One transcript turn of the session.
class CareSessionMessage {
  const CareSessionMessage({
    required this.id,
    required this.role,
    required this.text,
    required this.at,
    this.channel = 'text',
    this.level,
    this.attachmentIds = const <String>[],
  });

  final String id;

  /// `patient` or `assistant`.
  final String role;
  final String text;
  final String at;

  /// `text`, `voice`, or `video`: how the turn was produced.
  final String channel;
  final TriageLevel? level;
  final List<String> attachmentIds;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'role': role,
        'text': text,
        'at': at,
        'channel': channel,
        if (level != null) 'level': _levelName(level!),
        if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
      };

  static CareSessionMessage? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? role = value['role'];
    final Object? at = value['at'];
    if (id is! String || id.isEmpty) return null;
    if (role != 'patient' && role != 'assistant') return null;
    if (at is! String || at.isEmpty) return null;
    final String channel = value['channel']?.toString() ?? '';
    if (!kCareSessionChannels.contains(channel)) return null;
    final String text = value['text']?.toString() ?? '';
    final List<String> attachmentIds = _stringList(value['attachmentIds']);
    if (text.trim().isEmpty && attachmentIds.isEmpty) return null;
    return CareSessionMessage(
      id: id,
      role: role as String,
      text: text,
      at: at,
      channel: channel,
      level: _parseLevel(value['level']),
      attachmentIds: attachmentIds,
    );
  }
}

/// One voice or video call segment inside the session.
class CareSessionCall {
  const CareSessionCall({
    required this.id,
    required this.mode,
    required this.startedAt,
    this.endedAt,
  });

  final String id;

  /// `voice` or `video`.
  final String mode;
  final String startedAt;
  final String? endedAt;

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'mode': mode,
        'startedAt': startedAt,
        if (endedAt != null && endedAt!.isNotEmpty) 'endedAt': endedAt,
      };

  static CareSessionCall? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? mode = value['mode'];
    final Object? startedAt = value['startedAt'];
    if (id is! String || id.isEmpty) return null;
    if (mode is! String || !kCareSessionCallModes.contains(mode)) return null;
    if (startedAt is! String || startedAt.isEmpty) return null;
    return CareSessionCall(
      id: id,
      mode: mode,
      startedAt: startedAt,
      endedAt: value['endedAt']?.toString(),
    );
  }
}

/// One 看病记录: a conversation session, including the one still open.
class CareSession {
  const CareSession({
    required this.id,
    required this.memberId,
    required this.memberLabel,
    required this.mode,
    required this.title,
    required this.status,
    required this.startedAt,
    required this.updatedAt,
    this.endedAt,
    this.medicalRecordId,
    this.transcript = const <CareSessionMessage>[],
    this.calls = const <CareSessionCall>[],
  });

  final String id;
  final String memberId;
  final String memberLabel;
  final String mode;
  final String title;

  /// `active` or `ended`.
  final String status;
  final String startedAt;
  final String updatedAt;
  final String? endedAt;
  final String? medicalRecordId;
  final List<CareSessionMessage> transcript;
  final List<CareSessionCall> calls;

  bool get isActive => status == 'active';

  bool get hasCall =>
      calls.isNotEmpty || transcript.any((CareSessionMessage m) => m.channel != 'text');

  CareSession copyWith({
    String? id,
    String? memberId,
    String? memberLabel,
    String? mode,
    String? title,
    String? status,
    String? startedAt,
    String? updatedAt,
    String? endedAt,
    String? medicalRecordId,
    List<CareSessionMessage>? transcript,
    List<CareSessionCall>? calls,
  }) =>
      CareSession(
        id: id ?? this.id,
        memberId: memberId ?? this.memberId,
        memberLabel: memberLabel ?? this.memberLabel,
        mode: mode ?? this.mode,
        title: title ?? this.title,
        status: status ?? this.status,
        startedAt: startedAt ?? this.startedAt,
        updatedAt: updatedAt ?? this.updatedAt,
        endedAt: endedAt ?? this.endedAt,
        medicalRecordId: medicalRecordId ?? this.medicalRecordId,
        transcript: transcript ?? this.transcript,
        calls: calls ?? this.calls,
      );

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'memberId': memberId,
        'memberLabel': memberLabel,
        'mode': mode,
        'title': title,
        'status': status,
        'startedAt': startedAt,
        'updatedAt': updatedAt,
        if (endedAt != null && endedAt!.isNotEmpty) 'endedAt': endedAt,
        if (medicalRecordId != null && medicalRecordId!.isNotEmpty)
          'medicalRecordId': medicalRecordId,
        'transcript':
            transcript.map((CareSessionMessage m) => m.toJson()).toList(),
        'calls': calls.map((CareSessionCall c) => c.toJson()).toList(),
      };

  static CareSession? fromJson(Object? value) {
    if (value is! Map) return null;
    final Object? id = value['id'];
    final Object? memberId = value['memberId'];
    final Object? memberLabel = value['memberLabel'];
    final Object? mode = value['mode'];
    final Object? status = value['status'];
    final Object? startedAt = value['startedAt'];
    final Object? updatedAt = value['updatedAt'];
    if (id is! String || id.isEmpty) return null;
    if (memberId is! String || memberId.isEmpty) return null;
    if (memberLabel is! String || memberLabel.isEmpty) return null;
    if (mode != 'hosted' && mode != 'offline') return null;
    if (!kCareSessionStatuses.contains(status)) return null;
    if (startedAt is! String || startedAt.isEmpty) return null;
    final String updated = updatedAt is String && updatedAt.isNotEmpty
        ? updatedAt
        : startedAt;
    final List<CareSessionMessage> transcript = <CareSessionMessage>[
      if (value['transcript'] is List)
        for (final Object? entry in value['transcript'] as List)
          if (CareSessionMessage.fromJson(entry) != null)
            CareSessionMessage.fromJson(entry)!,
    ];
    final List<CareSessionCall> calls = <CareSessionCall>[
      if (value['calls'] is List)
        for (final Object? entry in value['calls'] as List)
          if (CareSessionCall.fromJson(entry) != null)
            CareSessionCall.fromJson(entry)!,
    ];
    return CareSession(
      id: id,
      memberId: memberId,
      memberLabel: memberLabel,
      mode: mode as String,
      title: value['title'] is String && (value['title'] as String).trim().isNotEmpty
          ? _clampTitle(value['title'] as String)
          : memberLabel,
      status: status as String,
      startedAt: startedAt,
      updatedAt: updated,
      endedAt: value['endedAt']?.toString(),
      medicalRecordId: value['medicalRecordId']?.toString(),
      transcript: List<CareSessionMessage>.unmodifiable(transcript),
      calls: List<CareSessionCall>.unmodifiable(calls),
    );
  }
}

CareSession createCareSession({
  required PatientProfile patient,
  required String mode,
  DateTime? startedAt,
  String? id,
  String? title,
}) {
  final DateTime start = startedAt ?? DateTime.now();
  final String label = careSessionMemberLabel(patient);
  final String resolvedTitle = _clampTitle(title ?? '');
  return CareSession(
    id: id ?? newCareSessionId(start),
    memberId: patient.id,
    memberLabel: label,
    mode: mode,
    title: resolvedTitle.isEmpty ? label : resolvedTitle,
    status: 'active',
    startedAt: start.toUtc().toIso8601String(),
    updatedAt: start.toUtc().toIso8601String(),
  );
}

CareSession appendCareSessionMessage(
  CareSession session, {
  required String role,
  required String text,
  DateTime? at,
  String channel = 'text',
  TriageLevel? level,
  List<String> attachmentIds = const <String>[],
}) {
  final String value = text.trim();
  if (value.isEmpty && attachmentIds.isEmpty) {
    throw ArgumentError('a care session message needs text or an attachment');
  }
  final DateTime stamp = at ?? DateTime.now();
  final String iso = stamp.toUtc().toIso8601String();
  final CareSessionMessage message = CareSessionMessage(
    id: 'turn-${stamp.millisecondsSinceEpoch}-${session.transcript.length + 1}',
    role: role,
    text: value,
    at: iso,
    channel: channel,
    level: level,
    attachmentIds: List<String>.unmodifiable(attachmentIds),
  );
  final List<CareSessionMessage> transcript = <CareSessionMessage>[
    ...session.transcript,
    message,
  ];
  final bool shouldTitle = role == 'patient' &&
      _firstPatientText(session.transcript).isEmpty &&
      value.isNotEmpty;
  return session.copyWith(
    title: shouldTitle ? _clampTitle(value) : session.title,
    updatedAt: iso,
    transcript: List<CareSessionMessage>.unmodifiable(transcript),
  );
}

CareSession startCareSessionCall(CareSession session, String mode,
    [DateTime? at]) {
  if (session.calls.any((CareSessionCall c) => c.mode == mode && c.endedAt == null)) {
    return session;
  }
  final DateTime stamp = at ?? DateTime.now();
  final String iso = stamp.toUtc().toIso8601String();
  return session.copyWith(
    updatedAt: iso,
    calls: List<CareSessionCall>.unmodifiable(<CareSessionCall>[
      ...session.calls,
      CareSessionCall(
        id: 'call-${stamp.millisecondsSinceEpoch}-${session.calls.length + 1}',
        mode: mode,
        startedAt: iso,
      ),
    ]),
  );
}

CareSession endCareSessionCall(CareSession session, String callId,
    [DateTime? at]) {
  final DateTime stamp = at ?? DateTime.now();
  final String iso = stamp.toUtc().toIso8601String();
  bool changed = false;
  final List<CareSessionCall> calls = <CareSessionCall>[
    for (final CareSessionCall call in session.calls)
      if (call.id == callId && call.endedAt == null)
        CareSessionCall(
          id: call.id,
          mode: call.mode,
          startedAt: call.startedAt,
          endedAt: iso,
        )
      else
        call,
  ];
  for (int index = 0; index < session.calls.length; index += 1) {
    if (session.calls[index].id == callId &&
        session.calls[index].endedAt == null) {
      changed = true;
      break;
    }
  }
  if (!changed) return session;
  return session.copyWith(
    updatedAt: iso,
    calls: List<CareSessionCall>.unmodifiable(calls),
  );
}

CareSession endCareSession(
  CareSession session, {
  String? medicalRecordId,
  DateTime? endedAt,
}) {
  final DateTime stamp = endedAt ?? DateTime.now();
  final String iso = stamp.toUtc().toIso8601String();
  return session.copyWith(
    status: 'ended',
    updatedAt: iso,
    endedAt: iso,
    medicalRecordId: medicalRecordId,
    calls: List<CareSessionCall>.unmodifiable(<CareSessionCall>[
      for (final CareSessionCall call in session.calls)
        call.endedAt != null
            ? call
            : CareSessionCall(
                id: call.id,
                mode: call.mode,
                startedAt: call.startedAt,
                endedAt: iso,
              ),
    ]),
  );
}

List<CareSession> saveCareSession(
  List<CareSession> sessions,
  CareSession session, {
  int limit = kCareSessionLimit,
}) {
  final List<CareSession> next = <CareSession>[
    session,
    ...sessions.where((CareSession entry) => entry.id != session.id),
  ];
  next.sort((CareSession left, CareSession right) =>
      DateTime.parse(right.updatedAt).compareTo(DateTime.parse(left.updatedAt)));
  return List<CareSession>.unmodifiable(
      next.length > limit ? next.sublist(0, limit) : next);
}

TriageLevel careSessionLevel(CareSession session) {
  const Map<TriageLevel, int> rank = <TriageLevel, int>{
    TriageLevel.selfCare: 0,
    TriageLevel.routine: 1,
    TriageLevel.urgent: 2,
    TriageLevel.emergency: 3,
  };
  TriageLevel level = TriageLevel.selfCare;
  for (final CareSessionMessage message in session.transcript) {
    final TriageLevel? candidate = message.level;
    if (candidate == null) continue;
    if (rank[candidate]! > rank[level]!) level = candidate;
  }
  return level;
}

int careSessionDurationMs(CareSession session, {DateTime? now}) {
  final DateTime start = DateTime.tryParse(session.startedAt) ?? DateTime.now();
  final DateTime end = DateTime.tryParse(
          session.endedAt ?? (now ?? DateTime.now()).toUtc().toIso8601String()) ??
      DateTime.now();
  final int value = end.difference(start).inMilliseconds;
  return value < 0 ? 0 : value;
}

/// One ordered item of the 通话回放 timeline.
class CarePlaybackItem {
  const CarePlaybackItem.message({
    required this.id,
    required this.at,
    required this.offsetMs,
    required this.role,
    required this.text,
    required this.channel,
    this.level,
  })  : kind = 'message',
        callMode = '',
        durationMs = 0,
        open = false;

  const CarePlaybackItem.call({
    required this.id,
    required this.at,
    required this.offsetMs,
    required this.callMode,
    required this.durationMs,
    required this.open,
  })  : kind = 'call',
        role = '',
        text = '',
        channel = '',
        level = null;

  final String kind;
  final String id;
  final String at;
  final int offsetMs;
  final String role;
  final String text;
  final String channel;
  final TriageLevel? level;
  final String callMode;
  final int durationMs;
  final bool open;
}

List<CarePlaybackItem> buildCarePlayback(CareSession session,
    {DateTime? now}) {
  final DateTime? start = DateTime.tryParse(session.startedAt);
  final DateTime clock = now ?? DateTime.now();
  int offset(String at) {
    final DateTime? value = DateTime.tryParse(at);
    if (start == null || value == null) return 0;
    final int delta = value.difference(start).inMilliseconds;
    return delta < 0 ? 0 : delta;
  }

  final List<CarePlaybackItem> items = <CarePlaybackItem>[
    for (final CareSessionMessage message in session.transcript)
      CarePlaybackItem.message(
        id: message.id,
        at: message.at,
        offsetMs: offset(message.at),
        role: message.role,
        text: message.text,
        channel: message.channel,
        level: message.level,
      ),
    for (final CareSessionCall call in session.calls)
      CarePlaybackItem.call(
        id: call.id,
        at: call.startedAt,
        offsetMs: offset(call.startedAt),
        callMode: call.mode,
        durationMs: _callDurationMs(call, clock),
        open: call.endedAt == null,
      ),
  ];
  items.sort((CarePlaybackItem left, CarePlaybackItem right) {
    if (left.offsetMs != right.offsetMs) return left.offsetMs - right.offsetMs;
    if (left.kind == right.kind) return 0;
    return left.kind == 'call' ? -1 : 1;
  });
  return List<CarePlaybackItem>.unmodifiable(items);
}

int _callDurationMs(CareSessionCall call, DateTime clock) {
  final DateTime? start = DateTime.tryParse(call.startedAt);
  if (start == null) return 0;
  final DateTime end = call.endedAt == null
      ? clock
      : (DateTime.tryParse(call.endedAt!) ?? start);
  final int value = end.difference(start).inMilliseconds;
  return value < 0 ? 0 : value;
}

CareSession buildCareSessionFromMedicalRecord(MedicalRecord record) {
  final List<CareSessionMessage> transcript = <CareSessionMessage>[
    for (final MedicalTranscriptEntry entry in record.transcript)
      CareSessionMessage(
        id: entry.id,
        role: entry.role,
        text: entry.text,
        at: entry.at,
        channel: 'text',
        level: entry.level,
        attachmentIds: entry.attachmentIds,
      ),
  ];
  return CareSession(
    id: record.sessionId.isEmpty ? record.id : record.sessionId,
    memberId: record.memberId,
    memberLabel: record.memberLabel,
    mode: record.mode,
    title: _firstPatientText(transcript).isEmpty
        ? record.memberLabel
        : _firstPatientText(transcript),
    status: 'ended',
    startedAt: record.startedAt,
    updatedAt: record.endedAt,
    endedAt: record.endedAt,
    medicalRecordId: record.id,
    transcript: List<CareSessionMessage>.unmodifiable(transcript),
  );
}

List<CareSession> mergeCareSessions(
  List<CareSession> sessions,
  List<MedicalRecord> records,
) {
  final Map<String, CareSession> byId = <String, CareSession>{
    for (final CareSession session in sessions) session.id: session,
  };
  for (final MedicalRecord record in records) {
    CareSession? linked;
    for (final CareSession session in byId.values) {
      if (session.medicalRecordId == record.id ||
          session.id == record.sessionId) {
        linked = session;
        break;
      }
    }
    if (linked != null) {
      if ((linked.medicalRecordId ?? '').isEmpty &&
          linked.id == record.sessionId) {
        byId[linked.id] = linked.copyWith(medicalRecordId: record.id);
      }
      continue;
    }
    final CareSession synthesized = buildCareSessionFromMedicalRecord(record);
    byId.putIfAbsent(synthesized.id, () => synthesized);
  }
  final List<CareSession> merged = byId.values.toList(growable: false);
  merged.sort((CareSession left, CareSession right) =>
      DateTime.parse(right.updatedAt).compareTo(DateTime.parse(left.updatedAt)));
  return List<CareSession>.unmodifiable(merged);
}

MedicalRecord? careSessionRecord(
  CareSession session,
  List<MedicalRecord> records,
) {
  if ((session.medicalRecordId ?? '').isNotEmpty) {
    for (final MedicalRecord record in records) {
      if (record.id == session.medicalRecordId) return record;
    }
  }
  for (final MedicalRecord record in records) {
    if (record.sessionId == session.id) return record;
  }
  return null;
}

List<CareSession> parseCareSessions(String? raw) {
  if (raw == null || raw.isEmpty) return const <CareSession>[];
  Object? decoded;
  try {
    decoded = jsonDecode(raw);
  } on FormatException {
    return const <CareSession>[];
  }
  if (decoded is! List) return const <CareSession>[];
  final List<CareSession> sessions = decoded
      .map(CareSession.fromJson)
      .whereType<CareSession>()
      .toList(growable: false);
  final List<CareSession> sorted = sessions.toList(growable: true);
  sorted.sort((CareSession left, CareSession right) =>
      DateTime.parse(right.updatedAt).compareTo(DateTime.parse(left.updatedAt)));
  return List<CareSession>.unmodifiable(sorted);
}

String serializeCareSessions(List<CareSession> sessions) {
  return jsonEncode(sessions.map((CareSession session) => session.toJson()).toList());
}

/// Persistence port; shared preferences in the app, memory in tests.
abstract class CareSessionStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class SharedPreferencesCareSessionStorage implements CareSessionStorage {
  @override
  Future<String?> read() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString(kCareSessionsStorageKey);
  }

  @override
  Future<void> write(String value) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString(kCareSessionsStorageKey, value);
  }
}

class MemoryCareSessionStorage implements CareSessionStorage {
  MemoryCareSessionStorage([this._value]);

  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async => _value = value;
}

/// Observable visit-session store shared by chat, records, and the detail page.
class CareSessionStore extends ChangeNotifier {
  CareSessionStore._(this._storage, this._sessions);

  static Future<CareSessionStore> load(CareSessionStorage storage,
      {CareSessionStorage? fallback}) async {
    try {
      return CareSessionStore._(storage, parseCareSessions(await storage.read()));
    } catch (_) {
      return CareSessionStore._(
          fallback ?? MemoryCareSessionStorage(), <CareSession>[]);
    }
  }

  factory CareSessionStore.memory(
      [List<CareSession> initial = const <CareSession>[]]) {
    return CareSessionStore._(
      MemoryCareSessionStorage(serializeCareSessions(initial)),
      List<CareSession>.of(initial),
    );
  }

  final CareSessionStorage _storage;
  List<CareSession> _sessions;

  List<CareSession> get sessions => List<CareSession>.unmodifiable(_sessions);

  bool get isEmpty => _sessions.isEmpty;

  CareSession? find(String id) {
    for (final CareSession session in _sessions) {
      if (session.id == id) return session;
    }
    return null;
  }

  CareSession? findActive(String memberId) {
    for (final CareSession session in _sessions) {
      if (session.isActive && session.memberId == memberId) return session;
    }
    return null;
  }

  /// Reuses the patient's open session or starts one.
  Future<CareSession> ensureActive({
    required PatientProfile patient,
    required String mode,
    String? sessionId,
    DateTime? now,
    Duration staleAfter = const Duration(hours: 12),
  }) async {
    final DateTime stamp = now ?? DateTime.now();
    // A named session is authoritative: a fresh conversation id must never
    // inherit the previous conversation's open session.
    if (sessionId != null) {
      final CareSession? named = find(sessionId);
      if (named != null && named.isActive) return named;
      if (named == null) {
        final CareSession created = createCareSession(
          patient: patient,
          mode: mode,
          startedAt: stamp,
          id: sessionId,
        );
        await _commit(created);
        return created;
      }
    }
    final CareSession? active = findActive(patient.id);
    if (active != null &&
        stamp.difference(DateTime.parse(active.updatedAt)) <= staleAfter) {
      return active;
    }
    final CareSession created = createCareSession(
      patient: patient,
      mode: mode,
      startedAt: stamp,
      id: sessionId,
    );
    await _commit(created);
    return created;
  }

  Future<CareSession?> appendMessage(
    String id, {
    required String role,
    required String text,
    DateTime? at,
    String channel = 'text',
    TriageLevel? level,
    List<String> attachmentIds = const <String>[],
  }) async {
    final CareSession? current = find(id);
    if (current == null) return null;
    final CareSession next = appendCareSessionMessage(
      current,
      role: role,
      text: text,
      at: at,
      channel: channel,
      level: level,
      attachmentIds: attachmentIds,
    );
    await _commit(next);
    return next;
  }

  Future<CareSession?> startCall(String id, String mode) async {
    final CareSession? current = find(id);
    if (current == null) return null;
    final CareSession next = startCareSessionCall(current, mode);
    if (identical(next, current)) return current;
    await _commit(next);
    return next;
  }

  Future<CareSession?> endCall(String id, String callId,
      [DateTime? at]) async {
    final CareSession? current = find(id);
    if (current == null) return null;
    final CareSession next = endCareSessionCall(current, callId, at);
    if (identical(next, current)) return current;
    await _commit(next);
    return next;
  }

  Future<CareSession?> end(
    String id, {
    String? medicalRecordId,
    DateTime? endedAt,
  }) async {
    final CareSession? current = find(id);
    if (current == null) return null;
    final CareSession next = endCareSession(
      current,
      medicalRecordId: medicalRecordId,
      endedAt: endedAt,
    );
    await _commit(next);
    return next;
  }

  Future<void> remove(String id) async {
    _sessions = _sessions
        .where((CareSession session) => session.id != id)
        .toList(growable: false);
    notifyListeners();
    await _persist();
  }

  Future<void> clear() async {
    _sessions = <CareSession>[];
    notifyListeners();
    await _persist();
  }

  Future<void> _commit(CareSession session) async {
    _sessions = saveCareSession(_sessions, session);
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    try {
      await _storage.write(serializeCareSessions(_sessions));
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
  return List<String>.unmodifiable(
    value.whereType<String>().where((String entry) => entry.isNotEmpty),
  );
}
