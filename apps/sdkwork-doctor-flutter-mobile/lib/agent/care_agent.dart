import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../family.dart';
import '../triage.dart';
import 'fingerprint.dart';

/// Product binding: the managed sdkwork-agents agent that plays the family doctor.
const String kFamilyDoctorAgentId = 'agent.family-doctor';

/// Gateway surface prefix of the sdkwork-agents app API.
const String kAgentsApiPrefix = '/app/v3/api';

const String _sessionTitle = 'Family doctor conversation';
const String _safetyLine = 'This is general guidance, not a diagnosis. For emergencies call your local emergency number.';
const String _emergencyLead =
    'Emergency red flag detected. Call local emergency services now. Do not drive yourself. Stay with the person until help arrives.';

/// One conversation message rendered by the chat tab.
class CareMessage {
  const CareMessage({required this.role, required this.text, required this.level});

  final String role;
  final String text;
  final TriageLevel level;

  bool get isUser => role == 'user';
}

/// Failure states of the hosted transport. Never swallowed into an offline reply.
class CareAgentException implements Exception {
  const CareAgentException(this.message, {this.status, this.code, this.traceId});

  final String message;
  final int? status;
  final Object? code;
  final String? traceId;

  @override
  String toString() => message;
}

/// The conversation seam every Flutter screen consumes.
abstract class CareAgent {
  String get mode;
  List<CareMessage> get history;
  Future<CareMessage> send(String input, FamilyMember member);
}

/// Local triage-only adapter used when no agents deployment is configured.
class OfflineCareAgent implements CareAgent {
  final List<CareMessage> _history = <CareMessage>[];

  @override
  String get mode => 'offline';

  @override
  List<CareMessage> get history => List<CareMessage>.unmodifiable(_history);

  @override
  Future<CareMessage> send(String input, FamilyMember member) async {
    final String text = input.trim();
    if (text.isEmpty) throw const CareAgentException('message must not be empty');
    final TriageResult triage = triageSymptoms(text);
    _history.add(CareMessage(role: 'user', text: text, level: triage.level));
    final CareMessage reply = CareMessage(
      role: 'assistant',
      text: _composeReply(triage, _offlineAnswer(triage), member),
      level: triage.level,
    );
    _history.add(reply);
    return reply;
  }
}

String _offlineAnswer(TriageResult triage) {
  if (triage.level == TriageLevel.emergency) {
    return '${triage.actions.join(' ')} $_safetyLine';
  }
  if (triage.level == TriageLevel.routine) {
    return 'No red flag was found in what you described. ${triage.actions.join(' ')} $_safetyLine';
  }
  return 'Tell me the symptom, when it started, and how severe it is. $_safetyLine';
}

int _rank(TriageLevel level) {
  switch (level) {
    case TriageLevel.emergency:
      return 3;
    case TriageLevel.urgent:
      return 2;
    case TriageLevel.routine:
      return 1;
    case TriageLevel.selfCare:
      return 0;
  }
}

/// The user's text sets the floor; a red flag inside the hosted answer can only raise it.
TriageResult resolveReplyTriage(String userText, String replyText) {
  final TriageResult fromUser = triageSymptoms(userText);
  final TriageResult fromReply = triageSymptoms(replyText);
  if (_rank(fromReply.level) <= _rank(fromUser.level)) return fromUser;
  return TriageResult(fromReply.level, 'The doctor reply itself contained a red flag.', fromReply.actions);
}

/// Escalation guidance leads the message; the hosted answer is preserved after it.
String _composeReply(TriageResult triage, String replyText, FamilyMember member) {
  final String who = member.displayName == 'Me' ? 'you' : member.displayName;
  final String lead = triage.level == TriageLevel.emergency
      ? '$_emergencyLead ($who)'
      : triage.level == TriageLevel.urgent
          ? 'This needs a same-day clinician review ($who). ${triage.actions.join(' ')}'
          : '';
  final String body = replyText.contains(_safetyLine) ? replyText : '$replyText $_safetyLine';
  return lead.isEmpty ? body : '$lead $body';
}

