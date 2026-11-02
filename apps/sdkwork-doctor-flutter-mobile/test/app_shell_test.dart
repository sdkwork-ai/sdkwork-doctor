import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_directory.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_selection.dart';
import 'package:sdkwork_doctor_flutter_mobile/family.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/main.dart';
import 'package:sdkwork_doctor_flutter_mobile/patients/patient_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/visit_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/care_shell.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/care_widgets.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/chat_tab.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/doctor_tab.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/me_tab.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/patient_form_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/records_screen.dart';

const String _zh = 'zh-CN';

String _t(String key, {Map<String, String> params = const <String, String>{}}) =>
    careText(_zh, key, params: params);

/// Widget-level evidence that the shell renders exactly three care
/// destinations, that 医生 lists the fallback roster and selects a family
/// doctor, that 我的 owns patient files and pushes 看病记录, and that every
/// consultation is recorded against the active patient.
class Harness {
  const Harness({
    required this.records,
    required this.patients,
    required this.doctors,
  });

  final VisitRecordStore records;
  final PatientProfileStore patients;
  final DoctorSelectionStore doctors;
}

Future<Harness> pumpApp(
  WidgetTester tester, {
  String locale = _zh,
  VisitRecordStore? records,
  PatientProfileStore? patients,
  DoctorSelectionStore? doctors,
}) async {
  tester.view.physicalSize = const Size(1200, 3200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  final VisitRecordStore recordStore = records ?? VisitRecordStore.memory();
  final PatientProfileStore patientStore =
      patients ?? PatientProfileStore.memory();
  final DoctorSelectionStore doctorStore =
      doctors ?? DoctorSelectionStore.memory();
  await tester.pumpWidget(DoctorApp(
    records: recordStore,
    patients: patientStore,
    doctors: doctorStore,
    directory: DoctorDirectory(directoryUrl: ''),
    initialLocale: locale,
  ));
  await tester.pumpAndSettle();
  return Harness(
    records: recordStore,
    patients: patientStore,
    doctors: doctorStore,
  );
}

Finder inChat(Finder matching) =>
    find.descendant(of: find.byType(ChatTab), matching: matching);

Finder inDoctor(Finder matching) =>
    find.descendant(of: find.byType(DoctorTab), matching: matching);

Finder inMe(Finder matching) =>
    find.descendant(of: find.byType(MeTab), matching: matching);

const List<String> _tabLabelKeys = <String>[
  'platform.care.nav.chat',
  'platform.care.nav.doctor',
  'platform.care.nav.me',
];

Future<void> openTab(WidgetTester tester, int index,
    {String locale = _zh}) async {
  await tester.tap(find.descendant(
    of: find.byType(NavigationBar),
    matching: find.text(careText(locale, _tabLabelKeys[index])),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the shell renders exactly three destinations', (WidgetTester tester) async {
    await pumpApp(tester);

    final List<NavigationDestination> destinations = tester
        .widgetList<NavigationDestination>(find.byType(NavigationDestination))
        .toList();
    expect(destinations, hasLength(3));
    expect(
      destinations
          .map((NavigationDestination destination) => destination.label)
          .toList(),
      <String>[
        _t('platform.care.nav.chat'),
        _t('platform.care.nav.doctor'),
        _t('platform.care.nav.me'),
      ],
    );
    expect((destinations[0].icon as Icon).icon, Icons.chat_bubble_outline);
    expect((destinations[0].selectedIcon as Icon).icon, Icons.chat_bubble);
    expect((destinations[1].icon as Icon).icon,
        Icons.medical_information_outlined);
    expect((destinations[1].selectedIcon as Icon).icon,
        Icons.medical_information);
    expect((destinations[2].icon as Icon).icon, Icons.person_outline);
    expect((destinations[2].selectedIcon as Icon).icon, Icons.person);
    expect(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text(_t('platform.care.nav.records')),
      ),
      findsNothing,
      reason: 'visit records are a pushed screen, not a destination',
    );
  });

  testWidgets('the navbar keeps the drawer button, centered title, and plus action',
      (WidgetTester tester) async {
    await pumpApp(tester);

    expect(find.byTooltip(_t('platform.care.nav.menu')), findsOneWidget);
    expect(
      find.byTooltip(_t('platform.care.action.newConsultation')),
      findsOneWidget,
    );
    expect(
      find.widgetWithText(AppBar, _t('platform.care.nav.chat')),
      findsOneWidget,
    );
  });

  testWidgets('the drawer lists the same three destinations and the active mode',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip(_t('platform.care.nav.menu')));
    await tester.pumpAndSettle();

    final Finder drawer = find.byType(CareDrawer);
    expect(find.text('SDKWork Doctor'), findsOneWidget);
    expect(
      find.descendant(
          of: drawer, matching: find.text(_t('platform.care.mode.offline'))),
      findsOneWidget,
    );
    expect(
      find.descendant(
          of: drawer, matching: find.text(_t('platform.care.nav.records'))),
      findsNothing,
    );

    await tester.tap(
        find.descendant(of: drawer, matching: find.text(_t('platform.care.nav.me'))));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, _t('platform.care.me.title')),
        findsOneWidget);
  });

  testWidgets('the chat landing suggests symptoms and prefills the composer',
      (WidgetTester tester) async {
    await pumpApp(tester);

    expect(inChat(find.text(_t('platform.care.home.prompt'))), findsOneWidget);
    final String suggestion = _t('platform.care.suggest.chestPain');
    await tester.tap(inChat(find.text(suggestion)));
    await tester.pumpAndSettle();

    final TextField composer =
        tester.widget<TextField>(inChat(find.byType(TextField)));
    expect(composer.controller?.text, suggestion);
  });

  testWidgets('a chat exchange is recorded against the active patient',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    expect(harness.patients.activeId, 'member-self');

    await tester.enterText(
        inChat(find.byType(TextField)), 'chest pain for 10 minutes');
    await tester.tap(inChat(find.text(_t('platform.care.chat.send'))));
    await tester.pumpAndSettle();

    expect(harness.records.records, hasLength(1));
    final VisitRecord record = harness.records.records.first;
    expect(record.symptom, 'chest pain for 10 minutes');
    expect(record.memberId, 'member-self');
    expect(record.memberLabel, 'Me (self)');
    expect(record.mode, 'offline');
    expect(record.level, TriageLevel.emergency);
    expect(record.toJson().containsKey('doctorId'), isFalse);
  });

  testWidgets('switching the active patient switches who the chat records',
      (WidgetTester tester) async {
    final PatientProfileStore patients = PatientProfileStore.memory();
    final PatientProfile added = await patients.add(const PatientProfileInput(
      displayName: 'Xiaoman',
      relation: PatientRelation.child,
      birthYear: 2019,
      sex: PatientSex.female,
    ));
    final Harness harness = await pumpApp(tester, patients: patients);

    await tester.tap(inChat(find.text(carePatientLabel(_zh, added))));
    await tester.pumpAndSettle();
    expect(harness.patients.activeId, added.id);

    await tester.enterText(inChat(find.byType(TextField)), 'fever since last night');
    await tester.tap(inChat(find.text(_t('platform.care.chat.send'))));
    await tester.pumpAndSettle();

    expect(harness.records.records.single.memberId, added.id);
    expect(harness.records.records.single.memberLabel, 'Xiaoman (child)');
  });

  testWidgets('with no patient file the chat cannot send and links to 我的',
      (WidgetTester tester) async {
    final PatientProfileStore patients =
        PatientProfileStore.memory(profiles: <PatientProfile>[]);
    await pumpApp(tester, patients: patients);

    expect(inChat(find.text(_t('platform.care.chat.noPatient'))), findsOneWidget);
    final TextField composer =
        tester.widget<TextField>(inChat(find.byType(TextField)));
    expect(composer.enabled, isFalse, reason: 'sending is disabled');
    final FilledButton send = tester.widget<FilledButton>(
        inChat(find.widgetWithText(FilledButton, _t('platform.care.chat.send'))));
    expect(send.onPressed, isNull);

    await tester.tap(
        inChat(find.widgetWithText(TextButton, _t('platform.care.nav.me'))));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, _t('platform.care.me.title')),
        findsOneWidget);
  });

  testWidgets('医生 lists the fallback roster and selecting one makes it primary',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 1);

    expect(inDoctor(find.text(_t('platform.care.doctors.title'))), findsOneWidget);
    expect(inDoctor(find.text(_t('platform.care.doctors.source.catalog'))),
        findsOneWidget);
    for (final DoctorProfile doctor in kCatalogDoctorRoster.doctors) {
      expect(inDoctor(find.text(doctor.displayName)), findsOneWidget,
          reason: doctor.id);
    }
    expect(inDoctor(find.text(_t('platform.care.doctors.none'))), findsOneWidget);
    expect(
      inDoctor(find.text(_t('platform.care.doctors.employment.full_time'))),
      findsWidgets,
      reason: 'the full-time engagement badge is shown',
    );
    expect(
      inDoctor(find.text(_t('platform.care.doctors.employment.part_time'))),
      findsWidgets,
      reason: 'the part-time engagement badge is shown',
    );
    expect(
      inDoctor(find.text(_t('platform.care.doctors.otherAffiliations',
          params: <String, String>{'count': '1'}))),
      findsOneWidget,
      reason: 'the multi-site doctor advertises the second site',
    );

    await tester.tap(
        inDoctor(find.text(_t('platform.care.doctors.select'))).first);
    await tester.pumpAndSettle();

    expect(harness.doctors.primaryId, 'doctor-lin-qinghe');
    expect(harness.doctors.selectedIds, <String>['doctor-lin-qinghe']);
    expect(inDoctor(find.text(_t('platform.care.doctors.primary'))), findsWidgets);
    expect(
      inDoctor(find.text(_t('platform.care.doctors.selected'))),
      findsWidgets,
    );
  });

  testWidgets('a human consultation records the reason against the active patient',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 1);

    await tester.tap(
        inDoctor(find.text(_t('platform.care.doctors.detail'))).first);
    await tester.pumpAndSettle();
    await tester.enterText(
      inDoctor(find.byType(TextField)).first,
      'chest tightness after dinner',
    );
    await tester.tap(inDoctor(find.text(_t('platform.care.doctors.consult'))));
    await tester.pumpAndSettle();

    expect(harness.records.records, hasLength(1));
    final VisitRecord record = harness.records.records.first;
    expect(record.mode, 'human');
    expect(record.level, TriageLevel.routine);
    expect(record.doctorId, 'doctor-lin-qinghe');
    expect(record.doctorLabel, 'Lin Qinghe · Cardiology');
    expect(record.doctorOrganizationId, 'org-sdkwork-care-network');
    expect(record.doctorHospitalLabel, 'SDKWork Care Network');
    expect(record.doctorEmploymentType, 'full_time');
    expect(record.memberId, 'member-self');
    expect(record.symptom, 'chest tightness after dinner');
    expect(
      record.advice,
      _t('platform.care.doctors.consultStarted',
          params: <String, String>{'doctor': 'Lin Qinghe'}),
    );
    expect(inDoctor(find.text(record.advice)), findsOneWidget,
        reason: 'the started consultation is confirmed on screen');

    final VisitRecord? reloaded = VisitRecord.fromJson(record.toJson());
    expect(reloaded, isNotNull);
    expect(reloaded!.doctorId, 'doctor-lin-qinghe');
    expect(reloaded.doctorLabel, 'Lin Qinghe · Cardiology');
    expect(reloaded.doctorOrganizationId, 'org-sdkwork-care-network');
    expect(reloaded.doctorEmploymentType, 'full_time');
  });

  testWidgets('choosing a practice site routes the consultation to that site',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 1);

    await tester.tap(
        inDoctor(find.text(_t('platform.care.doctors.detail'))).first);
    await tester.pumpAndSettle();

    final Finder siteChoices = inDoctor(find.widgetWithText(
        ChoiceChip, _t('platform.care.doctors.chooseAffiliation')));
    expect(siteChoices, findsNWidgets(2),
        reason: 'the multi-site doctor lists both practice sites');

    await tester.tap(siteChoices.at(1));
    await tester.pumpAndSettle();
    expect(
      inDoctor(find.text(_t('platform.care.doctors.employment.part_time'))),
      findsWidgets,
      reason: 'the chosen site is the part-time engagement',
    );

    await tester.enterText(
      inDoctor(find.byType(TextField)).first,
      'blood-pressure follow-up',
    );
    await tester.tap(inDoctor(find.text(_t('platform.care.doctors.consult'))));
    await tester.pumpAndSettle();

    final VisitRecord record = harness.records.records.single;
    expect(record.mode, 'human');
    expect(record.doctorOrganizationId, 'org-sdkwork-community-clinic');
    expect(record.doctorHospitalLabel, 'SDKWork Community Clinic');
    expect(record.doctorEmploymentType, 'part_time');
    expect(record.doctorLabel, 'Lin Qinghe · General practice');
  });

  testWidgets('我的 owns the patient files and pushes 看病记录', (WidgetTester tester) async {
    final List<VisitRecord> initial = <VisitRecord>[
      createVisitRecord(
        member: demoSelfMember,
        symptom: 'chest pain for 10 minutes',
        advice: 'Call local emergency services now.',
        level: TriageLevel.emergency,
        mode: 'offline',
        id: 'visit-1',
        recordedAt: DateTime.utc(2026, 11, 2, 13, 30),
      ),
    ];
    final VisitRecordStore records = VisitRecordStore.memory(initial);
    await pumpApp(tester, records: records);
    await openTab(tester, 2);

    expect(inMe(find.text('Me')), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.active'))), findsOneWidget);
    expect(
      inMe(find.text(_t('platform.care.profile.completeness',
          params: <String, String>{'percent': '17'}))),
      findsOneWidget,
    );
    expect(
      inMe(find.text(_t('platform.care.me.recordsCount',
          params: <String, String>{'count': '1'}))),
      findsOneWidget,
    );

    await tester.tap(inMe(find.text(_t('platform.care.me.records'))));
    await tester.pumpAndSettle();

    expect(find.byType(RecordsScreen), findsOneWidget);
    expect(find.text('chest pain for 10 minutes'), findsOneWidget);
    expect(find.byTooltip(_t('platform.care.records.back')), findsOneWidget);

    await tester.tap(find.byTooltip(_t('platform.care.records.back')));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, _t('platform.care.me.title')),
        findsOneWidget);
  });

  testWidgets('看病记录 clears every record after confirmation',
      (WidgetTester tester) async {
    final VisitRecordStore records = VisitRecordStore.memory(<VisitRecord>[
      createVisitRecord(
        member: demoSelfMember,
        symptom: 'dizzy for two days',
        advice: 'Monitor for 24-48 hours.',
        level: TriageLevel.routine,
        mode: 'offline',
        id: 'visit-1',
        recordedAt: DateTime.utc(2026, 11, 2, 13, 30),
      ),
    ]);
    await pumpApp(tester, records: records);
    await openTab(tester, 2);
    await tester.tap(inMe(find.text(_t('platform.care.me.records'))));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(
        FilledButton, _t('platform.care.records.clear')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
      of: find.byType(AlertDialog),
      matching: find.text(_t('platform.care.records.clear')),
    ));
    await tester.pumpAndSettle();

    expect(records.isEmpty, isTrue);
    expect(find.text(_t('platform.care.records.empty')), findsOneWidget);
  });

  testWidgets('creating a patient file from 我的 adds and shows it',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 2);

    await tester.tap(inMe(find.text(_t('platform.care.profile.add'))));
    await tester.pumpAndSettle();
    expect(find.byType(PatientEditorScreen), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'Xiaoman');
    await tester.tap(find.text(_t('platform.care.profile.relation.child')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(1), '2019');
    await tester.enterText(find.byType(TextField).at(3), 'penicillin, peanut');
    await tester.tap(find.text(_t('platform.care.profile.save')));
    await tester.pumpAndSettle();

    expect(harness.patients.profiles, hasLength(2));
    final PatientProfile added = harness.patients.profiles.last;
    expect(added.displayName, 'Xiaoman');
    expect(added.relation, PatientRelation.child);
    expect(added.birthYear, 2019);
    expect(added.allergies, <String>['penicillin', 'peanut']);
    expect(find.widgetWithText(AppBar, _t('platform.care.me.title')),
        findsOneWidget);
    expect(inMe(find.text('Xiaoman')), findsOneWidget);
  });

  testWidgets('the patient editor reports a missing name and a bad birth year',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 2);
    await tester.tap(inMe(find.text(_t('platform.care.profile.add'))));
    await tester.pumpAndSettle();

    await tester.tap(find.text(_t('platform.care.profile.save')));
    await tester.pumpAndSettle();
    expect(find.text(_t('platform.care.profile.required.name')), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'Xiaoman');
    await tester.enterText(find.byType(TextField).at(1), '1899');
    await tester.tap(find.text(_t('platform.care.profile.save')));
    await tester.pumpAndSettle();
    expect(
        find.text(_t('platform.care.profile.invalid.birthYear')), findsOneWidget);
    expect(find.byType(PatientEditorScreen), findsOneWidget);
  });

  testWidgets('deleting a patient file asks first and then removes it',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 2);

    await tester.tap(inMe(find.text(_t('platform.care.profile.delete'))).first);
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
      of: find.byType(AlertDialog),
      matching:
          find.widgetWithText(FilledButton, _t('platform.care.profile.delete')),
    ));
    await tester.pumpAndSettle();

    expect(harness.patients.profiles, isEmpty);
    expect(inMe(find.text(_t('platform.care.profile.empty'))), findsOneWidget);
    expect(harness.patients.active, isNull);
  });

  testWidgets('switching the active patient from 我的 updates the household',
      (WidgetTester tester) async {
    final PatientProfileStore patients = PatientProfileStore.memory();
    final PatientProfile added = await patients.add(const PatientProfileInput(
      displayName: 'Xiaoman',
      relation: PatientRelation.child,
      birthYear: 2019,
      sex: PatientSex.female,
    ));
    final Harness harness = await pumpApp(tester, patients: patients);
    await openTab(tester, 2);

    await tester.tap(inMe(find.text(_t('platform.care.profile.select'))).first);
    await tester.pumpAndSettle();

    expect(harness.patients.activeId, added.id);
    expect(inMe(find.text('Xiaoman')), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.active'))), findsOneWidget,
        reason: 'exactly one patient file carries the active badge');
  });

  testWidgets('the me tab reports the conversation mode and the privacy line',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 2);

    expect(inMe(find.text(_t('platform.care.me.mode'))), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.mode.offline'))), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.privacy.local'))), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.me.device'))), findsOneWidget);
  });

  testWidgets('the plus sheet starts a new consultation and keeps records',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);

    await tester.enterText(
        inChat(find.byType(TextField)), 'chest pain for 10 minutes');
    await tester.tap(inChat(find.text(_t('platform.care.chat.send'))));
    await tester.pumpAndSettle();
    expect(harness.records.records, hasLength(1));

    await tester
        .tap(find.byTooltip(_t('platform.care.action.newConsultation')));
    await tester.pumpAndSettle();
    await tester.tap(find
        .widgetWithText(
            FilledButton, _t('platform.care.action.newConsultation')));
    await tester.pumpAndSettle();

    expect(inChat(find.text('chest pain for 10 minutes')), findsNothing);
    expect(inChat(find.text(_t('platform.care.home.prompt'))), findsOneWidget);
    expect(harness.records.records, hasLength(1),
        reason: 'visit records survive a new consultation');
  });

  testWidgets('the plus sheet opens 看病记录 as a pushed screen',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester
        .tap(find.byTooltip(_t('platform.care.action.newConsultation')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(
        FilledButton, _t('platform.care.records.title')));
    await tester.pumpAndSettle();

    expect(find.byType(RecordsScreen), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing,
        reason: 'the pushed records screen has no bottom navigation');
  });

  testWidgets('看病记录 shows the site and engagement of a human consultation',
      (WidgetTester tester) async {
    final VisitRecordStore records = VisitRecordStore.memory(<VisitRecord>[
      createHumanVisitRecord(
        member: demoSelfMember,
        reason: 'blood-pressure follow-up',
        advice: 'Human consultation requested with Lin Qinghe.',
        doctorId: 'doctor-lin-qinghe',
        doctorLabel: 'Lin Qinghe · Cardiology',
        doctorOrganizationId: 'org-sdkwork-care-network',
        doctorHospitalLabel: 'SDKWork Care Network',
        doctorEmploymentType: 'full_time',
        id: 'visit-human',
        recordedAt: DateTime.utc(2026, 11, 2, 13, 30),
      ),
    ]);
    await pumpApp(tester, records: records);
    await openTab(tester, 2);
    await tester.tap(inMe(find.text(_t('platform.care.me.records'))));
    await tester.pumpAndSettle();

    expect(
      find.textContaining(_t('platform.care.records.hospital')),
      findsOneWidget,
    );
    expect(
      find.textContaining('SDKWork Care Network'),
      findsOneWidget,
    );
    expect(
      find.textContaining(_t('platform.care.records.employment')),
      findsOneWidget,
    );
    expect(
      find.textContaining(_t('platform.care.doctors.employment.full_time')),
      findsOneWidget,
    );
  });

  testWidgets('an emergency message escalates with guidance first',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.enterText(
        inChat(find.byType(TextField)), 'chest pain for 10 minutes');
    await tester.tap(inChat(find.text(_t('platform.care.chat.send'))));
    await tester.pumpAndSettle();

    final List<String> texts = tester
        .widgetList<Text>(find.byType(Text))
        .map((Text text) => text.data ?? '')
        .toList();
    expect(
      texts.any((String value) =>
          value.contains('Call local emergency services now.')),
      isTrue,
      reason: 'emergency guidance must lead the reply',
    );
    expect(inChat(find.text(_t('platform.care.level.emergency'))), findsWidgets);
  });

  testWidgets('the English locale renders the same three destinations',
      (WidgetTester tester) async {
    await pumpApp(tester, locale: 'en-US');

    final List<NavigationDestination> destinations = tester
        .widgetList<NavigationDestination>(find.byType(NavigationDestination))
        .toList();
    expect(
      destinations
          .map((NavigationDestination destination) => destination.label)
          .toList(),
      <String>[
        careText('en-US', 'platform.care.nav.chat'),
        careText('en-US', 'platform.care.nav.doctor'),
        careText('en-US', 'platform.care.nav.me'),
      ],
    );
    expect(find.text(careText('en-US', 'platform.care.home.prompt')),
        findsOneWidget);
  });
}
