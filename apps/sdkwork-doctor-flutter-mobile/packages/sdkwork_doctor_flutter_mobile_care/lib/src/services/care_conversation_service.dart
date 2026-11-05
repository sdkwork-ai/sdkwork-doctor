/// The conversation service port every Doctor care surface consumes.
///
/// Widgets never build transport: the application bootstrap constructs the
/// generated `SdkworkAppClient` and injects the service here
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` sections 5 and 6).
library;

import '../models/care_conversation.dart';

/// Signs the idempotent writes the agents app API requires.
///
/// `payloadHash` is an opaque equality fingerprint, so the algorithm belongs to
/// the application contract; the package ships the shared Doctor fingerprint as
/// the default and accepts an injected signer.
abstract interface class CarePayloadSigner {
  String sessionPayloadHash(String title, String entrySurface);

  String turnPayloadHash(
    String content,
    String contentType,
    String entrySurface,
  );
}

/// Resolves the conversation transport explicitly; the surface renders the mode
/// this returns and never silently falls back from hosted.
String resolveCareConversationMode({
  required String agentsApiBaseUrl,
  required bool hasAccessToken,
}) {
  if (agentsApiBaseUrl.trim().isEmpty) {
    return 'offline';
  }
  if (!hasAccessToken) {
    return 'offline';
  }
  return 'hosted';
}

/// Conversation transport used by the session drawer and the chat surface.
///
/// `mode` is `hosted` for the agents app API and `offline` for the
/// on-device store.
abstract class CareConversationService {
  String get mode;

  /// Sessions of the care agent, newest first.
  Future<List<CareConversationSession>> listSessions();

  /// Creates a session and returns it.
  Future<CareConversationSession> createSession({String? title});

  Future<void> renameSession(String sessionId, String title);

  Future<void> deleteSession(String sessionId);

  /// Transcript rows of [sessionId] in render order.
  Future<List<CareConversationMessage>> listMessages(String sessionId);

  /// Sends one turn and returns the assistant text to render.
  ///
  /// [decorate] lets the owning surface apply its reply policy (escalation lead,
  /// safety line) to the raw answer before it is returned and stored.
  Future<String> sendTurn({
    required String sessionId,
    required String content,
    String? systemPrompt,
    String Function(String rawReply)? decorate,
  });
}

/// Optional capability: the agent writes the 病历 when the patient ends a
/// conversation. The hosted transport implements it; the on-device transport
/// does not, so the application builds the deterministic offline summary.
abstract interface class CareSummaryService {
  Future<CareSummaryDraft> summarize(CareSummaryInput input);
}