/// System prompt that turns a generic agent into this family's private doctor.
String buildFamilyDoctorSystemPrompt(FamilyMember member) {
  final String allergies = member.allergies.isEmpty ? 'none recorded' : member.allergies.join(', ');
  final String conditions = member.chronicConditions.isEmpty ? 'none recorded' : member.chronicConditions.join(', ');
  final String medications = member.medications.isEmpty ? 'none recorded' : member.medications.join(', ');
  return <String>[
    'You are the family private doctor for ${member.displayName} (${member.relation}, born ${member.birthYear}).',
    'Known allergies: $allergies. Chronic conditions: $conditions. Current medications: $medications.',
    'Answer in the language the user writes in, concisely, with concrete next steps.',
    'Never claim a diagnosis and never change a prescription dose.',
    'If the message contains an emergency red flag, tell the user to call local emergency services immediately '
        'and do not offer self-treatment.',
  ].join(' ');
}

/// Normalizes an agents API base URL to the gateway root the path builders expect.
String resolveCareAgentsBaseUrl(String agentsApiBaseUrl) {
  final String normalized = agentsApiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
  if (normalized.isEmpty) throw const CareAgentException('agentsApiBaseUrl must not be empty');
  final bool hasSuffix = normalized.endsWith(kAgentsApiPrefix);
  if (normalized.contains(kAgentsApiPrefix) && !hasSuffix) {
    throw const CareAgentException('agentsApiBaseUrl must be a gateway root or end with $kAgentsApiPrefix');
  }
  if (!hasSuffix) return normalized;
  return normalized.substring(0, normalized.length - kAgentsApiPrefix.length);
}

/// Hosted conversation adapter over the sdkwork-agents app API.
class HostedCareAgent implements CareAgent {
  HostedCareAgent({
    required String agentsApiBaseUrl,
    required String? Function() getAccessToken,
    this.agentId = kFamilyDoctorAgentId,
    this.entrySurface = 'flutter',
    this.systemPromptBuilder = buildFamilyDoctorSystemPrompt,
    HttpClient? httpClient,
    DateTime Function()? now,
    String Function()? createId,
    this.stream = false,
    this.onDelta,
  })  : _baseUrl = resolveCareAgentsBaseUrl(agentsApiBaseUrl),
        _getAccessToken = getAccessToken,
        _client = httpClient ?? HttpClient(),
        _now = now ?? DateTime.now,
        _createId = createId ?? _uuidV4;

  final String agentId;
  final String entrySurface;
  final String Function(FamilyMember member) systemPromptBuilder;
  final bool stream;
  final void Function(String delta)? onDelta;

  final String _baseUrl;
  final String? Function() _getAccessToken;
  final HttpClient _client;
  final DateTime Function() _now;
  final String Function() _createId;
  final List<CareMessage> _history = <CareMessage>[];
  Future<String>? _sessionFuture;

  @override
  String get mode => 'hosted';

  @override
  List<CareMessage> get history => List<CareMessage>.unmodifiable(_history);

  @override
  Future<CareMessage> send(String input, FamilyMember member) async {
    final String text = input.trim();
    if (text.isEmpty) throw const CareAgentException('message must not be empty');
    final String token = _accessToken();
    final String sessionId = await _ensureSession(token);
    final String replyText = stream
        ? await _streamTurn(token, sessionId, text, member)
        : await _completeTurn(token, sessionId, text, member);
    if (replyText.trim().isEmpty) {
      throw const CareAgentException('agent turn produced no assistant_output content');
    }
    final TriageResult triage = resolveReplyTriage(text, replyText);
    _history.add(CareMessage(role: 'user', text: text, level: triage.level));
    final CareMessage reply = CareMessage(
      role: 'assistant',
      text: _composeReply(triage, replyText, member),
      level: triage.level,
    );
    _history.add(reply);
    return reply;
  }

