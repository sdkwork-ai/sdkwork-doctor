/// On-device conversation transport.
///
/// Used when no agents deployment is configured, exactly like the offline care
/// agent this package replaces: the session list and every transcript stay on
/// the device, and the application injects the triage responder so the red-flag
/// vocabulary keeps living in the app's `triage.dart`.
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/care_conversation.dart';
import 'care_conversation_service.dart';

/// Storage port of the on-device session store.
///
/// Injected by the bootstrap so tests and other surfaces can swap it, and so the
/// service never owns platform plugins
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 7).
abstract interface class CareConversationStorage {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> remove(String key);
}

/// `shared_preferences` implementation of [CareConversationStorage].
class SharedPreferencesCareConversationStorage implements CareConversationStorage {
  const SharedPreferencesCareConversationStorage({this.namespace = 'sdkwork.doctor.care'});

  final String namespace;

  @override
  Future<String?> read(String key) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString('$namespace.$key');
  }

  @override
  Future<void> write(String key, String value) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString('$namespace.$key', value);
  }

  @override
  Future<void> remove(String key) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.remove('$namespace.$key');
  }
}

/// In-memory storage, used by tests and previews.
class InMemoryCareConversationStorage implements CareConversationStorage {
  final Map<String, String> _values = <String, String>{};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    _values.remove(key);
  }
}

/// Produces the offline care answer for one user message.
typedef CareOfflineResponder = String Function(String content);

/// Applies the care reply policy (escalation lead, safety line) to a raw answer.
typedef CareReplyDecorator = String Function(String userText, String rawReply);

