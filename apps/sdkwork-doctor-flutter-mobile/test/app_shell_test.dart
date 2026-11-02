import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/main.dart';

/// Widget-level evidence that the three care tabs render and that the chat tab
/// answers through the composed agent port (offline adapter in tests).
Future<void> pumpApp(WidgetTester tester, {String locale = 'zh-CN'}) async {
  await tester.pumpWidget(DoctorApp(initialLocale: locale));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('renders the three care tabs from the generated catalog', (WidgetTester tester) async {
    await pumpApp(tester);

    expect(find.text('SDKWork Doctor'), findsOneWidget);
    expect(find.text(careText('zh-CN', 'platform.care.nav.chat')), findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.doctor.title')), findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.me.title')), findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.chat.title')), findsOneWidget);
  });

  testWidgets('switching to the doctor tab shows the household record', (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.text(careText('zh-CN', 'platform.care.doctor.title')).last);
    await tester.pumpAndSettle();

    expect(find.text(careText('zh-CN', 'platform.care.fact.allergies')), findsOneWidget);
    expect(find.text(careText('zh-CN', 'platform.care.doctor.actions')), findsOneWidget);
  });

  testWidgets('the me tab reports the conversation mode that answers', (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.text(careText('zh-CN', 'platform.care.me.title')).last);
    await tester.pumpAndSettle();

    expect(find.text(careText('zh-CN', 'platform.care.me.mode')), findsOneWidget);
    expect(find.text(careText('zh-CN', 'platform.care.mode.offline')), findsOneWidget);
  });

  testWidgets('an emergency message escalates with guidance first', (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.enterText(find.byType(TextField), 'chest pain for 10 minutes');
    await tester.tap(find.text(careText('zh-CN', 'platform.care.chat.send')));
    await tester.pumpAndSettle();

    final List<String> texts = tester
        .widgetList<Text>(find.byType(Text))
        .map((Text text) => text.data ?? '')
        .toList();
    final bool hasEmergencyGuidance =
        texts.any((String value) => value.contains('Call local emergency services now.'));
    expect(hasEmergencyGuidance, isTrue, reason: 'emergency guidance must lead the reply');
    expect(find.text(careText('zh-CN', 'platform.care.level.emergency')), findsWidgets);
  });

  testWidgets('the English locale renders the same tabs', (WidgetTester tester) async {
    await pumpApp(tester, locale: 'en-US');

    expect(find.text(careText('en-US', 'platform.care.nav.chat')), findsWidgets);
    expect(find.text(careText('en-US', 'platform.care.chat.title')), findsOneWidget);
  });
}
