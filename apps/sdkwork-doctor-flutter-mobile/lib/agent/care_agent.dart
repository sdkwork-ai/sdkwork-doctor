/// Family-doctor runtime binding for the Flutter care surface.
///
/// Transport lives in `sdkwork_doctor_flutter_mobile_care`; the localized care
/// copy lives in `triage_copy.dart`; this file owns the product binding: the
/// managed agent id, the family-doctor system prompt, and the construction of
/// the generated Agents app SDK client the bootstrap injects. No HTTP is issued
/// here (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` section 6).
library;

import 'package:sdkwork_agents_app_sdk/sdkwork_agents_app_sdk.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

import '../family.dart';
import '../triage.dart';
import '../triage_copy.dart';

/// Product binding: the managed sdkwork-agents agent that plays the family doctor.
const String kFamilyDoctorAgentId = 'agent.family-doctor';

/// Gateway surface prefix of the sdkwork-agents app API.
const String kAgentsApiPrefix = '/app/v3/api';

/// System prompt that turns a generic agent into this family's private doctor.
///
/// The prompt is model-facing and stays English in every locale: it describes
/// the clinical safety contract, not UI copy. The answer itself is produced in
/// the language the user writes in.
String buildFamilyDoctorSystemPrompt(FamilyMember member) {
  final String allergies =
      member.allergies.isEmpty ? 'none recorded' : member.allergies.join(', ');
  final String conditions = member.chronicConditions.isEmpty
      ? 'none recorded'
      : member.chronicConditions.join(', ');
  final String medications = member.medications.isEmpty
      ? 'none recorded'
      : member.medications.join(', ');
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
  final String normalized =
      agentsApiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
  if (normalized.isEmpty) {
    throw const CareConversationException('agentsApiBaseUrl must not be empty');
  }
  final bool hasSuffix = normalized.endsWith(kAgentsApiPrefix);
  if (normalized.contains(kAgentsApiPrefix) && !hasSuffix) {
    throw const CareConversationException(
      'agentsApiBaseUrl must be a gateway root or end with $kAgentsApiPrefix',
    );
  }
  if (!hasSuffix) return normalized;
  return normalized.substring(0, normalized.length - kAgentsApiPrefix.length);
}

/// Transport root the generated SDK expects: the gateway root without the
/// `/app/v3/api` suffix, because the SDK appends that prefix to every path.
String resolveCareAgentsTransportBaseUrl(String agentsApiBaseUrl) =>
    resolveCareAgentsBaseUrl(agentsApiBaseUrl);

/// Signs care writes with the fingerprint every Doctor client shares.
class DoctorCarePayloadSigner implements CarePayloadSigner {
  const DoctorCarePayloadSigner();

  @override
  String sessionPayloadHash(String title, String entrySurface) =>
      careSessionPayloadHash(title, entrySurface);

  @override
  String turnPayloadHash(
          String content, String contentType, String entrySurface) =>
      careTurnPayloadHash(content, contentType, entrySurface);
}

/// Builds the conversation service for this surface.
///
/// The generated SDK client is constructed here, once, so every care call shares
/// one credential policy and the HTTPS trust layer installed by `main()`.
///
/// [locale] is read at answer time, so the offline triage answer follows a
/// language switch without rebuilding the service.
CareConversationService createCareConversationService({
  required String agentsApiBaseUrl,
  required String? Function() getAccessToken,
  required String Function() locale,
  required String localSessionTitle,
}) {
  final String token = (getAccessToken() ?? '').trim();
  final String mode = resolveCareConversationMode(
    agentsApiBaseUrl: agentsApiBaseUrl,
    hasAccessToken: token.isNotEmpty,
  );
  if (mode == 'offline') {
    return LocalCareConversationService(
      storage: const SharedPreferencesCareConversationStorage(),
      offlineResponder: (String content) =>
          buildOfflineAnswer(locale(), triageSymptoms(content).level),
      defaultTitle: localSessionTitle,
    );
  }
  final SdkworkAppClient client = SdkworkAppClient.withBaseUrl(
    baseUrl: resolveCareAgentsTransportBaseUrl(agentsApiBaseUrl),
    accessToken: token,
    timeout: 60000,
  );
  return AgentsCareConversationService(
    client: client,
    agentId: kFamilyDoctorAgentId,
    signer: const DoctorCarePayloadSigner(),
  );
}
