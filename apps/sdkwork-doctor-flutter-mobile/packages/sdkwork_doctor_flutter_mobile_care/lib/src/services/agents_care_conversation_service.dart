/// Conversation transport over the sdkwork-agents `/app/v3/api` surface.
///
/// Every call goes through the generated Dart app SDK (`SdkworkAppClient.ai`):
/// sessions, session items, and the kernel-v1 turn stream. This service owns no
/// transport of its own, so the HTTPS trust layer installed by the application
/// bootstrap applies to every request
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 6,
/// `APP_SDK_INTEGRATION_SPEC.md`).
library;

import 'dart:convert';
import 'dart:math';

import 'package:sdkwork_agents_app_sdk/sdkwork_agents_app_sdk.dart';

import '../models/care_conversation.dart';
import '../sdk/agents_envelope.dart';
import '../sdk/care_fingerprint.dart';
import 'care_conversation_service.dart';

/// Item kind the agents API uses for the assistant's visible answer.
const String kCareAssistantItemKind = 'assistant_output';

/// Item kind the agents API uses for the user's own message.
const String kCareUserItemKind = 'user_input';

/// Session kind every care conversation is created with.
const String kCareSessionKind = 'assistant';

/// Turn mode every care conversation sends with.
const String kCareTurnMode = 'interactive';

/// `AgentSessionEntrySurface` value recorded for this root.
const String kCareEntrySurface = 'flutter';

/// Wire protocol that turns on the rich `agent.stream.*` family.
const String kCareWireProtocol = 'kernel-v1';

/// Default owner of the payload hash: the fingerprint every Doctor client shares.
class CareFingerprintSigner implements CarePayloadSigner {
  const CareFingerprintSigner();

  @override
  String sessionPayloadHash(String title, String entrySurface) =>
      careSessionPayloadHash(title, entrySurface);

  @override
  String turnPayloadHash(
    String content,
    String contentType,
    String entrySurface,
  ) =>
      careTurnPayloadHash(content, contentType, entrySurface);
}

/// Hosted conversation service backed by the generated Agents app SDK.
class AgentsCareConversationService implements CareConversationService {
  AgentsCareConversationService({
    required this.client,
    required this.agentId,
    this.entrySurface = kCareEntrySurface,
    this.pageSize = 50,
    this.sessionKind = kCareSessionKind,
    this.turnMode = kCareTurnMode,
    this.signer = const CareFingerprintSigner(),
    DateTime Function()? now,
    String Function()? createId,
  })  : _now = now ?? DateTime.now,
        _createId = createId ?? _secureId;

  /// Generated SDK client constructed by the application bootstrap.
  final SdkworkAppClient client;

  /// Managed agent that plays the care role (`agent.family-doctor`).
  final String agentId;

  final String entrySurface;
  final int pageSize;
  final String sessionKind;
  final String turnMode;
  final CarePayloadSigner signer;

  final DateTime Function() _now;
  final String Function() _createId;

  @override
  String get mode => 'hosted';

  @override
  Future<List<CareConversationSession>> listSessions() async {
    final AgentSessionListResponse? response = await _guard(
      () => client.ai.agentsSessionsList(agentId, null, pageSize),
    );
    final List<CareConversationSession> sessions = <CareConversationSession>[];
    for (final Map<String, dynamic> record in carePageItems(response?.data)) {
      final CareConversationSession? session = _mapSession(record);
      if (session != null) {
        sessions.add(session);
      }
    }
    sessions.sort(
      (CareConversationSession left, CareConversationSession right) =>
          right.updatedAt.compareTo(left.updatedAt),
    );
    return sessions;
  }

  @override
  Future<CareConversationSession> createSession({String? title}) async {
    final String resolvedTitle = (title ?? '').trim().isEmpty
        ? 'Family doctor conversation'
        : title!.trim();
    final AgentSessionResponse? response = await _guard(
      () => client.ai.agentsSessionsCreate(
        agentId,
        CreateAgentSessionRequest(
          agentId: agentId,
          sessionKind: sessionKind,
          entrySurface: entrySurface,
          title: resolvedTitle,
          idempotencyKey: _createId(),
          payloadHash: signer.sessionPayloadHash(resolvedTitle, entrySurface),
          requestedAt: _now().toUtc().toIso8601String(),
        ),
      ),
    );
    final CareConversationSession? session =
        _mapSession(careResourceItem(response?.data) ?? const <String, dynamic>{});
    if (session == null) {
      throw const CareConversationException(
        'agents API session response is missing sessionId',
      );
    }
    return session;
  }

  @override
  Future<void> renameSession(String sessionId, String title) async {
    await _guard(
      () => client.ai.agentsSessionsUpdate(
        agentId,
        sessionId,
        AppUpdateAgentSessionRequest(title: title.trim()),
      ),
    );
  }

  @override
  Future<void> deleteSession(String sessionId) async {
    await _guard(() => client.ai.agentsSessionsDelete(agentId, sessionId));
  }

