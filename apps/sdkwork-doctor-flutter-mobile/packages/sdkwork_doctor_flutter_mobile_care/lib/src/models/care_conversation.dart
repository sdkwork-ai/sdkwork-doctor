/// Conversation domain models for the Doctor care surface.
///
/// The durable vocabulary follows `AGENTS_DOMAIN_SPEC.md`: one rendered
/// conversation is an `AgentSession` and each transcript row is an
/// `AgentSessionItem`. UI copy may say "message"; the resources keep the Agents
/// vocabulary so the Flutter root reads the same sessions the PC, H5, and mini
/// program roots read.
library;

import 'dart:convert';

/// Which kind of doctor owns a conversation.
///
/// The family-doctor app talks to its AI family doctor by default; a
/// conversation a deployment routes to a human clinician carries [human] so
/// every surface states who the transcript belongs to.
enum CareSessionDoctorKind { ai, human }

/// The doctor a conversation belongs to.
///
/// The drawer prints this identity on every session row, so a family can tell
/// an AI-doctor conversation from a human-doctor one and read the human
/// doctor's name and department without opening it. An AI session keeps
/// [displayName] empty and the UI renders the localized "AI family doctor" copy
/// from the care catalog; a human session carries the published name.
class CareConversationDoctor {
  const CareConversationDoctor({
    required this.kind,
    this.id = '',
    this.displayName = '',
    this.department = '',
  });

  /// The AI family doctor that owns the conversation.
  const CareConversationDoctor.ai({this.id = ''})
      : kind = CareSessionDoctorKind.ai,
        displayName = '',
        department = '';

  /// A human clinician recorded on the conversation.
  const CareConversationDoctor.human({
    required this.id,
    required this.displayName,
    this.department = '',
  }) : kind = CareSessionDoctorKind.human;

  /// Whether the conversation is with the AI or a human doctor.
  final CareSessionDoctorKind kind;

  /// Stable id: the managed agent id for an AI session, or the roster doctor id
  /// for a human session. Empty when the transport does not publish one.
  final String id;

  /// Published human doctor name; empty for an AI session, whose name comes
  /// from the care catalog.
  final String displayName;

  /// Practice department printed next to a human doctor's name; empty when the
  /// session does not carry one.
  final String department;

  /// True when this conversation belongs to the AI family doctor.
  bool get isAi => kind == CareSessionDoctorKind.ai;

  /// True when this conversation belongs to a human doctor.
  bool get isHuman => kind == CareSessionDoctorKind.human;

  /// Serializes the attribution inside the on-device session document.
  Map<String, Object?> toJson() => <String, Object?>{
        'kind': kind.name,
        'id': id,
        'displayName': displayName,
        'department': department,
      };

  /// Parses one persisted attribution; null when the kind is missing or not one
  /// this build knows, so a caller falls back instead of showing an empty row.
  static CareConversationDoctor? fromJson(Object? value) {
    if (value is! Map) return null;
    final CareSessionDoctorKind? kind = switch (value['kind']?.toString()) {
      'ai' => CareSessionDoctorKind.ai,
      'human' => CareSessionDoctorKind.human,
      _ => null,
    };
    if (kind == null) return null;
    return CareConversationDoctor(
      kind: kind,
      id: _doctorText(value['id'], 120),
      displayName: _doctorText(value['displayName'], 120),
      department: _doctorText(value['department'], 120),
    );
  }
}

String _doctorText(Object? value, int maxLength) {
  if (value is! String) return '';
  final String text = value.trim();
  return text.length > maxLength ? text.substring(0, maxLength) : text;
}

/// Lifecycle of a conversation row.
///
/// An AI conversation is always open until a new one is started. A human
/// consultation is ended explicitly by the family once the doctor has answered.
enum CareConversationStatus { active, ended }

/// One conversation in the care agent's session list.
class CareConversationSession {
  const CareConversationSession({
    required this.id,
    required this.title,
    required this.updatedAt,
    this.doctor = const CareConversationDoctor.ai(),
    this.memberLabel = '',
    this.startedAt,
    this.status = CareConversationStatus.active,
    this.endedAt,
    this.unreadCount = 0,
    this.preview = '',
  });

  /// Agents `sessionId` for an AI conversation, or the local consultation id.
  final String id;

  /// Session title as stored by the service. Empty means the surface renders
  /// its own "untitled" copy.
  final String title;

  /// Last update timestamp, used to order the list newest first.
  final DateTime updatedAt;

  /// Doctor this conversation belongs to. A transport that does not attribute
  /// its sessions keeps the AI family doctor.
  final CareConversationDoctor doctor;

  /// Patient the human consultation is for; empty on an AI conversation.
  final String memberLabel;

  /// When the human consultation was opened; null on an AI conversation.
  final DateTime? startedAt;

  /// Whether the conversation still accepts turns.
  final CareConversationStatus status;

