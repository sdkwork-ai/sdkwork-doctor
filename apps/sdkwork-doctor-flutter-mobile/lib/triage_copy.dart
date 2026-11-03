/// Localized care copy for triage, escalation, and the offline answer.
///
/// The level vocabulary lives in `triage.dart`; every user-facing word comes
/// from the shared care catalog, so the Flutter surface says what the PC, H5,
/// and mini program roots say in both locales.
library;

import 'family.dart';
import 'i18n/care_i18n.dart';
import 'triage.dart';

/// Actions of one triage level, in the active locale.
List<String> careTriageActions(String locale, TriageLevel level) {
  switch (level) {
    case TriageLevel.emergency:
      return <String>[
        careText(locale, 'platform.care.triage.action.emergency.call'),
        careText(locale, 'platform.care.triage.action.emergency.doNotDrive'),
        careText(locale, 'platform.care.triage.action.emergency.stay'),
      ];
    case TriageLevel.urgent:
      return <String>[
        careText(locale, 'platform.care.triage.action.urgent.contact'),
        careText(locale, 'platform.care.triage.action.urgent.record'),
        careText(locale, 'platform.care.triage.action.urgent.seek'),
      ];
    case TriageLevel.routine:
      return <String>[
        careText(locale, 'platform.care.triage.action.routine.monitor'),
        careText(locale, 'platform.care.triage.action.routine.book'),
      ];
    case TriageLevel.selfCare:
      return <String>[
        careText(locale, 'platform.care.triage.action.self-care.describe'),
      ];
  }
}

String careSafetyLine(String locale) =>
    careText(locale, 'platform.care.chat.safetyLine');

String careEmergencyLead(String locale) =>
    careText(locale, 'platform.care.chat.emergencyLead');

String careNoRedFlag(String locale) =>
    careText(locale, 'platform.care.chat.noRedFlag');

String careDescribePrompt(String locale) =>
    careText(locale, 'platform.care.triage.reply.describePrompt');

String careWhoSelf(String locale) =>
    careText(locale, 'platform.care.triage.whoSelf');

String careEmergencyLeadFor(String locale, String who) =>
    careText(locale, 'platform.care.triage.lead.emergencyFor',
        params: <String, String>{'who': who});

String careUrgentLeadFor(String locale, String who) =>
    careText(locale, 'platform.care.triage.lead.urgentFor',
        params: <String, String>{'who': who});

/// Pronoun or name used inside an escalation sentence.
String careWhoLabel(String locale, FamilyMember member) =>
    member.displayName == 'Me' ? careWhoSelf(locale) : member.displayName;

/// Offline answer: the level's own actions plus the safety line.
///
/// Offline answers already carry their own actions and safety line; adding the
/// escalation lead here would duplicate them (the TypeScript clients behave the
/// same way).
String buildOfflineAnswer(String locale, TriageLevel level) {
  final String safety = careSafetyLine(locale);
  if (level == TriageLevel.emergency) {
    return '${careTriageActions(locale, level).join(' ')} $safety';
  }
  if (level == TriageLevel.routine) {
    return '${careNoRedFlag(locale)} '
        '${careTriageActions(locale, level).join(' ')} $safety';
  }
  return '${careDescribePrompt(locale)} $safety';
}

/// Hosted answer: escalation guidance leads, the agent's words are preserved.
String composeCareReply(
  String locale,
  TriageLevel level,
  String replyText,
  FamilyMember member,
) {
  final String who = careWhoLabel(locale, member);
  final String safety = careSafetyLine(locale);
  final String lead = level == TriageLevel.emergency
      ? careEmergencyLead(locale)
      : level == TriageLevel.urgent
          ? '${careUrgentLeadFor(locale, who)} '
              '${careTriageActions(locale, level).join(' ')}'
          : '';
  final String body =
      replyText.contains(safety) ? replyText : '$replyText $safety';
  return lead.isEmpty ? body : '$lead $body';
}