/// Local, on-device implementation of [CareConversationService].
class LocalCareConversationService implements CareConversationService {
  LocalCareConversationService({
    required this.storage,
    required this.offlineResponder,
    this.defaultTitle = 'On-device triage',
    this.replyDecorator,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final CareConversationStorage storage;
  final CareOfflineResponder offlineResponder;
  final String defaultTitle;
  final CareReplyDecorator? replyDecorator;
  final DateTime Function() _now;

  static const String sessionsKey = 'sessions.v1';

  static String messagesKey(String sessionId) => 'session.v1.$sessionId';

  @override
  String get mode => 'offline';

  @override
  Future<List<CareConversationSession>> listSessions() async {
    final List<CareConversationSession> sessions = await _readSessions();
    if (sessions.isNotEmpty) {
      return sessions;
    }
    final CareConversationSession seeded = CareConversationSession(
      id: _newId(),
      title: defaultTitle,
      updatedAt: _now(),
    );
    await _writeSessions(<CareConversationSession>[seeded]);
    return <CareConversationSession>[seeded];
  }

  @override
  Future<CareConversationSession> createSession({String? title}) async {
    final String resolved = (title ?? '').trim().isEmpty ? defaultTitle : title!.trim();
    final CareConversationSession session = CareConversationSession(
      id: _newId(),
      title: resolved,
      updatedAt: _now(),
    );
    final List<CareConversationSession> sessions = await listSessions();
    await _writeSessions(<CareConversationSession>[session, ...sessions]);
    return session;
  }

  @override
  Future<void> renameSession(String sessionId, String title) async {
    final String resolved = title.trim();
    if (resolved.isEmpty) {
      throw const CareConversationException('session title must not be empty');
    }
    final List<CareConversationSession> sessions = await listSessions();
    final List<CareConversationSession> next = <CareConversationSession>[
      for (final CareConversationSession session in sessions)
        if (session.id == sessionId)
          CareConversationSession(
            id: session.id,
            title: resolved,
            updatedAt: session.updatedAt,
          )
        else
          session,
    ];
    await _writeSessions(next);
  }

  @override
  Future<void> deleteSession(String sessionId) async {
    final List<CareConversationSession> sessions = await listSessions();
    await _writeSessions(<CareConversationSession>[
      for (final CareConversationSession session in sessions)
        if (session.id != sessionId) session,
    ]);
    await storage.remove(messagesKey(sessionId));
  }

  @override
  Future<List<CareConversationMessage>> listMessages(String sessionId) async {
    final String? raw = await storage.read(messagesKey(sessionId));
    if (raw == null || raw.isEmpty) {
      return const <CareConversationMessage>[];
    }
    final Object? decoded = _tryDecode(raw);
    if (decoded is! List) {
      return const <CareConversationMessage>[];
    }
    final List<CareConversationMessage> messages = <CareConversationMessage>[];
    for (final Object? entry in decoded) {
      if (entry is! Map) {
        continue;
      }
      final Map<String, dynamic> record = entry.map<String, dynamic>(
        (Object? key, Object? value) => MapEntry<String, dynamic>('$key', value),
      );
      final String id = record['id']?.toString() ?? '';
      final String text = record['text']?.toString() ?? '';
      if (id.isEmpty || text.isEmpty) {
        continue;
      }
      messages.add(CareConversationMessage(
        id: id,
        isUser: record['isUser'] == true,
        text: text,
        createdAt: DateTime.tryParse(record['createdAt']?.toString() ?? ''),
      ));
    }
    return messages;
  }

  @override
  Future<String> sendTurn({
    required String sessionId,
    required String content,
    String? systemPrompt,
    String Function(String rawReply)? decorate,
  }) async {
    final String text = content.trim();
    if (text.isEmpty) {
      throw const CareConversationException('message must not be empty');
    }
    final String raw = offlineResponder(text);
    final String decorated = replyDecorator?.call(text, raw) ?? raw;
    final String answer = decorate == null ? decorated : decorate(decorated);
    final DateTime at = _now();
    final List<CareConversationMessage> messages = <CareConversationMessage>[
      ...await listMessages(sessionId),
      CareConversationMessage(
        id: _newId(),
        isUser: true,
        text: text,
        createdAt: at,
      ),
      CareConversationMessage(
        id: _newId(),
        isUser: false,
        text: answer,
        createdAt: at,
      ),
    ];
    await storage.write(messagesKey(sessionId), jsonEncode(<Map<String, Object?>>[
      for (final CareConversationMessage message in messages)
        <String, Object?>{
          'id': message.id,
          'isUser': message.isUser,
          'text': message.text,
          'createdAt': message.createdAt?.toUtc().toIso8601String(),
        },
    ]));
    await _touch(sessionId, at);
    return answer;
  }

  Future<void> _touch(String sessionId, DateTime at) async {
    final List<CareConversationSession> sessions = await listSessions();
    await _writeSessions(<CareConversationSession>[
      for (final CareConversationSession session in sessions)
        if (session.id == sessionId)
          CareConversationSession(id: session.id, title: session.title, updatedAt: at)
        else
          session,
    ]);
  }

  Future<List<CareConversationSession>> _readSessions() async {
    final String? raw = await storage.read(sessionsKey);
    if (raw == null || raw.isEmpty) {
      return <CareConversationSession>[];
    }
    final Object? decoded = _tryDecode(raw);
    if (decoded is! List) {
      return <CareConversationSession>[];
    }
    final List<CareConversationSession> sessions = <CareConversationSession>[];
    for (final Object? entry in decoded) {
      if (entry is! Map) {
        continue;
      }
      final Map<String, dynamic> record = entry.map<String, dynamic>(
        (Object? key, Object? value) => MapEntry<String, dynamic>('$key', value),
      );
      final String id = record['id']?.toString() ?? '';
      if (id.isEmpty) {
        continue;
      }
      sessions.add(CareConversationSession(
        id: id,
        title: record['title']?.toString() ?? '',
        updatedAt: DateTime.tryParse(record['updatedAt']?.toString() ?? '') ?? _now(),
      ));
    }
    sessions.sort(
      (CareConversationSession left, CareConversationSession right) =>
          right.updatedAt.compareTo(left.updatedAt),
    );
    return sessions;
  }

  Future<void> _writeSessions(List<CareConversationSession> sessions) async {
    await storage.write(sessionsKey, jsonEncode(<Map<String, Object?>>[
      for (final CareConversationSession session in sessions)
        <String, Object?>{
          'id': session.id,
          'title': session.title,
          'updatedAt': session.updatedAt.toUtc().toIso8601String(),
        },
    ]));
  }
}

Object? _tryDecode(String raw) {
  try {
    return jsonDecode(raw);
  } on FormatException {
    return null;
  }
}

int _idCounter = 0;

String _newId() {
  _idCounter += 1;
  return 'local-${DateTime.now().microsecondsSinceEpoch}-$_idCounter';
}