  String _accessToken() {
    final String token = (_getAccessToken() ?? '').trim();
    if (token.isEmpty) {
      throw const CareAgentException('hosted agents transport requires an appbase IAM access token');
    }
    return token;
  }

  String get _sessionsPath =>
      '$kAgentsApiPrefix/ai/agents/${Uri.encodeComponent(agentId)}/sessions';

  String _turnPath(String sessionId) => '$_sessionsPath/${Uri.encodeComponent(sessionId)}/turns';

  Future<String> _ensureSession(String token) {
    return _sessionFuture ??= _createSession(token);
  }

  Future<String> _createSession(String token) async {
    final String payloadHash = careSessionPayloadHash(_sessionTitle, entrySurface);
    final Map<String, Object?> body = <String, Object?>{
      'sessionKind': 'assistant',
      'entrySurface': entrySurface,
      'title': _sessionTitle,
      'idempotencyKey': _createId(),
      'payloadHash': payloadHash,
      'requestedAt': _now().toUtc().toIso8601String(),
    };
    final _HttpResult result = await _post(_sessionsPath, body, token);
    if (result.status < 200 || result.status >= 300) throw _problem(result);
    final Map<String, dynamic> item = _envelopeItem(result.body);
    final Object? sessionId = item['sessionId'];
    if (sessionId is! String || sessionId.isEmpty) {
      throw const CareAgentException('agents API session response is missing sessionId');
    }
    return sessionId;
  }

  Map<String, Object?> _turnBody(String content, FamilyMember member) {
    final String requestId = _createId();
    return <String, Object?>{
      'content': content,
      'contentType': 'text/plain',
      'turnMode': 'interactive',
      'systemPrompt': systemPromptBuilder(member),
      'idempotencyKey': requestId,
      'payloadHash': careTurnPayloadHash(content, 'text/plain', entrySurface),
      'clientRequestId': requestId,
      'requestedAt': _now().toUtc().toIso8601String(),
    };
  }

  Future<String> _completeTurn(String token, String sessionId, String content, FamilyMember member) async {
    final _HttpResult result = await _post('${_turnPath(sessionId)}?stream=false', _turnBody(content, member), token);
    if (result.status < 200 || result.status >= 300) throw _problem(result);
    final Map<String, dynamic> item = _envelopeItem(result.body);
    return _answerText(item);
  }