  @override
  Future<List<CareConversationMessage>> listMessages(String sessionId) async {
    final AgentSessionItemListResponse? response = await _guard(
      () => client.ai.agentsSessionItemsList(
        agentId,
        sessionId,
        null,
        pageSize,
        null,
        null,
        '-sequence',
      ),
    );
    final List<Map<String, dynamic>> records = carePageItems(response?.data);
    final List<CareConversationMessage> messages = <CareConversationMessage>[];
    // The page arrives newest first; the transcript renders oldest first.
    for (int index = records.length - 1; index >= 0; index -= 1) {
      final CareConversationMessage? message = _mapItem(records[index]);
      if (message != null) {
        messages.add(message);
      }
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
    final String requestId = _createId();
    final String trimmedPrompt = (systemPrompt ?? '').trim();
    final CreateAgentTurnRequest body = CreateAgentTurnRequest(
      content: content,
      contentType: 'text/plain',
      turnMode: turnMode,
      systemPrompt: trimmedPrompt.isEmpty ? null : trimmedPrompt,
      wireProtocol: kCareWireProtocol,
      idempotencyKey: requestId,
      payloadHash: signer.turnPayloadHash(content, 'text/plain', entrySurface),
      clientRequestId: requestId,
      requestedAt: _now().toUtc().toIso8601String(),
    );

    final StringBuffer streamed = StringBuffer();
    String? completed;
    try {
      await for (final AgentTurnStreamEvent event
          in client.ai.agentsTurnsStream(agentId, sessionId, body, true, kCareWireProtocol)) {
        switch (event.eventType) {
          case 'delta':
            final String delta = event.delta ?? '';
            if (delta.isNotEmpty) {
              streamed.write(delta);
            }
          case 'completion':
            completed = _answerFromCompletion(event.response?.data) ?? completed;
          case 'error':
            throw const CareConversationException('agents turn stream reported an error');
          default:
            break;
        }
      }
    } on CareConversationException {
      rethrow;
    } catch (error) {
      throw _mapError(error);
    }

    final String answer = (completed ?? streamed.toString()).trim();
    if (answer.isEmpty) {
      throw const CareConversationException(
        'agent turn produced no assistant_output content',
      );
    }
    return decorate == null ? answer : decorate(answer);
  }

  String? _answerFromCompletion(Object? data) {
    final Map<String, dynamic>? item = careResourceItem(data);
    if (item == null) {
      return null;
    }
    final List<Map<String, dynamic>> items = careAsMapList(item['items']);
    final List<String> parts = <String>[];
    for (final Map<String, dynamic> entry in items) {
      if (entry['kind'] != kCareAssistantItemKind) {
        continue;
      }
      final String text = entry['content']?.toString().trim() ?? '';
      if (text.isNotEmpty) {
        parts.add(text);
      }
    }
    return parts.isEmpty ? null : parts.join('\n');
  }

  CareConversationSession? _mapSession(Map<String, dynamic> record) {
    final Object? id = record['sessionId'];
    if (id is! String || id.isEmpty) {
      return null;
    }
    final String title = record['title']?.toString().trim() ?? '';
    return CareConversationSession(
      id: id,
      title: title,
      updatedAt: _parseTimestamp(record['updatedAt']) ?? _now(),
    );
  }

  CareConversationMessage? _mapItem(Map<String, dynamic> record) {
    final String kind = record['kind']?.toString() ?? '';
    if (kind != kCareUserItemKind && kind != kCareAssistantItemKind) {
      return null;
    }
    final String text = record['content']?.toString() ?? '';
    if (text.trim().isEmpty) {
      return null;
    }
    final String id = record['itemId']?.toString() ?? '';
    return CareConversationMessage(
      id: id.isEmpty ? '$kind-${record['sequence'] ?? ''}' : id,
      isUser: kind == kCareUserItemKind,
      text: text,
      createdAt: _parseTimestamp(record['createdAt']),
    );
  }

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } catch (error) {
      throw _mapError(error);
    }
  }

  CareConversationException _mapError(Object error) {
    if (error is CareConversationException) {
      return error;
    }
    final String raw = error.toString();
    // The generated SDK raises `Exception('HTTP 403: {body}')` for failures.
    final RegExpMatch? match = RegExp(r'HTTP (\d{3}):\s*(.*)', dotAll: true).firstMatch(raw);
    if (match == null) {
      return CareConversationException(raw);
    }
    final int status = int.tryParse(match.group(1) ?? '') ?? 0;
    final String body = match.group(2) ?? '';
    String message = 'agents API responded with HTTP $status';
    Object? code;
    String? traceId;
    try {
      final Object? decoded = _tryDecode(body);
      final Map<String, dynamic>? detail = careAsMap(decoded);
      if (detail != null) {
        final Object? title = detail['detail'] ?? detail['title'];
        if (title is String && title.trim().isNotEmpty) {
          message = title;
        }
        code = detail['code'];
        traceId = detail['traceId']?.toString();
      }
    } on FormatException {
      // Fall through to the status-only error.
    }
    return CareConversationException(message, status: status, code: code, traceId: traceId);
  }
}

DateTime? _parseTimestamp(Object? value) {
  final String text = value?.toString() ?? '';
  if (text.isEmpty) {
    return null;
  }
  return DateTime.tryParse(text)?.toLocal();
}

Object? _tryDecode(String body) {
  if (body.trim().isEmpty) {
    return null;
  }
  try {
    return jsonDecode(body);
  } on FormatException {
    return null;
  }
}

final Random _secureRandom = Random.secure();

String _secureId() {
  final List<int> bytes = List<int>.generate(16, (_) => _secureRandom.nextInt(256));
  return 'care-${bytes.map((int value) => value.toRadixString(16).padLeft(2, '0')).join()}';
}
