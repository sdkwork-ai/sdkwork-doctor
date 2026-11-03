import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage_copy.dart';

void main() {
  test('emergency red flag escalates', () {
    final TriageResult result = triageSymptoms('chest pain since 10 minutes');
    expect(result.level, TriageLevel.emergency);
    expect(careTriageActions('en-US', result.level).first, contains('emergency'));
    expect(careTriageActions('zh-CN', result.level).first, contains('急救'));
  });

  test('routine symptom stays routine', () {
    expect(triageSymptoms('mild headache').level, TriageLevel.routine);
  });

  test('empty input asks for detail', () {
    expect(triageSymptoms('   ').level, TriageLevel.selfCare);
  });

  test('shared triage fixtures resolve to their expected level', () {
    final File fixtureFile = File(
      '../sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/triage-fixtures.json',
    );
    expect(fixtureFile.existsSync(), isTrue);
    final Map<String, dynamic> fixtures =
        jsonDecode(fixtureFile.readAsStringSync()) as Map<String, dynamic>;
    final List<dynamic> cases = fixtures['cases'] as List<dynamic>;
    expect(cases.length, greaterThanOrEqualTo(8));
    for (final dynamic raw in cases) {
      final Map<String, dynamic> item = raw as Map<String, dynamic>;
      expect(
        triageSymptoms(item['input'] as String).level.name.replaceAll('-', '').toLowerCase(),
        (item['level'] as String).replaceAll('-', '').toLowerCase(),
        reason: item['input'] as String,
      );
    }
  });
}
