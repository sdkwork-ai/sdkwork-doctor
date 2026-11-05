/// Presentation state of the care conversation list.
///
/// The controller is the only place that talks to the conversation services;
/// widgets render its state and call its commands
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 4).
library;

import 'package:flutter/foundation.dart';

import '../models/care_conversation.dart';
import '../services/care_conversation_service.dart';
import 'care_human_consultations.dart';
import 'care_session_pins.dart';

/// Loading and error state of the session list and the open transcript.
///
/// The list is the merge of two sources: the agents transport (the AI family
/// doctor) and the on-device human consultations. A human consultation owns its
/// own transcript, its unread replies, and its ended state; the controller keeps
/// both kinds rendering through the same row and transcript API.
class CareConversationsController extends ChangeNotifier {
  CareConversationsController({
    required this.service,
    CareSessionPinStorage? pinStorage,
    CareHumanConsultationStore? humanStore,
  })  : _pinStorage = pinStorage ?? MemoryCareSessionPinStorage(),
        _humanStore = humanStore ?? CareHumanConsultationStore();

  final CareConversationService service;

  final CareSessionPinStorage _pinStorage;

  final CareHumanConsultationStore _humanStore;

  /// Pinned session ids; read lazily on the first list load.
  final Set<String> _pinnedIds = <String>{};

  bool _pinsLoaded = false;

  /// Rows returned by the agents transport.
  List<CareConversationSession> _remoteSessions =
      const <CareConversationSession>[];

  /// Merged rows: human consultations plus the transport's AI sessions.
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

  /// The human consultation store, exposed so the doctor surface can read it.
  CareHumanConsultationStore get humanConsultations => _humanStore;

  /// True when the open conversation belongs to a human doctor.
  bool get activeIsHuman => activeSession?.isHuman ?? false;

  /// True when the drawer floats [sessionId] above the rest of the list.
  bool isPinned(String sessionId) => _pinnedIds.contains(sessionId);

  /// Total unread doctor replies across the human consultations.
  int get unreadTotal {
    int total = 0;
    for (final CareConversationSession session in _sessions) {
      if (session.isHuman) total += session.unreadCount;
    }
    return total;
  }

