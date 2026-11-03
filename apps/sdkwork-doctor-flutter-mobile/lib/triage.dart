/// Emergency-first triage shared in shape with @sdkwork/doctor-common-doctor.
///
/// This file owns the red-flag vocabulary and the level it produces; every word
/// a user reads comes from the care catalog through `triage_copy.dart`, so no
/// user-facing copy in any locale lives here.
enum TriageLevel { emergency, urgent, routine, selfCare }

class TriageResult {
  const TriageResult(this.level);

  final TriageLevel level;

  bool get escalate =>
      level == TriageLevel.emergency || level == TriageLevel.urgent;
}

final List<RegExp> _emergency = <RegExp>[
  RegExp('chest pain|\u80f8\u75db', caseSensitive: false),
  RegExp('cannot breathe|\u547c\u5438\u56f0\u96be', caseSensitive: false),
  RegExp('unconscious|\u660f\u8ff7', caseSensitive: false),
  RegExp(r'severe bleeding', caseSensitive: false),
  RegExp(r'slurred speech', caseSensitive: false),
];

TriageResult triageSymptoms(String text) {
  final String value = text.trim();
  if (value.isEmpty) {
    return const TriageResult(TriageLevel.selfCare);
  }
  if (_emergency.any((RegExp pattern) => pattern.hasMatch(value))) {
    return const TriageResult(TriageLevel.emergency);
  }
  return const TriageResult(TriageLevel.routine);
}

/// Rank used to promote, never downgrade, a triage level.
int triageRank(TriageLevel level) {
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

/// The user's text sets the floor; a red flag inside the hosted answer can only
/// raise it.
TriageLevel resolveReplyLevel(String userText, String replyText) {
  final TriageLevel fromUser = triageSymptoms(userText).level;
  final TriageLevel fromReply = triageSymptoms(replyText).level;
  return triageRank(fromReply) > triageRank(fromUser) ? fromReply : fromUser;
}
