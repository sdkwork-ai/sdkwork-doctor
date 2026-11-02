import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';

void main() {
  test('emergency red flag escalates', () {
    final TriageResult result = triageSymptoms('chest pain since 10 minutes');
    expect(result.level, TriageLevel.emergency);
    expect(result.actions.first, contains('emergency'));
  });

  test('routine symptom stays routine', () {
    expect(triageSymptoms('mild headache').level, TriageLevel.routine);
  });

  test('empty input asks for detail', () {
    expect(triageSymptoms('   ').level, TriageLevel.selfCare);
  });
}