  /// Toggles the pin of one session, reorders the list, and persists the
  /// preference. Pinning never changes the session on the transport.
  Future<void> togglePin(String sessionId) async {
    await _ensurePins();
    if (!_pinnedIds.remove(sessionId)) {
      _pinnedIds.add(sessionId);
    }
    _sessions = _ordered(_sessions);
    _notify();
    try {
      await _pinStorage.write(_pinnedIds.toList(growable: false));
    } catch (_) {
      // Keep the session copy when the device rejects the write.
    }
  }

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
      await _ensurePins();
      await _humanStore.load();
      _remoteSessions = await service.listSessions();
      _rebuildSessions();
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
      _rebuildSessions();
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Re-reads the session list without touching the open transcript.
  Future<void> refreshSessions() async {
    try {
      await _ensurePins();
      await _humanStore.load();
      _remoteSessions = await service.listSessions();
      _rebuildSessions();
      if (_activeSessionId == null && _sessions.isNotEmpty) {
        _activeSessionId = _sessions.first.id;
      }
      _notify();
    } catch (error) {
      _rebuildSessions();
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
    final CareConversationSession? session = _findMerged(sessionId);
    if (session?.isHuman == true) {
      await _humanStore.markRead(sessionId);
      _rebuildSessions();
    }
    await _loadMessages(sessionId);
  }

  /// Starts a new AI conversation and opens it.
  Future<void> createNew({String? title}) async {
    _error = null;
    try {
      final CareConversationSession session =
          await service.createSession(title: title);
      await _ensurePins();
      _remoteSessions = <CareConversationSession>[
        session,
        for (final CareConversationSession existing in _remoteSessions)
          if (existing.id != session.id) existing,
      ];
      _rebuildSessions();
      _activeSessionId = session.id;
      _messages = const <CareConversationMessage>[];
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Opens the human consultation with one doctor and switches to it.
  ///
  /// Reuses the open conversation with that doctor when it is recent, so a
  /// second tap continues the conversation instead of losing the first reason.
  Future<CareConversationSession?> startHumanConsultation({
    required CareConversationDoctor doctor,
    required String memberLabel,
    required String reason,
  }) async {
    _error = null;
    try {
      final CareConversationSession session = await _humanStore.start(
        doctor: doctor,
        memberLabel: memberLabel,
        reason: reason,
      );
      await _humanStore.markRead(session.id);
      _activeSessionId = session.id;
      _rebuildSessions();
      _messages = _humanStore.messages(session.id);
      _notify();
      return _findMerged(session.id);
    } catch (error) {
      _error = _messageOf(error);
      _notify();
      return null;
    }
  }

  /// Sends one patient turn into the open human consultation.
  ///
  /// A human consultation has no assistant of the app's own, so this appends
  /// only the patient's turn; the doctor's reply arrives from [replyAsDoctor].
  Future<void> sendPatientMessage(String text) async {
    final String content = text.trim();
    final String? sessionId = _activeSessionId;
    if (content.isEmpty || sessionId == null || _sending) return;
    if (_findMerged(sessionId)?.isHuman != true) return;
    _sending = true;
    _error = null;
    _notify();
    try {
      await _humanStore.appendPatientMessage(sessionId, content);
      _rebuildSessions();
      _messages = _humanStore.messages(sessionId);
      _sending = false;
      _notify();
    } catch (error) {
      _sending = false;
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Writes the doctor's own reply into a human consultation.
  ///
  /// The family sees it unread unless this is the conversation already on screen.
  Future<void> replyAsDoctor(String sessionId, String text) async {
    final String content = text.trim();
    if (content.isEmpty) return;
    try {
      await _humanStore.appendDoctorReply(sessionId, content);
      if (_activeSessionId == sessionId) {
        await _humanStore.markRead(sessionId);
        _messages = _humanStore.messages(sessionId);
      }
      _rebuildSessions();
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Ends the open human consultation without producing a medical record.
  Future<void> endActiveHumanConsultation() async {
    final String? sessionId = _activeSessionId;
    if (sessionId == null) return;
    if (_findMerged(sessionId)?.isHuman != true) return;
    try {
      await _humanStore.end(sessionId);
      _rebuildSessions();
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
      if (_humanStore.find(sessionId) != null) {
        await _humanStore.rename(sessionId, resolved);
        _rebuildSessions();
        _notify();
        return;
      }
      await service.renameSession(sessionId, resolved);
      _remoteSessions = <CareConversationSession>[
        for (final CareConversationSession session in _remoteSessions)
          if (session.id == sessionId)
            session.copyWith(title: resolved)
          else
            session,
      ];
      _rebuildSessions();
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  Future<void> delete(String sessionId) async {
    try {
      if (_humanStore.find(sessionId) != null) {
        await _humanStore.remove(sessionId);
      } else {
        await service.deleteSession(sessionId);
        _remoteSessions = <CareConversationSession>[
          for (final CareConversationSession session in _remoteSessions)
            if (session.id != sessionId) session,
        ];
      }
      await _ensurePins();
      if (_pinnedIds.remove(sessionId)) {
        try {
          await _pinStorage.write(_pinnedIds.toList(growable: false));
        } catch (_) {
          // Keep the session copy when the device rejects the write.
        }
      }
      _rebuildSessions();
      if (_activeSessionId == sessionId) {
        _activeSessionId = _sessions.isEmpty ? null : _sessions.first.id;
        _messages = _activeSessionId == null
            ? const <CareConversationMessage>[]
            : await _messagesFor(_activeSessionId!);
      }
      _notify();
    } catch (error) {
      _error = _messageOf(error);
      _notify();
    }
  }

  /// Sends one turn into the active AI session and returns the assistant text.
  ///
  /// Returns `null` when there is no open AI session, the input is empty, the
  /// open session is a human consultation, or the send failed; the failure is
  /// exposed through [error].
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
    if (_findMerged(sessionId)?.isHuman == true) {
      await sendPatientMessage(content);
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
      final List<CareConversationMessage> loaded = await _messagesFor(sessionId);
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

  Future<List<CareConversationMessage>> _messagesFor(String sessionId) async {
    if (_humanStore.find(sessionId) != null) {
      return _humanStore.messages(sessionId);
    }
    return service.listMessages(sessionId);
  }

  CareConversationSession? _findMerged(String sessionId) {
    for (final CareConversationSession session in _sessions) {
      if (session.id == sessionId) return session;
    }
    return null;
  }

  /// Rebuilds the merged list from both sources and keeps the pin order.
  void _rebuildSessions() {
    _sessions = _ordered(<CareConversationSession>[
      ..._humanStore.sessions,
      ..._remoteSessions,
    ]);
  }

  /// Reads the pinned ids once; a storage failure degrades to "nothing pinned"
  /// instead of taking the drawer down.
  Future<void> _ensurePins() async {
    if (_pinsLoaded) return;
    _pinsLoaded = true;
    try {
      _pinnedIds.addAll(await _pinStorage.read());
    } catch (_) {
      _pinnedIds.clear();
    }
  }

  /// Pinned sessions first (newest first inside each group), then the rest by
  /// their last update. The transport order is never trusted to carry pins.
  List<CareConversationSession> _ordered(
    Iterable<CareConversationSession> sessions,
  ) {
    final List<CareConversationSession> ordered =
        List<CareConversationSession>.of(sessions);
    ordered.sort((CareConversationSession left, CareConversationSession right) {
      final bool leftPinned = _pinnedIds.contains(left.id);
      final bool rightPinned = _pinnedIds.contains(right.id);
      if (leftPinned != rightPinned) return leftPinned ? -1 : 1;
      return right.updatedAt.compareTo(left.updatedAt);
    });
    return List<CareConversationSession>.unmodifiable(ordered);
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
    _humanStore.dispose();
    super.dispose();
  }
}
