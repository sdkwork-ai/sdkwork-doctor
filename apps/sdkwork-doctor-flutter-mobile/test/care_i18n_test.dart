import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_messages.dart';

/// Guards the generated Dart catalog against drift from the authored contract.
void main() {
  final File contractFile = File(
    '../sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/care-messages.json',
  );

  Map<String, dynamic> contract() =>
      jsonDecode(contractFile.readAsStringSync()) as Map<String, dynamic>;

  test('the Dart catalog ships exactly the authored locales', () {
    final Map<String, dynamic> source = contract();
    expect(careLocales, source['locales']);
  });

  test('every authored key resolves to the authored Dart value in both locales',
      () {
    final Map<String, dynamic> source = contract();
    final List<dynamic> messages = source['messages'] as List<dynamic>;
    expect(messages.length, greaterThan(30));
    for (final dynamic raw in messages) {
      final Map<String, dynamic> message = raw as Map<String, dynamic>;
      final String key = message['key'] as String;
      for (final dynamic locale in source['locales'] as List<dynamic>) {
        expect(
          careMessages[locale]![key],
          message[locale as String],
          reason: '$locale/$key',
        );
      }
    }
  });

  test('the Dart catalog ships no extra key', () {
    final Map<String, dynamic> source = contract();
    final Set<String> authored = (source['messages'] as List<dynamic>)
        .map((dynamic raw) => (raw as Map<String, dynamic>)['key'] as String)
        .toSet();
    for (final String locale in careLocales) {
      expect(careKeys(locale), authored, reason: locale);
    }
  });

  test('placeholders survive both projections', () {
    final RegExp placeholder = RegExp(r'\{\{([a-zA-Z0-9_]+)\}\}');
    final Map<String, dynamic> source = contract();
    for (final dynamic raw in source['messages'] as List<dynamic>) {
      final Map<String, dynamic> message = raw as Map<String, dynamic>;
      final String key = message['key'] as String;
      final Set<String> expected = placeholder
          .allMatches(message['en-US'] as String)
          .map((RegExpMatch match) => match.group(1)!)
          .toSet();
      for (final String locale in careLocales) {
        final Set<String> actual = placeholder
            .allMatches(careMessages[locale]![key]!)
            .map((RegExpMatch match) => match.group(1)!)
            .toSet();
        expect(actual, expected, reason: '$locale/$key');
      }
    }
  });

  test('careText interpolates and falls back', () {
    expect(
      careText('zh-CN', 'platform.care.chat.subtitle',
          params: <String, String>{'member': '妈妈'}),
      contains('妈妈'),
    );
    expect(careText('de-DE', 'platform.care.chat.send'), 'Send');
    expect(resolveCareLocale('zh-Hans-CN'), 'zh-CN');
    expect(resolveCareLocale('en-GB'), 'en-US');
    expect(resolveCareLocale(null), 'en-US');
  });
}
