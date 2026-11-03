/// Conversation domain models for the Doctor care surface.
///
/// The durable vocabulary follows `AGENTS_DOMAIN_SPEC.md`: one rendered
/// conversation is an `AgentSession` and each transcript row is an
/// `AgentSessionItem`. UI copy may say "message"; the resources keep the Agents
/// vocabulary so the Flutter root reads the same sessions the PC, H5, and mini
/// program roots read.
library;

/// One conversation in the care agent's session list.
class CareConversationSession {
  const CareConversationSession({
    required this.id,
    required this.title,
    required this.updatedAt,
  });

  /// Agents `sessionId`.
  final String id;

  /// Session title as stored by the service. Empty means the surface renders
  /// its own "untitled" copy.
  final String title;

  /// Last update timestamp, used to order the list newest first.
  final DateTime updatedAt;

  bool get hasTitle => title.trim().isNotEmpty;
}

/// One transcript row of a conversation.
class CareConversationMessage {
  const CareConversationMessage({
    required this.id,
    required this.isUser,
    required this.text,
    this.createdAt,
  });

  final String id;
  final bool isUser;
  final String text;
  final DateTime? createdAt;
}

/// Failure states of a conversation service. Never swallowed into an offline
/// reply: the surface renders the message and the retry affordance.
class CareConversationException implements Exception {
  const CareConversationException(
    this.message, {
    this.status,
    this.code,
    this.traceId,
  });

  final String message;
  final int? status;
  final Object? code;
  final String? traceId;

  @override
  String toString() => message;
}