  Future<String> _streamTurn(String token, String sessionId, String content, FamilyMember member) async {
    final Uri uri = Uri.parse('$_baseUrl${_turnPath(sessionId)}?stream=true&event_protocol=kernel-v1');
    final HttpClientRequest request = await _client.postUrl(uri);
    request.headers.contentType = ContentType.json;
    request.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    request.write(jsonEncode(_turnBody(content, member)));
    final HttpClientResponse response = await request.close();
    final String raw = await response.transform(utf8.decoder).join();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _problem(_HttpResult(response.statusCode, raw));
    }
    Map<String, dynamic>? completion;
    for (final String line in const LineSplitter().convert(raw)) {
      if (!line.startsWith('data:')) continue;
      final String payload = line.substring(5).trim();
      if (payload.isEmpty) continue;
      final dynamic frame = jsonDecode(payload);
      if (frame is! Map<String, dynamic>) continue;
      if (frame['eventType'] == 'delta' && frame['delta'] is String) {
        onDelta?.call(frame['delta'] as String);
      } else if (frame['eventType'] == 'error') {
        throw CareAgentException('agents turn stream failed', status: 502);
      } else if (frame['eventType'] == 'completion' && frame['response'] is Map<String, dynamic>) {
        completion = frame['response'] as Map<String, dynamic>;
      }
    }
    if (completion == null) throw const CareAgentException('agents turn stream ended without a completion frame');
    if (completion['code'] != 0) {
      throw const CareAgentException('agents turn completion did not carry success code 0');
    }
    final dynamic data = completion['data'];
    if (data is! Map<String, dynamic> || data['item'] is! Map<String, dynamic>) {
      throw const CareAgentException('agents API response is missing data.item');
    }
    return _answerText(data['item'] as Map<String, dynamic>);
  }

  Future<_HttpResult> _post(String path, Map<String, Object?> body, String token) async {
    final HttpClientRequest request = await _client.postUrl(Uri.parse('$_baseUrl$path'));
    request.headers.contentType = ContentType.json;
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    request.write(jsonEncode(body));
    final HttpClientResponse response = await request.close();
    final String text = await response.transform(utf8.decoder).join();
    return _HttpResult(response.statusCode, text);
  }

  Map<String, dynamic> _envelopeItem(String text) {
    final dynamic decoded = jsonDecode(text);
    if (decoded is! Map<String, dynamic>) throw const CareAgentException('agents API response is not an object');
    if (decoded['code'] != 0) {
      throw const CareAgentException('agents API response did not carry success code 0');
    }
    if (decoded['traceId'] is! String || (decoded['traceId'] as String).isEmpty) {
      throw const CareAgentException('agents API response is missing traceId');
    }
    final dynamic data = decoded['data'];
    if (data is! Map<String, dynamic> || data['item'] is! Map<String, dynamic>) {
      throw const CareAgentException('agents API response is missing data.item');
    }
    return data['item'] as Map<String, dynamic>;
  }

  String _answerText(Map<String, dynamic> item) {
    final dynamic turn = item['turn'];
    if (turn is Map<String, dynamic>) {
      final Object? status = turn['status'];
      if (status == 'failed' || status == 'cancelled') {
        throw CareAgentException(
          (turn['errorDetail'] as String?) ?? (turn['errorCode'] as String?) ?? 'agent turn failed',
          code: turn['errorCode'],
          traceId: turn['traceId'] as String?,
        );
      }
    }
    final dynamic items = item['items'];
    if (items is! List<dynamic>) throw const CareAgentException('agents API turn response is missing items');
    final List<String> parts = <String>[];
    for (final dynamic raw in items) {
      if (raw is! Map<String, dynamic>) continue;
      if (raw['kind'] != 'assistant_output') continue;
      final Object? content = raw['content'];
      if (content is String && content.trim().isNotEmpty) parts.add(content.trim());
    }
    return parts.join('\n');
  }

  CareAgentException _problem(_HttpResult result) {
    try {
      final dynamic decoded = jsonDecode(result.body);
      if (decoded is Map<String, dynamic>) {
        final Object? detail = decoded['detail'] ?? decoded['title'];
        return CareAgentException(
          detail is String ? detail : 'agents API responded with HTTP ${result.status}',
          status: result.status,
          code: decoded['code'],
          traceId: decoded['traceId'] as String?,
        );
      }
    } on FormatException {
      // Fall through to the status-only error.
    }
    return CareAgentException('agents API responded with HTTP ${result.status}', status: result.status);
  }
}

/// Selects the transport explicitly; the UI displays whichever mode this returns.
String resolveCareAgentMode({required String agentsApiBaseUrl, required bool hasAccessToken}) {
  if (agentsApiBaseUrl.trim().isEmpty) return 'offline';
  if (!hasAccessToken) return 'offline';
  return 'hosted';
}

/// Builds the conversation runtime for the Flutter surface.
CareAgent createCareAgent({
  required String agentsApiBaseUrl,
  required String? Function() getAccessToken,
  String entrySurface = 'flutter',
}) {
  final String mode = resolveCareAgentMode(
    agentsApiBaseUrl: agentsApiBaseUrl,
    hasAccessToken: (getAccessToken() ?? '').trim().isNotEmpty,
  );
  if (mode == 'offline') return OfflineCareAgent();
  return HostedCareAgent(agentsApiBaseUrl: agentsApiBaseUrl, getAccessToken: getAccessToken, entrySurface: entrySurface);
}

class _HttpResult {
  const _HttpResult(this.status, this.body);
  final int status;
  final String body;
}

String _uuidV4() {
  final Random secure = Random.secure();
  final List<int> bytes = List<int>.generate(16, (_) => secure.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final String hex = bytes.map((int b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20)}';
}
