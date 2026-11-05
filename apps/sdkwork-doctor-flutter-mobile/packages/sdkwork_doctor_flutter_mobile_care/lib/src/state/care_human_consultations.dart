/// Human consultations held inside the conversation home.
///
/// A human consultation is not an agents session: the family talks to one of its
/// roster doctors, the doctor replies on this device, and unread replies are
/// counted per conversation. Keeping the store apart from the agents transport
/// means a hosted deployment never receives a fake doctor turn, and the on-device
/// fallback and the hosted transport show human consultations the same way.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/care_conversation.dart';

/// Storage key of the on-device human consultations.
const String kCareHumanConsultationsStorageKey =
    'sdkwork.doctor.care.human-consultations.v1';

/// How long an open consultation keeps accepting turns before a new tap starts
/// a fresh one. Mirrors the TypeScript care-session store.
const Duration kCareHumanConsultationStaleAfter = Duration(hours: 12);

/// Persistence port of the human consultations.
abstract interface class CareHumanConsultationStorage {
  Future<String?> read();

  Future<void> write(String value);
}

/// `shared_preferences` implementation.
class SharedPreferencesCareHumanConsultationStorage
    implements CareHumanConsultationStorage {
  const SharedPreferencesCareHumanConsultationStorage({
    this.storageKey = kCareHumanConsultationsStorageKey,
  });

  final String storageKey;

  @override
  Future<String?> read() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString(storageKey);
  }

  @override
  Future<void> write(String value) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageKey, value);
  }
}

/// In-memory implementation for tests and hosts without storage.
class MemoryCareHumanConsultationStorage
    implements CareHumanConsultationStorage {
  MemoryCareHumanConsultationStorage([this._value]);

  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async {
    _value = value;
  }
}

/// One stored consultation: its row plus its transcript.
class _HumanConsultationRecord {
  _HumanConsultationRecord({
    required this.session,
    required this.messages,
  });

  CareConversationSession session;
  final List<CareConversationMessage> messages;
}

/// The family's human consultations, newest first.
///
/// The store is the only owner of the on-device conversation document; the
/// controller merges its rows with the agents sessions and renders both.
class CareHumanConsultationStore extends ChangeNotifier {
  CareHumanConsultationStore({
    CareHumanConsultationStorage? storage,
    DateTime Function()? now,
  })  : storage = storage ?? MemoryCareHumanConsultationStorage(),
        _now = now ?? DateTime.now;

  final CareHumanConsultationStorage storage;
  final DateTime Function() _now;

  final Map<String, _HumanConsultationRecord> _records =
      <String, _HumanConsultationRecord>{};

  bool _loaded = false;

  int _counter = 0;

