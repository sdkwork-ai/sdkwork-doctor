/// One care conversation turn, shared by the chat tab and voice-call mode.
///
/// The text transport, the hosted reply policy, and the visit-record contract
/// live here once so a spoken turn and a typed turn produce the same transcript
/// entry, the same triage level, and the same 看病记录 row.
library;

import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../agent/care_agent.dart';
import '../family.dart';
import '../patients/patient_store.dart';
import '../records/visit_store.dart';
import '../triage.dart';
import '../triage_copy.dart';

/// Sends [text] for [patient] and records the completed exchange.
///
/// Returns the assistant reply, or `null` when the send did not complete. The
/// caller owns clearing its draft and surfacing `conversations.error`.
Future<String?> sendCareExchange({
  required String locale,
  required CareConversationsController conversations,
  required VisitRecordStore records,
  required PatientProfile patient,
  required String text,
}) async {
  final String content = text.trim();
  if (content.isEmpty) {
    return null;
  }
  final FamilyMember member = FamilyMember.fromPatient(patient);
  final String? reply = await conversations.send(
    content,
    systemPrompt: buildFamilyDoctorSystemPrompt(member),
    // The offline transport already answers with its own actions and safety
    // line; only the hosted answer needs the care reply policy applied.
    decorate: conversations.mode == 'hosted'
        ? (String raw) => composeCareReply(
            locale, resolveReplyLevel(content, raw), raw, member)
        : null,
  );
  if (reply == null) {
    return null;
  }
  await records.add(createVisitRecord(
    member: member,
    symptom: content,
    advice: reply,
    level: resolveReplyLevel(content, reply),
    mode: conversations.mode,
  ));
  return reply;
}
