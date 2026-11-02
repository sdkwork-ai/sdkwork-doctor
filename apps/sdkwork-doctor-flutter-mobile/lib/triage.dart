/// Emergency-first triage shared in shape with @sdkwork/doctor-common-doctor.
enum TriageLevel { emergency, urgent, routine, selfCare }

class TriageResult {
  const TriageResult(this.level, this.reason, this.actions);
  final TriageLevel level;
  final String reason;
  final List<String> actions;
  bool get escalate => level == TriageLevel.emergency || level == TriageLevel.urgent;
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
    return const TriageResult(TriageLevel.selfCare, 'No symptom text.', <String>['Describe the symptom, onset, and severity.']);
  }
  if (_emergency.any((RegExp p) => p.hasMatch(value))) {
    return const TriageResult(TriageLevel.emergency, 'Emergency red flag detected.', <String>[
      'Call local emergency services now.',
      'Do not drive yourself.',
    ]);
  }
  return const TriageResult(TriageLevel.routine, 'No red flag detected.', <String>[
    'Monitor for 24-48 hours.',
    'Book a routine consultation if symptoms persist.',
  ]);
}
