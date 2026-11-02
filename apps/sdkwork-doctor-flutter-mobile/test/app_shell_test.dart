import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/main.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/visit_store.dart';

/// Widget-level evidence that the four care tabs render and that a consultation
/// is recorded by the chat tab and shown by the records tab.
Future<VisitRecordStore> pumpApp(WidgetTester tester, {String locale = 'zh-CN'}) async {
  final VisitRecordStore records = VisitRecordStore.memory();
  await tester.pumpWidget(DoctorApp(records: records, initialLocale: locale));
  await tester.pumpAndSettle();
  return records;
}

void main() {
  testWidgets('renders the four care tabs from the generated catalog', (WidgetTester tester) async {
    await pumpApp(tester);

    expect(find.text('SDKWork Doctor'), findsOneWidget);
    expect(find.text(careText('zh-CN', 'platform.care.nav.chat')), findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.doctor.title')), findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.nav.records')), findsWidgets);
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

  testWidgets('a consultation is recorded and listed on the records tab', (WidgetTester tester) async {
    final VisitRecordStore records = await pumpApp(tester);
    expect(records.isEmpty, isTrue);

    await tester.enterText(find.byType(TextField), 'chest pain for 10 minutes');
    await tester.tap(find.text(careText('zh-CN', 'platform.care.chat.send')));
    await tester.pumpAndSettle();

    expect(records.records.length, 1);
    final VisitRecord record = records.records.first;
    expect(record.symptom, 'chest pain for 10 minutes');
    expect(record.level.name, 'emergency');
    expect(record.mode, 'offline');
    expect(record.memberLabel, contains('Me'));

    await tester.tap(find.text(careText('zh-CN', 'platform.care.nav.records')).last);
    await tester.pumpAndSettle();

    expect(
      find.text(careText('zh-CN', 'platform.care.records.count', params: <String, String>{'count': '1'})),
      findsOneWidget,
    );
    expect(find.text('chest pain for 10 minutes'), findsWidgets);
  });

  testWidgets('the records tab is empty before any consultation', (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.text(careText('zh-CN', 'platform.care.nav.records')).last);
    await tester.pumpAndSettle();

    expect(find.text(careText('zh-CN', 'platform.care.records.empty')), findsOneWidget);
  });

  testWidgets('the English locale renders the same tabs', (WidgetTester tester) async {
    await pumpApp(tester, locale: 'en-US');

    expect(find.text(careText('en-US', 'platform.care.nav.chat')), findsWidgets);
    expect(find.text(careText('en-US', 'platform.care.nav.records')), findsWidgets);
    expect(find.text(careText('en-US', 'platform.care.chat.title')), findsOneWidget);
  });
}
