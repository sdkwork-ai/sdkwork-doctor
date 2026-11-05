/// Conversation → 病历 for the Flutter surface.
///
/// The patient ends the conversation: the hosted agent writes the summary and a
/// tentative AI diagnosis; with no deployment, the deterministic on-device
/// summary states plainly that a doctor must assess the patient. In both cases
/// the AI diagnosis is a draft until the attending doctor confirms it.
library;

import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../family.dart';
import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../records/medical_record_store.dart';
import '../triage.dart';
import '../triage_copy.dart';

const Map<TriageLevel, int> _rank = <TriageLevel, int>{
  TriageLevel.selfCare: 0,
  TriageLevel.routine: 1,
  TriageLevel.urgent: 2,
  TriageLevel.emergency: 3,
};

String careLevelName(TriageLevel level) {
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

TriageLevel? careLevelFromName(String? name) {
  switch (name) {
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

/// Highest triage level across the patient's own turns.
TriageLevel careTranscriptLevel(CareSummaryInput input) {
  TriageLevel level = TriageLevel.selfCare;
  for (final CareSummaryTurn turn in input.transcript) {
    if (!turn.isUser) continue;
    final TriageLevel candidate = triageSymptoms(turn.text).level;
    if (_rank[candidate]! > _rank[level]!) level = candidate;
  }
  return level;
}

/// The deterministic on-device summary; never invents a diagnosis.
CareSummaryDraft buildOfflineCareSummary(
    String locale, CareSummaryInput input) {
  final List<CareSummaryTurn> patientTurns = input.transcript
      .where(
          (CareSummaryTurn turn) => turn.isUser && turn.text.trim().isNotEmpty)
      .toList(growable: false);
  final TriageLevel level = careTranscriptLevel(input);
  String complaint = patientTurns.isEmpty ? '' : patientTurns.first.text.trim();
  if (complaint.length > 120) complaint = '${complaint.substring(0, 117)}...';
  final String none = careText(locale, 'platform.care.value.none');
  final String levelLabel =
      careText(locale, 'platform.care.level.${careLevelName(level)}');
  final String summary = careText(
    locale,
    'platform.care.medical.summaryOffline',
    params: <String, String>{
      'count': '${patientTurns.length}',
      'complaint': complaint.isEmpty ? none : complaint,
      'level': levelLabel,
    },
  );
  final String impression = careText(
    locale,
    'platform.care.medical.offlineImpression',
    params: <String, String>{'complaint': complaint.isEmpty ? none : complaint},
  );
  return CareSummaryDraft(
    summary: summary,
    source: 'offline',
    diagnosis: CareDiagnosisDraft(
      impression: impression,
      conditions: <String>[
        careText(locale, 'platform.care.medical.offlineCondition')
      ],
      recommendations: careTriageActions(locale, level),
      level: careLevelName(level),
    ),
  );
}

/// Applies the deterministic triage floor to the agent's level.
CareSummaryDraft clampCareSummary(
    CareSummaryInput input, CareSummaryDraft draft) {
  final TriageLevel floor = careTranscriptLevel(input);
  final TriageLevel model =
      careLevelFromName(draft.diagnosis.level) ?? TriageLevel.routine;
  final TriageLevel level = _rank[model]! >= _rank[floor]! ? model : floor;
  if (level == model) return draft;
  return CareSummaryDraft(
    summary: draft.summary,
    source: draft.source,
    diagnosis: CareDiagnosisDraft(
      impression: draft.diagnosis.impression,
      conditions: draft.diagnosis.conditions,
      recommendations: draft.diagnosis.recommendations,
      level: careLevelName(level),
      notes: draft.diagnosis.notes,
    ),
  );
}

/// Asks the agent for the summary when the transport supports it; otherwise
/// builds the deterministic offline draft.
Future<CareSummaryDraft> summarizeCareConversation({
  required String locale,
  required CareConversationService service,
  required CareSummaryInput input,
}) async {
  final CareSummaryService? summaryService =
      service is CareSummaryService ? service as CareSummaryService : null;
  if (summaryService != null) {
    final CareSummaryDraft draft = await summaryService.summarize(input);
    return clampCareSummary(input, draft);
  }
  return buildOfflineCareSummary(locale, input);
}

/// Builds the 病历 from a completed summary and the conversation it summarized.
MedicalRecord buildMedicalRecord({
  required PatientProfile patient,
  required CareSummaryInput input,
  required CareSummaryDraft draft,
  required String mode,
  required List<CareConversationMessage> messages,
  required List<MedicalAttachment> attachments,
}) {
  final DateTime endedAt = input.endedAt;
  return MedicalRecord(
    id: 'case-${DateTime.now().microsecondsSinceEpoch}',
    sessionId: input.sessionId,
    memberId: patient.id,
    memberLabel: '${patient.displayName} (${patient.relation.name})',
    mode: mode,
    startedAt: input.startedAt.toUtc().toIso8601String(),
    endedAt: endedAt.toUtc().toIso8601String(),
    summary: draft.summary,
    transcript: <MedicalTranscriptEntry>[
      for (int index = 0; index < messages.length; index += 1)
        MedicalTranscriptEntry(
          id: messages[index].id,
          role: messages[index].isUser ? 'patient' : 'assistant',
          text: messages[index].text,
          at: (messages[index].createdAt ?? endedAt).toUtc().toIso8601String(),
          level: messages[index].isUser
              ? triageSymptoms(messages[index].text).level
              : null,
        ),
    ],
    attachments: attachments,
    aiDiagnosis: createAiDiagnosis(
      id: 'ai-${DateTime.now().microsecondsSinceEpoch}',
      impression: draft.diagnosis.impression,
      conditions: draft.diagnosis.conditions,
      recommendations: draft.diagnosis.recommendations,
      level: careLevelFromName(draft.diagnosis.level) ?? TriageLevel.routine,
      createdAt: endedAt,
      notes: draft.diagnosis.notes,
    ),
    status: 'awaiting_doctor',
  );
}

/// Patient facts sent with every turn, reused in the summarization request.
String carePatientFacts(PatientProfile patient) {
  final FamilyMember member = FamilyMember.fromPatient(patient);
  final String allergies =
      member.allergies.isEmpty ? 'none recorded' : member.allergies.join(', ');
  final String conditions = member.chronicConditions.isEmpty
      ? 'none recorded'
      : member.chronicConditions.join(', ');
  final String medications = member.medications.isEmpty
      ? 'none recorded'
      : member.medications.join(', ');
  return 'Known allergies: $allergies. Chronic conditions: $conditions. '
      'Current medications: $medications.';
}