  /// Loads the document once; a malformed document degrades to no consultations.
  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    String? raw;
    try {
      raw = await storage.read();
    } catch (_) {
      raw = null;
    }
    if (raw == null || raw.isEmpty) return;
    Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      return;
    }
    if (decoded is! Map) return;
    final Object? sessions = decoded['sessions'];
    if (sessions is! List) return;
    for (final Object? entry in sessions) {
      if (entry is! Map) continue;
      final CareConversationSession? session =
          CareConversationSession.fromJson(entry);
      if (session == null || !session.isHuman) continue;
      final List<CareConversationMessage> messages = <CareConversationMessage>[];
      final Object? rows = entry['messages'];
      if (rows is List) {
        for (final Object? row in rows) {
          final CareConversationMessage? message =
              CareConversationMessage.fromJson(row);
          if (message != null) messages.add(message);
        }
      }
      _records[session.id] =
          _HumanConsultationRecord(session: session, messages: messages);
    }
  }

  /// Rows of the human consultations, newest update first.
  List<CareConversationSession> get sessions {
    final List<CareConversationSession> rows = <CareConversationSession>[
      for (final _HumanConsultationRecord record in _records.values) record.session,
    ];
    rows.sort((CareConversationSession left, CareConversationSession right) =>
        right.updatedAt.compareTo(left.updatedAt));
    return List<CareConversationSession>.unmodifiable(rows);
  }

  CareConversationSession? find(String sessionId) =>
      _records[sessionId]?.session;

  /// The open consultation this family holds with one doctor, if any.
  CareConversationSession? findActiveByDoctor(String doctorId) {
    for (final _HumanConsultationRecord record in _records.values) {
      if (record.session.isHuman &&
          record.session.isActive &&
          record.session.doctor.id == doctorId) {
        return record.session;
      }
    }
    return null;
  }

  List<CareConversationMessage> messages(String sessionId) =>
      List<CareConversationMessage>.unmodifiable(
          _records[sessionId]?.messages ?? const <CareConversationMessage>[]);

  /// Opens the conversation with [doctor], reusing a recent open one.
  ///
  /// [reason] becomes the patient's opening turn; an empty reason just opens the
  /// conversation. The caller navigates to the conversation afterwards.
  Future<CareConversationSession> start({
    required CareConversationDoctor doctor,
    required String memberLabel,
    required String reason,
  }) async {
    await load();
    final DateTime now = _now();
    final CareConversationSession? existing = findActiveByDoctor(doctor.id);
    if (existing != null && now.difference(existing.updatedAt) <= kCareHumanConsultationStaleAfter) {
      final String text = reason.trim();
      if (text.isEmpty) return existing;
      await appendPatientMessage(existing.id, text);
      return _records[existing.id]!.session;
    }
    _counter += 1;
    final String id = 'human-${now.microsecondsSinceEpoch}-$_counter';
    final String resolvedReason = reason.trim();
    final String title = _clampTitle(resolvedReason);
    final CareConversationSession session = CareConversationSession(
      id: id,
      title: title.isEmpty
          ? (memberLabel.trim().isEmpty ? doctor.displayName : memberLabel)
          : title,
      updatedAt: now,
      doctor: doctor,
      memberLabel: memberLabel,
      startedAt: now,
      preview: resolvedReason.isEmpty
          ? ''
          : kCarePatientPreviewPrefix + resolvedReason,
    );
    final _HumanConsultationRecord record = _HumanConsultationRecord(
      session: session,
      messages: <CareConversationMessage>[],
    );
    if (resolvedReason.isNotEmpty) {
      record.messages.add(CareConversationMessage(
        id: '$id-turn-1',
        isUser: true,
        text: resolvedReason,
        createdAt: now,
      ));
    }
    _records[id] = record;
    await _persist();
    notifyListeners();
    return session;
  }

  /// Appends one patient turn; an empty text is ignored.
  Future<void> appendPatientMessage(String sessionId, String text) async {
    final String value = text.trim();
    final _HumanConsultationRecord? record = _records[sessionId];
    if (record == null || value.isEmpty || !record.session.isActive) return;
    final DateTime now = _now();
    record.messages.add(CareConversationMessage(
      id: '$sessionId-turn-${record.messages.length + 1}',
      isUser: true,
      text: value,
      createdAt: now,
    ));
    record.session = record.session.copyWith(
      updatedAt: now,
      preview: kCarePatientPreviewPrefix + value,
    );
    await _persist();
    notifyListeners();
  }

  /// Appends the doctor's reply and marks it unread for the family.
  Future<void> appendDoctorReply(String sessionId, String text) async {
    final String value = text.trim();
    final _HumanConsultationRecord? record = _records[sessionId];
    if (record == null || value.isEmpty || !record.session.isActive) return;
    final DateTime now = _now();
    record.messages.add(CareConversationMessage(
      id: '$sessionId-turn-${record.messages.length + 1}',
      isUser: false,
      text: value,
      createdAt: now,
    ));
    record.session = record.session.copyWith(
      updatedAt: now,
      preview: kCareDoctorPreviewPrefix + value,
      unreadCount: record.session.unreadCount + 1,
    );
    await _persist();
    notifyListeners();
  }

  /// Clears the unread badge of one conversation; a no-op when it is already 0.
  Future<void> markRead(String sessionId) async {
    final _HumanConsultationRecord? record = _records[sessionId];
    if (record == null || record.session.unreadCount == 0) return;
    record.session = record.session.copyWith(unreadCount: 0);
    await _persist();
    notifyListeners();
  }

  /// Ends the consultation: it stops accepting turns and keeps its transcript.
  Future<void> end(String sessionId) async {
    final _HumanConsultationRecord? record = _records[sessionId];
    if (record == null || !record.session.isActive) return;
    final DateTime now = _now();
    record.session = CareConversationSession(
      id: record.session.id,
      title: record.session.title,
      updatedAt: now,
      doctor: record.session.doctor,
      memberLabel: record.session.memberLabel,
      startedAt: record.session.startedAt,
      status: CareConversationStatus.ended,
      endedAt: now,
      unreadCount: record.session.unreadCount,
      preview: record.session.preview,
    );
    await _persist();
    notifyListeners();
  }

  /// Renames one consultation, keeping its doctor attribution and transcript.
  Future<void> rename(String sessionId, String title) async {
    final String value = title.trim();
    final _HumanConsultationRecord? record = _records[sessionId];
    if (record == null || value.isEmpty) return;
    record.session = record.session.copyWith(title: value);
    await _persist();
    notifyListeners();
  }

  Future<void> remove(String sessionId) async {
    if (_records.remove(sessionId) == null) return;
    await _persist();
    notifyListeners();
  }

  Future<void> clear() async {
    if (_records.isEmpty) return;
    _records.clear();
    await _persist();
    notifyListeners();
  }

  Future<void> _persist() async {
    final List<Map<String, Object?>> rows = <Map<String, Object?>>[
      for (final _HumanConsultationRecord record in _records.values)
        <String, Object?>{
          ...record.session.toJson(),
          'messages': <Map<String, Object?>>[
            for (final CareConversationMessage message in record.messages)
              message.toJson(),
          ],
        },
    ];
    try {
      await storage.write(jsonEncode(<String, Object?>{'sessions': rows}));
    } catch (_) {
      // A rejected write keeps the in-memory copy; the UI never breaks on it.
    }
  }

  static String _clampTitle(String text) {
    final String value = text.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (value.length <= 40) return value;
    return '${value.substring(0, 39)}…';
  }
}
