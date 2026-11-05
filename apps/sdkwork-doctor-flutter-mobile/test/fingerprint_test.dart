import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/agent/fingerprint.dart';

/// The vectors are authored once and frozen; TypeScript, Dart, and the mini
/// program must all reproduce them.
void main() {
  final File vectorsFile = File(
    '../sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/care-fingerprint-vectors.json',
  );

  test('the frozen contract is present', () {
    expect(vectorsFile.existsSync(), isTrue);
    final Map<String, dynamic> vectors =
        jsonDecode(vectorsFile.readAsStringSync()) as Map<String, dynamic>;
    expect(vectors['kind'], 'sdkwork.doctor.care-fingerprint-vectors');
    expect(vectors['prefix'], 'care.v1:');
  });

  test('every turn payload hash matches the frozen vector', () {
    final Map<String, dynamic> vectors =
        jsonDecode(vectorsFile.readAsStringSync()) as Map<String, dynamic>;
    final List<dynamic> turns = vectors['turns'] as List<dynamic>;
    expect(turns.length, greaterThanOrEqualTo(4));
    for (final dynamic raw in turns) {
      final Map<String, dynamic> vector = raw as Map<String, dynamic>;
      expect(
        careTurnPayloadHash(
          vector['content'] as String,
          vector['contentType'] as String,
          vector['entrySurface'] as String,
        ),
        vector['turnPayloadHash'],
        reason: vector['content'] as String,
      );
    }
  });

  test('every session payload hash matches the frozen vector', () {
    final Map<String, dynamic> vectors =
        jsonDecode(vectorsFile.readAsStringSync()) as Map<String, dynamic>;
    final List<dynamic> sessions = vectors['sessions'] as List<dynamic>;
    expect(sessions, isNotEmpty);
    for (final dynamic raw in sessions) {
      final Map<String, dynamic> vector = raw as Map<String, dynamic>;
      expect(
        careSessionPayloadHash(
            vector['title'] as String, vector['entrySurface'] as String),
        vector['sessionPayloadHash'],
      );
    }
  });

  test('the digest is deterministic and content-bound', () {
    final String first =
        careTurnPayloadHash('chest pain', 'text/plain', 'flutter');
    expect(careTurnPayloadHash('chest pain', 'text/plain', 'flutter'), first);
    expect(careTurnPayloadHash('chest pains', 'text/plain', 'flutter'),
        isNot(first));
    expect(first, matches(RegExp(r'^care\.v1:[0-9a-f]{32}$')));
  });
}