  /// When the human consultation was ended.
  final DateTime? endedAt;

  /// Doctor replies the family has not opened yet. Always zero on an AI row.
  final int unreadCount;

  /// Last turn preview, used by the row without loading the transcript.
  final String preview;

  bool get hasTitle => title.trim().isNotEmpty;

  /// True when this conversation belongs to a human doctor.
  bool get isHuman => doctor.isHuman;

  /// True when the conversation still accepts turns.
  bool get isActive => status == CareConversationStatus.active;

  /// When the visit started, falling back to the last update for an AI row.
  DateTime get startedAtOrUpdated => startedAt ?? updatedAt;

  /// Doctor the family is waiting on: the last turn is the patient's own.
  bool get awaitingDoctor =>
      isHuman && isActive && preview.startsWith(kCarePatientPreviewPrefix);

  /// Copy with the given fields replaced, keeping the doctor attribution when
  /// the caller only changes the title or the timestamp.
  CareConversationSession copyWith({
    String? id,
    String? title,
    DateTime? updatedAt,
    CareConversationDoctor? doctor,
    String? memberLabel,
    DateTime? startedAt,
    CareConversationStatus? status,
    DateTime? endedAt,
    int? unreadCount,
    String? preview,
  }) =>
      CareConversationSession(
        id: id ?? this.id,
        title: title ?? this.title,
        updatedAt: updatedAt ?? this.updatedAt,
        doctor: doctor ?? this.doctor,
        memberLabel: memberLabel ?? this.memberLabel,
        startedAt: startedAt ?? this.startedAt,
        status: status ?? this.status,
        endedAt: endedAt ?? this.endedAt,
        unreadCount: unreadCount ?? this.unreadCount,
        preview: preview ?? this.preview,
      );

  /// Serializes one human consultation row for the on-device document.
  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'title': title,
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'doctor': doctor.toJson(),
        'memberLabel': memberLabel,
        'startedAt': startedAt?.toUtc().toIso8601String(),
        'status': status.name,
        'endedAt': endedAt?.toUtc().toIso8601String(),
        'unreadCount': unreadCount,
        'preview': preview,
      };

  /// Parses one persisted consultation; null when the row cannot be used.
  static CareConversationSession? fromJson(Object? value) {
    if (value is! Map) return null;
    final String id = value['id']?.toString().trim() ?? '';
    if (id.isEmpty) return null;
    final DateTime? updatedAt =
        DateTime.tryParse(value['updatedAt']?.toString() ?? '');
    if (updatedAt == null) return null;
    final CareConversationDoctor? doctor =
        CareConversationDoctor.fromJson(value['doctor']);
    final String status = value['status']?.toString() ?? 'active';
    final int unread = value['unreadCount'] is num
        ? (value['unreadCount'] as num).toInt().clamp(0, 999)
        : 0;
    return CareConversationSession(
      id: id,
      title: value['title']?.toString() ?? '',
      updatedAt: updatedAt,
      doctor: doctor ?? const CareConversationDoctor.ai(),
      memberLabel: value['memberLabel']?.toString() ?? '',
      startedAt: DateTime.tryParse(value['startedAt']?.toString() ?? ''),
      status: status == 'ended'
          ? CareConversationStatus.ended
          : CareConversationStatus.active,
      endedAt: DateTime.tryParse(value['endedAt']?.toString() ?? ''),
      unreadCount: unread,
      preview: value['preview']?.toString() ?? '',
    );
  }
}

/// Prefix the controller puts on a stored preview whose last turn is the
/// patient's own, so a row can say "waiting for the doctor" without loading the
/// transcript. It never reaches the visible text.
const String kCarePatientPreviewPrefix = '\u0001p:';

/// Prefix of a preview whose last turn is the doctor's reply.
const String kCareDoctorPreviewPrefix = '\u0001d:';

/// Visible text of a stored preview.
String carePreviewText(String preview) => preview.length > 3 &&
        (preview.startsWith(kCarePatientPreviewPrefix) ||
            preview.startsWith(kCareDoctorPreviewPrefix))
    ? preview.substring(3)
    : preview;

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

  Map<String, Object?> toJson() => <String, Object?>{
        'id': id,
        'isUser': isUser,
        'text': text,
        'createdAt': createdAt?.toUtc().toIso8601String(),
      };

  static CareConversationMessage? fromJson(Object? value) {
    if (value is! Map) return null;
    final String id = value['id']?.toString() ?? '';
    final String text = value['text']?.toString() ?? '';
    if (id.isEmpty || text.isEmpty) return null;
    return CareConversationMessage(
      id: id,
      isUser: value['isUser'] == true,
      text: text,
      createdAt: DateTime.tryParse(value['createdAt']?.toString() ?? ''),
    );
  }
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

