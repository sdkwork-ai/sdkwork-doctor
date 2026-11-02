import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/main.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/visit_store.dart';

/// Widget-level evidence that the four care tabs render and that a consultation
/// is recorded by the chat tab and shown by the records tab.
Future<VisitRecordStore> pumpApp(WidgetTester tester,
    {String locale = 'zh-CN'}) async {
  final VisitRecordStore records = VisitRecordStore.memory();
  await tester.pumpWidget(DoctorApp(records: records, initialLocale: locale));
  await tester.pumpAndSettle();
  return records;
}

void main() {
  testWidgets('renders the four care tabs from the generated catalog',
      (WidgetTester tester) async {
    await pumpApp(tester);

    expect(
        find.text(careText('zh-CN', 'platform.care.nav.chat')), findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.doctor.title')),
        findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.nav.records')),
        findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.nav.me')), findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.home.prompt')),
        findsOneWidget);
  });

  testWidgets('bottom tabs pair outline and filled glyphs',
      (WidgetTester tester) async {
    await pumpApp(tester);

    final destinations = tester
        .widgetList<NavigationDestination>(find.byType(NavigationDestination))
        .toList();
    expect(destinations, hasLength(4));
    expect((destinations[0].icon as Icon).icon, Icons.chat_bubble_outline);
    expect((destinations[0].selectedIcon as Icon).icon, Icons.chat_bubble);
    expect((destinations[1].icon as Icon).icon,
        Icons.medical_information_outlined);
    expect(
        (destinations[1].selectedIcon as Icon).icon, Icons.medical_information);
    expect((destinations[2].icon as Icon).icon, Icons.receipt_long_outlined);
    expect((destinations[2].selectedIcon as Icon).icon, Icons.receipt_long);
    expect((destinations[3].icon as Icon).icon, Icons.person_outline);
    expect((destinations[3].selectedIcon as Icon).icon, Icons.person);
  });

  testWidgets(
      'the navbar has the drawer button, centered title, and plus action',
      (WidgetTester tester) async {
    await pumpApp(tester);

    expect(find.byTooltip(careText('zh-CN', 'platform.care.nav.menu')),
        findsOneWidget);
    expect(
        find.byTooltip(
            careText('zh-CN', 'platform.care.action.newConsultation')),
        findsOneWidget);
    expect(
        find.widgetWithText(
            AppBar, careText('zh-CN', 'platform.care.nav.chat')),
        findsOneWidget);
  });

  testWidgets('the drawer lists the blocks and the active mode',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester
        .tap(find.byTooltip(careText('zh-CN', 'platform.care.nav.menu')));
    await tester.pumpAndSettle();

    expect(find.text('SDKWork Doctor'), findsOneWidget);
    expect(find.text(careText('zh-CN', 'platform.care.mode.offline')),
        findsWidgets);
    expect(find.text(careText('zh-CN', 'platform.care.nav.records')),
        findsWidgets);

    await tester
        .tap(find.text(careText('zh-CN', 'platform.care.nav.records')).last);
    await tester.pumpAndSettle();
    expect(find.text(careText('zh-CN', 'platform.care.records.title')),
        findsWidgets);
  });

  testWidgets('the chat landing suggests symptoms and prefills the composer',
      (WidgetTester tester) async {
    await pumpApp(tester);

    expect(find.text(careText('zh-CN', 'platform.care.home.prompt')),
        findsOneWidget);
    final String suggestion =
        careText('zh-CN', 'platform.care.suggest.chestPain');
    await tester.tap(find.text(suggestion));
    await tester.pumpAndSettle();

    final TextField composer = tester.widget<TextField>(find.byType(TextField));
    expect(composer.controller?.text, suggestion);
  });

  testWidgets('the plus action starts a new consultation and keeps records',
      (WidgetTester tester) async {
    final VisitRecordStore records = await pumpApp(tester);

    await tester.enterText(find.byType(TextField), 'chest pain for 10 minutes');
    await tester.tap(find.text(careText('zh-CN', 'platform.care.chat.send')));
    await tester.pumpAndSettle();
    expect(find.text('chest pain for 10 minutes'), findsWidgets);
    expect(records.records.length, 1);

    await tester.tap(find
        .byTooltip(careText('zh-CN', 'platform.care.action.newConsultation')));
    await tester.pumpAndSettle();
    await tester.tap(find
        .text(careText('zh-CN', 'platform.care.action.newConsultation'))
        .last);
    await tester.pumpAndSettle();

    expect(find.text('chest pain for 10 minutes'), findsNothing);
    expect(find.text(careText('zh-CN', 'platform.care.home.prompt')),
        findsOneWidget);
    expect(records.records.length, 1,
        reason: 'visit records survive a new consultation');
  });

  testWidgets('switching to the doctor tab shows the household record',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester
        .tap(find.text(careText('zh-CN', 'platform.care.doctor.title')).last);
    await tester.pumpAndSettle();

    expect(find.text(careText('zh-CN', 'platform.care.fact.allergies')),
        findsOneWidget);
    expect(find.text(careText('zh-CN', 'platform.care.doctor.actions')),
        findsOneWidget);
  });

  testWidgets('the me tab reports the conversation mode that answers',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester
        .tap(find.text(careText('zh-CN', 'platform.care.me.title')).last);
    await tester.pumpAndSettle();

    expect(
        find.text(careText('zh-CN', 'platform.care.me.mode')), findsOneWidget);
    expect(find.text(careText('zh-CN', 'platform.care.mode.offline')),
        findsOneWidget);
  });

  testWidgets('an emergency message escalates with guidance first',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.enterText(find.byType(TextField), 'chest pain for 10 minutes');
    await tester.tap(find.text(careText('zh-CN', 'platform.care.chat.send')));
    await tester.pumpAndSettle();

    final List<String> texts = tester
        .widgetList<Text>(find.byType(Text))
        .map((Text text) => text.data ?? '')
        .toList();
    final bool hasEmergencyGuidance = texts.any(
        (String value) => value.contains('Call local emergency services now.'));
    expect(hasEmergencyGuidance, isTrue,
        reason: 'emergency guidance must lead the reply');
    expect(find.text(careText('zh-CN', 'platform.care.level.emergency')),
        findsWidgets);
  });

  testWidgets('a consultation is recorded and listed on the records tab',
      (WidgetTester tester) async {
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

    await tester
        .tap(find.text(careText('zh-CN', 'platform.care.nav.records')).last);
    await tester.pumpAndSettle();

    expect(
      find.text(careText('zh-CN', 'platform.care.records.count',
          params: <String, String>{'count': '1'})),
      findsOneWidget,
    );
    expect(find.text('chest pain for 10 minutes'), findsWidgets);
  });

  testWidgets('the records tab is empty before any consultation',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester
        .tap(find.text(careText('zh-CN', 'platform.care.nav.records')).last);
    await tester.pumpAndSettle();

    expect(find.text(careText('zh-CN', 'platform.care.records.empty')),
        findsOneWidget);
  });

  testWidgets('the English locale renders the same tabs',
      (WidgetTester tester) async {
    await pumpApp(tester, locale: 'en-US');

    expect(
        find.text(careText('en-US', 'platform.care.nav.chat')), findsWidgets);
    expect(find.text(careText('en-US', 'platform.care.nav.records')),
        findsWidgets);
    expect(find.text(careText('en-US', 'platform.care.home.prompt')),
        findsOneWidget);
  });
}
