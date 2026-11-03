/// Presentation state of the care conversation list.
///
/// The controller is the only place that talks to [CareConversationService];
/// widgets render its state and call its commands
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 4).
library;

import 'package:flutter/foundation.dart';

import '../models/care_conversation.dart';
import '../services/care_conversation_service.dart';

/// Loading and error state of the session list and the open transcript.
class CareConversationsController extends ChangeNotifier {
  CareConversationsController({required this.service});

  final CareConversationService service;

  List<CareConversationSession> _sessions = const <CareConversationSession>[];
  List<CareConversationMessage> _messages = const <CareConversationMessage>[];
  String? _activeSessionId;
  bool _loadingSessions = false;
  bool _loadingMessages = false;
  bool _sending = false;
  String? _error;
  bool _disposed = false;

  String get mode => service.mode;

  List<CareConversationSession> get sessions => _sessions;

  List<CareConversationMessage> get messages => _messages;

  String? get activeSessionId => _activeSessionId;

  bool get loadingSessions => _loadingSessions;

  bool get loadingMessages => _loadingMessages;

  bool get sending => _sending;

  String? get error => _error;

  /// Session the chat composes into; `null` until a session is selected.
  CareConversationSession? get activeSession {
    for (final CareConversationSession session in _sessions) {
      if (session.id == _activeSessionId) {
        return session;
      }
    }
    return null;
  }

  /// Loads the session list and the transcript of the active session.
  Future<void> load() async {
    _loadingSessions = true;
    _error = null;
    _notify();
    try {
      _sessions = await service.listSessions();
      _activeSessionId ??= _sessions.isEmpty ? null : _sessions.first.id;
      _loadingSessions = false;
      _notify();
      final String? active = _activeSessionId;
      if (active != null) {
        await _loadMessages(active);
      } else {
        _messages = const <CareConversationMessage>[];
        _notify();
      }
    } catch (error) {
      _loadingSessions = false;
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Re-reads the session list without touching the open transcript.
  Future<void> refreshSessions() async {
    try {
      _sessions = await service.listSessions();
      if (_activeSessionId == null && _sessions.isNotEmpty) {
        _activeSessionId = _sessions.first.id;
      }
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Opens one session and loads its transcript.
  Future<void> select(String sessionId) async {
    if (_activeSessionId == sessionId) {
      return;
    }
    _activeSessionId = sessionId;
    _error = null;
    _notify();
    await _loadMessages(sessionId);
  }

  /// Starts a new conversation and opens it.
  Future<void> createNew({String? title}) async {
    _error = null;
    try {
      final CareConversationSession session = await service.createSession(title: title);
      _sessions = <CareConversationSession>[
        session,
        for (final CareConversationSession existing in _sessions)
          if (existing.id != session.id) existing,
      ];
      _activeSessionId = session.id;
      _messages = const <CareConversationMessage>[];
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  Future<void> rename(String sessionId, String title) async {
    final String resolved = title.trim();
    if (resolved.isEmpty) {
      return;
    }
    try {
      await service.renameSession(sessionId, resolved);
      _sessions = <CareConversationSession>[
        for (final CareConversationSession session in _sessions)
          if (session.id == sessionId)
            CareConversationSession(
              id: session.id,
              title: resolved,
              updatedAt: session.updatedAt,
            )
          else
            session,
      ];
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  Future<void> delete(String sessionId) async {
    try {
      await service.deleteSession(sessionId);
      _sessions = <CareConversationSession>[
        for (final CareConversationSession session in _sessions)
          if (session.id != sessionId) session,
      ];
      if (_activeSessionId == sessionId) {
        _activeSessionId = _sessions.isEmpty ? null : _sessions.first.id;
        _messages = _activeSessionId == null
            ? const <CareConversationMessage>[]
            : await service.listMessages(_activeSessionId!);
      }
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Sends one turn into the active session and returns the assistant text.
  ///
  /// Returns `null` when there is no open session, the input is empty, or the
  /// send failed; the failure is exposed through [error].
  Future<String?> send(
    String text, {
    String? systemPrompt,
    String Function(String rawReply)? decorate,
  }) async {
    final String content = text.trim();
    final String? sessionId = _activeSessionId;
    if (content.isEmpty || sessionId == null || _sending) {
      return null;
    }
    _sending = true;
    _error = null;
    _notify();
    try {
      final String reply = await service.sendTurn(
        sessionId: sessionId,
        content: content,
        systemPrompt: systemPrompt,
        decorate: decorate,
      );
      final DateTime at = DateTime.now();
      _messages = <CareConversationMessage>[
        ..._messages,
        CareConversationMessage(
          id: 'turn-user-${at.microsecondsSinceEpoch}',
          isUser: true,
          text: content,
          createdAt: at,
        ),
        CareConversationMessage(
          id: 'turn-assistant-${at.microsecondsSinceEpoch}',
          isUser: false,
          text: reply,
          createdAt: at,
        ),
      ];
      _sending = false;
      _notify();
      // The transcript order depends on updatedAt, so refresh the list order.
      await refreshSessions();
      return reply;
    } catch (error) {
      _sending = false;
      _error = _messageOf(error);
      _notify();
      return null;
    }
  }

  Future<void> _loadMessages(String sessionId) async {
    _loadingMessages = true;
    _notify();
    try {
      final List<CareConversationMessage> loaded = await service.listMessages(sessionId);
      if (_activeSessionId == sessionId) {
        _messages = loaded;
      }
      _loadingMessages = false;
      _notify();
    } catch (error) {
      _loadingMessages = false;
      _error = _messageOf(error);
      _notify();
    }
  }

  String _messageOf(Object error) =>
      error is CareConversationException ? error.message : error.toString();

  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