/// One turn handed to the summarizer when the patient ends a conversation.
class CareSummaryTurn {
  const CareSummaryTurn({required this.isUser, required this.text});

  final bool isUser;
  final String text;
}

/// Everything the agent needs to write the 病历: the transcript, the patient
/// facts already sent with the conversation, and the attachment names.
class CareSummaryInput {
  const CareSummaryInput({
    required this.sessionId,
    required this.patientLabel,
    required this.patientFacts,
    required this.transcript,
    this.attachmentNames = const <String>[],
    required this.startedAt,
    required this.endedAt,
  });

  final String sessionId;
  final String patientLabel;
  final String patientFacts;
  final List<CareSummaryTurn> transcript;
  final List<String> attachmentNames;
  final DateTime startedAt;
  final DateTime endedAt;

  /// Highest triage level of the patient's own turns (see `triage.dart`).
  String get patientText => transcript
      .where((CareSummaryTurn turn) => turn.isUser)
      .map((CareSummaryTurn turn) => turn.text)
      .join('\n');
}

/// The AI's tentative diagnostic direction; never final on its own.
class CareDiagnosisDraft {
  const CareDiagnosisDraft({
    required this.impression,
    this.conditions = const <String>[],
    this.recommendations = const <String>[],
    required this.level,
    this.notes,
  });

  final String impression;
  final List<String> conditions;
  final List<String> recommendations;

  /// `emergency`, `urgent`, `routine`, or `self-care`.
  final String level;
  final String? notes;
}

/// The agent's summary plus its draft diagnosis for the reviewing doctor.
class CareSummaryDraft {
  const CareSummaryDraft({
    required this.summary,
    required this.source,
    required this.diagnosis,
  });

  final String summary;

  /// `hosted` or `offline`.
  final String source;
  final CareDiagnosisDraft diagnosis;
}

/// Model-facing instruction for the case-record turn; English in every locale.
const String kCareSummarySystemPrompt =
    'You write the case record of a family-doctor conversation for the attending human doctor to review. '
    'Return exactly one JSON object and nothing else, with these keys: '
    '{"summary": string, "impression": string, "conditions": string[], "recommendations": string[], "level": "emergency" | "urgent" | "routine" | "self-care"}. '
    'The impression is a tentative diagnostic direction, never a certainty; the human doctor confirms or corrects it. '
    'Keep every string in the language the patient used.';

/// Renders the summarization request sent as one agent turn.
String buildCareSummaryRequest(CareSummaryInput input) {
  final List<String> lines = <String>[
    'Patient: ${input.patientLabel}.',
    if (input.patientFacts.trim().isNotEmpty) input.patientFacts.trim(),
    input.attachmentNames.isEmpty
        ? 'Attachments: none.'
        : 'Attachments: ${input.attachmentNames.join(', ')}.',
    'Conversation:',
    for (final CareSummaryTurn turn in input.transcript)
      '${turn.isUser ? 'Patient' : 'Doctor'}: ${turn.text}',
  ];
  return lines.join('\n');
}

String _jsonCandidate(String raw) {
  String value = raw.trim();
  final RegExp fence = RegExp(r'^```(?:json)?\s*([\s\S]*?)\s*```$');
  final RegExpMatch? match = fence.firstMatch(value);
  if (match != null) value = (match.group(1) ?? '').trim();
  final int start = value.indexOf('{');
  final int end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  return value.substring(start, end + 1);
}

List<String> _summaryList(Object? value) {
  if (value is! List) return const <String>[];
  final List<String> result = <String>[];
  for (final Object? entry in value) {
    final String text = entry is String ? entry.trim() : '';
    if (text.isNotEmpty && !result.contains(text)) result.add(text);
  }
  return result;
}

/// Parses the agent's JSON answer; null means the turn did not honor the contract.
CareSummaryDraft? parseCareSummaryReply(String raw) {
  final String candidate = _jsonCandidate(raw);
  if (candidate.isEmpty) return null;
  Object? decoded;
  try {
    decoded = jsonDecode(candidate);
  } on FormatException {
    return null;
  }
  if (decoded is! Map) return null;
  final String summary = decoded['summary']?.toString().trim() ?? '';
  final String impression = decoded['impression']?.toString().trim() ?? '';
  final String level = decoded['level']?.toString() ?? '';
  if (summary.isEmpty || impression.isEmpty) return null;
  if (!const <String>['emergency', 'urgent', 'routine', 'self-care']
      .contains(level)) {
    return null;
  }
  final String notes = decoded['notes']?.toString().trim() ?? '';
  return CareSummaryDraft(
    summary: summary,
    source: 'hosted',
    diagnosis: CareDiagnosisDraft(
      impression: impression,
      conditions: _summaryList(decoded['conditions']),
      recommendations: _summaryList(decoded['recommendations']),
      level: level,
      notes: notes.isEmpty ? null : notes,
    ),
  );
}
