import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_chat_composer_flutter/sdkwork_chat_composer_flutter.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';
import 'package:sdkwork_doctor_flutter_mobile/care/scan/care_qr_ports.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_directory.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_selection.dart';
import 'package:sdkwork_doctor_flutter_mobile/family.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/main.dart';
import 'package:sdkwork_doctor_flutter_mobile/patients/patient_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/care_session_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/medical_record_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/visit_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage_copy.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/care_shell.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/care_widgets.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/chat_tab.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/doctor_detail_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/doctor_search_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/doctor_tab.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/me_tab.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/patient_files_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/patient_form_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/record_detail_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/records_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/scan_screen.dart';

const String _zh = 'zh-CN';

/// Send control of the shared conversation composer.
const Key _composerSendKey = Key('sdkwork-chat-composer-send');

String _t(String key,
        {Map<String, String> params = const <String, String>{}}) =>
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
    required this.careSessions,
    required this.medicalRecords,
    required this.humanConsultations,
  });

  final VisitRecordStore records;
  final PatientProfileStore patients;
  final DoctorSelectionStore doctors;
  final CareSessionStore careSessions;
  final MedicalRecordStore medicalRecords;
  final CareHumanConsultationStore humanConsultations;
}

Future<Harness> pumpApp(
  WidgetTester tester, {
  String locale = _zh,
  VisitRecordStore? records,
  PatientProfileStore? patients,
  DoctorSelectionStore? doctors,
  CareSessionStore? careSessions,
  MedicalRecordStore? medicalRecords,
  CareConversationService? conversations,
  CareHumanConsultationStore? humanConsultations,
  CareQrScanEnvironment? scanEnvironment,
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
  final CareSessionStore sessionStore = careSessions ?? CareSessionStore.memory();
  final MedicalRecordStore medicalStore =
      medicalRecords ?? MedicalRecordStore.memory();
  final CareHumanConsultationStore humanStore =
      humanConsultations ?? CareHumanConsultationStore();
  await tester.pumpWidget(DoctorApp(
    records: recordStore,
    medicalRecords: medicalStore,
    careSessions: sessionStore,
    humanConsultations: humanStore,
    patients: patientStore,
    doctors: doctorStore,
    directory: DoctorDirectory(directoryUrl: ''),
    conversationService: conversations ?? memoryConversationService(locale),
    qrScanEnvironment: scanEnvironment,
    initialLocale: locale,
  ));
  await tester.pumpAndSettle();
  return Harness(
    records: recordStore,
    patients: patientStore,
    doctors: doctorStore,
    careSessions: sessionStore,
    medicalRecords: medicalStore,
    humanConsultations: humanStore,
  );
}

/// On-device conversation service with in-memory storage, so widget tests never
/// touch the host platform or the network.
CareConversationService memoryConversationService([
  String locale = _zh,
  CareConversationStorage? storage,
]) =>
    LocalCareConversationService(
      storage: storage ?? InMemoryCareConversationStorage(),
      offlineResponder: (String content) =>
          buildOfflineAnswer(locale, triageSymptoms(content).level),
      defaultTitle: careText(locale, 'platform.care.sessions.defaultTitle'),
    );

/// One row of the right-hand "+" dropdown, by its catalog label.
Finder menuItem(String labelKey) => find.descendant(
      of: find.byType(PopupMenuItem<CareShellAction>),
      matching: find.text(_t(labelKey)),
    );

/// Deterministic QR scanner: no camera, no permission dialog.
class FakeQrScanner implements CareQrScannerPort {
  FakeQrScanner({this.failure, this.torchCapability = CareQrTorch.off});

  /// Status the next open reports; null means the camera works.
  CareQrScanStatus? failure;

  /// Torch capability reported while the scanner is open.
  final CareQrTorch torchCapability;

  final ValueNotifier<CareQrScanStatus> _status =
      ValueNotifier<CareQrScanStatus>(CareQrScanStatus.idle);
  final ValueNotifier<CareQrTorch> _torch =
      ValueNotifier<CareQrTorch>(CareQrTorch.unavailable);
  ValueChanged<String>? _onDetected;

  @override
  ValueListenable<CareQrScanStatus> get status => _status;

  @override
  ValueListenable<CareQrTorch> get torch => _torch;

  @override
  void open({required ValueChanged<String> onDetected}) {
    _onDetected = onDetected;
    _torch.value = torchCapability;
    _status.value = failure ?? CareQrScanStatus.scanning;
  }

  @override
  Widget buildPreview(BuildContext context) =>
      const ColoredBox(color: Colors.black);

  @override
  Future<void> toggleTorch() async {
    if (_torch.value == CareQrTorch.unavailable) {
      return;
    }
    _torch.value =
        _torch.value == CareQrTorch.on ? CareQrTorch.off : CareQrTorch.on;
  }

  @override
  Future<void> close() async {
    _status.value = CareQrScanStatus.idle;
    _torch.value = CareQrTorch.unavailable;
  }

  /// Delivers one decoded QR code to the scan screen.
  void emit(String value) => _onDetected?.call(value);
}

class FakeQrScanEnvironment implements CareQrScanEnvironment {
  FakeQrScanEnvironment(this.scanner);

  final FakeQrScanner scanner;

  @override
  CareQrScannerPort createScanner() => scanner;
}

Finder inChat(Finder matching) =>
    find.descendant(of: find.byType(ChatTab), matching: matching);

Finder inDoctor(Finder matching) =>
    find.descendant(of: find.byType(DoctorTab), matching: matching);

/// The shell navbar: title, actions, and the category tabs.
Finder inNavbar(Finder matching) =>
    find.descendant(of: find.byType(AppBar), matching: matching);

/// The 医生 navbar: title, search action, and the category tabs.
Finder inDoctorNavbar(Finder matching) => inNavbar(matching);

Finder inMe(Finder matching) =>
    find.descendant(of: find.byType(MeTab), matching: matching);

const List<String> _tabLabelKeys = <String>[
  'platform.care.nav.chat',
  'platform.care.nav.doctor',
  'platform.care.nav.records',
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

/// Opens one doctor's detail page from the directory card.
Future<void> openDoctorDetail(WidgetTester tester, String doctorId) async {
  await tester.tap(find.byKey(Key('doctor-card-$doctorId')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the shell renders exactly four destinations',
      (WidgetTester tester) async {
    await pumpApp(tester);

    final List<NavigationDestination> destinations = tester
        .widgetList<NavigationDestination>(find.byType(NavigationDestination))
        .toList();
    expect(destinations, hasLength(4));
    expect(
      destinations
          .map((NavigationDestination destination) => destination.label)
          .toList(),
      <String>[
        _t('platform.care.nav.chat'),
        _t('platform.care.nav.doctor'),
        _t('platform.care.nav.records'),
        _t('platform.care.nav.me'),
      ],
    );
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
      'the navbar keeps the drawer button, centered title, and plus action',
      (WidgetTester tester) async {
    await pumpApp(tester);

    expect(find.byTooltip(_t('platform.care.nav.menu')), findsOneWidget);
    expect(
      find.byTooltip(_t('platform.care.action.more')),
      findsOneWidget,
    );
    expect(
      find.widgetWithText(AppBar, _t('platform.care.nav.chat')),
      findsOneWidget,
    );
  });

  testWidgets('the plus opens a dropdown menu with the care actions',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip(_t('platform.care.action.more')));
    await tester.pumpAndSettle();

    expect(find.byType(BottomSheet), findsNothing,
        reason: 'the plus opens a dropdown, not a bottom sheet');
    expect(find.byType(PopupMenuItem<CareShellAction>), findsNWidgets(3));
    expect(menuItem('platform.care.action.newConsultation'), findsOneWidget);
    expect(menuItem('platform.care.records.title'), findsOneWidget);
    expect(menuItem('platform.care.action.scan'), findsOneWidget);
  });

  testWidgets('对话 navbar names the human doctor the family talks to',
      (WidgetTester tester) async {
    await pumpApp(tester);

    expect(inNavbar(find.text(_t('platform.care.nav.chat'))), findsOneWidget,
        reason: 'with no human doctor the tab keeps its own label');

    await openTab(tester, 1);
    await openDoctorDetail(tester, 'doctor-lin-qinghe');
    await tester.tap(find.byKey(const Key('doctor-detail-select')));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    await openTab(tester, 0);

    final DoctorProfile lin = kCatalogDoctorRoster.doctors.first;
    expect(inNavbar(find.text(lin.displayName)), findsOneWidget,
        reason: 'the conversation states the real doctor instead of "对话"');
    expect(inNavbar(find.text(_t('platform.care.nav.chat'))), findsNothing);
  });

  testWidgets('对话 navbar follows the human doctor a session is attributed to',
      (WidgetTester tester) async {
    final InMemoryCareConversationStorage storage =
        InMemoryCareConversationStorage();
    await storage.write(
      LocalCareConversationService.sessionsKey,
      jsonEncode(<Map<String, Object?>>[
        <String, Object?>{
          'id': 'session-human',
          'title': 'Heart follow-up',
          'updatedAt': DateTime.utc(2026, 11, 3, 4).toIso8601String(),
          'doctor': <String, Object?>{
            'kind': 'human',
            'id': 'doctor-he-zhiyuan',
            'displayName': 'He Zhiyuan',
            'department': 'General practice',
          },
        },
      ]),
    );
    await pumpApp(
      tester,
      conversations: memoryConversationService(_zh, storage),
      doctors: DoctorSelectionStore.memory(const DoctorSelectionState(
        selectedIds: <String>['doctor-lin-qinghe'],
        primaryId: 'doctor-lin-qinghe',
      )),
    );

    expect(inNavbar(find.text('He Zhiyuan')), findsOneWidget,
        reason: 'the open session is attributed to this clinician');
    expect(inNavbar(find.text('Lin Qinghe')), findsNothing,
        reason: 'the session attribution outranks the household primary');
  });

  testWidgets('the drawer is the care agent conversation list',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip(_t('platform.care.nav.menu')));
    await tester.pumpAndSettle();

    final Finder drawer = find.byType(CareSessionsDrawer);
    expect(drawer, findsOneWidget);
    expect(
      find.descendant(of: drawer, matching: find.text('SDKWork Doctor')),
      findsOneWidget,
    );
    expect(
      find.descendant(
          of: drawer, matching: find.text(_t('platform.care.mode.offline'))),
      findsOneWidget,
    );
    // The seeded on-device conversation is the first list entry.
    expect(
      find.descendant(
          of: drawer,
          matching: find.text(_t('platform.care.sessions.defaultTitle'))),
      findsOneWidget,
    );
    // The row states which doctor it belongs to instead of leaving that blank.
    expect(
      find.descendant(
          of: drawer, matching: find.text(_t('platform.care.doctors.ai'))),
      findsOneWidget,
      reason: 'every care conversation is with the AI family doctor',
    );
    expect(
      find.descendant(
          of: drawer,
          matching: find.widgetWithText(
              FilledButton, _t('platform.care.sessions.new'))),
      findsOneWidget,
    );
    expect(
      find.descendant(of: drawer, matching: find.byIcon(Icons.edit_outlined)),
      findsNothing,
      reason: 'row actions live in the long-press menu, not inline icons',
    );
    expect(
      find.descendant(of: drawer, matching: find.byIcon(Icons.delete_outline)),
      findsNothing,
      reason: 'row actions live in the long-press menu, not inline icons',
    );
    expect(
      find.descendant(
          of: drawer, matching: find.text(_t('platform.care.nav.me'))),
      findsNothing,
      reason: 'the drawer is a session list, not a tab switcher',
    );

    await tester.tap(find.descendant(
        of: drawer,
        matching: find.text(_t('platform.care.sessions.defaultTitle'))));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, _t('platform.care.nav.chat')),
        findsOneWidget);
    expect(find.byType(CareSessionsDrawer), findsNothing);
  });

  testWidgets('the drawer starts a new conversation and lists it',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip(_t('platform.care.nav.menu')));
    await tester.pumpAndSettle();
    await tester.tap(
        find.widgetWithText(FilledButton, _t('platform.care.sessions.new')));
    await tester.pumpAndSettle();

    expect(inChat(find.text(_t('platform.care.home.prompt'))), findsOneWidget);

    await tester.tap(find.byTooltip(_t('platform.care.nav.menu')));
    await tester.pumpAndSettle();
    expect(
      find.descendant(
          of: find.byType(CareSessionsDrawer), matching: find.byType(ListTile)),
      findsNWidgets(2),
      reason: 'the new conversation joins the seeded one',
    );
    expect(
      find.descendant(
          of: find.byType(CareSessionsDrawer),
          matching: find.text(_t('platform.care.doctors.ai'))),
      findsNWidgets(2),
      reason: 'every session row states its doctor',
    );
  });

  testWidgets('a conversation is renamed from the long-press menu',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip(_t('platform.care.nav.menu')));
    await tester.pumpAndSettle();
    await tester.longPress(find.descendant(
      of: find.byType(CareSessionsDrawer),
      matching: find.text(_t('platform.care.sessions.defaultTitle')),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_t('platform.care.sessions.rename')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Chest pain follow-up');
    await tester.tap(
        find.widgetWithText(FilledButton, _t('platform.care.action.confirm')));
    await tester.pumpAndSettle();

    expect(
      find.descendant(
          of: find.byType(CareSessionsDrawer),
          matching: find.text('Chest pain follow-up')),
      findsOneWidget,
    );
  });

  testWidgets('the row menu offers batch, rename, pin, and delete',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip(_t('platform.care.nav.menu')));
    await tester.pumpAndSettle();
    await tester.longPress(find.descendant(
      of: find.byType(CareSessionsDrawer),
      matching: find.text(_t('platform.care.sessions.defaultTitle')),
    ));
    await tester.pumpAndSettle();

    for (final String key in <String>[
      'platform.care.sessions.batch',
      'platform.care.sessions.rename',
      'platform.care.sessions.pin',
      'platform.care.sessions.delete',
    ]) {
      expect(find.text(_t(key)), findsOneWidget, reason: key);
    }
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
    expect(inChat(find.byType(SdkworkChatComposer)), findsOneWidget);

    await tester.enterText(
        inChat(find.byType(TextField)), 'chest pain for 10 minutes');
    await tester.pump();
    await tester.tap(inChat(find.byKey(_composerSendKey)));
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

    await tester.enterText(
        inChat(find.byType(TextField)), 'fever since last night');
    await tester.pump();
    await tester.tap(inChat(find.byKey(_composerSendKey)));
    await tester.pumpAndSettle();

    expect(harness.records.records.single.memberId, added.id);
    expect(harness.records.records.single.memberLabel, 'Xiaoman (child)');
  });

  testWidgets('with no patient file the chat cannot send and links to 我的',
      (WidgetTester tester) async {
    final PatientProfileStore patients =
        PatientProfileStore.memory(profiles: <PatientProfile>[]);
    await pumpApp(tester, patients: patients);

    expect(inChat(find.text(_t('platform.care.chat.noPatient'))), findsWidgets);
    final TextField composer =
        tester.widget<TextField>(inChat(find.byType(TextField)));
    expect(composer.enabled, isFalse, reason: 'sending is disabled');
    final SdkworkChatComposer chatComposer = tester
        .widget<SdkworkChatComposer>(inChat(find.byType(SdkworkChatComposer)));
    expect(chatComposer.enabled, isFalse);
    expect(inChat(find.byKey(_composerSendKey)), findsNothing,
        reason: 'the idle composer has no send control');

    await tester.tap(
        inChat(find.widgetWithText(TextButton, _t('platform.care.nav.me'))));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, _t('platform.care.me.title')),
        findsOneWidget);
  });

  testWidgets('医生 keeps the category tabs in the navbar',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 1);

    final Finder all =
        inDoctorNavbar(find.text(_t('platform.care.doctors.category.all')));
    final Finder cardiology = inDoctorNavbar(
        find.text(_t('platform.care.doctors.department.cardiology')));
    final Finder pediatrics = inDoctorNavbar(
        find.text(_t('platform.care.doctors.department.pediatrics')));
    final Finder generalPractice = inDoctorNavbar(
        find.text(_t('platform.care.doctors.department.general_practice')));

    expect(all, findsOneWidget);
    expect(cardiology, findsOneWidget);
    expect(pediatrics, findsOneWidget);
    expect(generalPractice, findsOneWidget);
    expect(
      inDoctor(find.text(_t('platform.care.doctors.category.all'))),
      findsNothing,
      reason: 'the strip belongs to the navbar, not the page body',
    );
    expect(
      inDoctor(find.text(_t('platform.care.doctors.results',
          params: <String, String>{'count': '3'}))),
      findsOneWidget,
    );

    await tester.tap(pediatrics);
    await tester.pumpAndSettle();

    expect(inDoctor(find.text('Su Wanning')), findsOneWidget);
    expect(inDoctor(find.text('Lin Qinghe')), findsNothing);
    expect(
      inDoctor(find.text(_t('platform.care.doctors.results',
          params: <String, String>{'count': '1'}))),
      findsOneWidget,
    );

    await tester.tap(all);
    await tester.pumpAndSettle();

    expect(inDoctor(find.text('Lin Qinghe')), findsOneWidget);
    expect(inDoctor(find.text('He Zhiyuan')), findsOneWidget);
  });

  testWidgets('医生 searches from the navbar and returns the tapped doctor',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 1);

    expect(inDoctor(find.byType(TextField)), findsNothing,
        reason: 'search is a navbar action, not a field on the page');
    await tester.tap(find.byTooltip(_t('platform.care.doctors.searchAction')));
    await tester.pumpAndSettle();

    final Finder page = find.byType(DoctorSearchScreen);
    expect(page, findsOneWidget);
    final Finder search =
        find.descendant(of: page, matching: find.byType(TextField));

    await tester.enterText(search, 'Lin Qinghe');
    await tester.pumpAndSettle();
    expect(find.descendant(of: page, matching: find.text('Lin Qinghe')),
        findsWidgets);
    expect(find.descendant(of: page, matching: find.text('Su Wanning')),
        findsNothing);

    await tester.enterText(
        search, _t('platform.care.doctors.specialty.child_fever'));
    await tester.pumpAndSettle();
    expect(find.descendant(of: page, matching: find.text('Su Wanning')),
        findsWidgets);
    expect(find.descendant(of: page, matching: find.text('Lin Qinghe')),
        findsNothing);

    await tester.enterText(search, 'no-such-doctor');
    await tester.pumpAndSettle();
    expect(find.text(_t('platform.care.doctors.noResults')), findsOneWidget);

    // A result opens that doctor's detail page on top of the results, so closing
    // it returns to the result list and search stays usable.
    await tester.enterText(search, 'Su Wanning');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(InkWell, 'Su Wanning').first);
    await tester.pumpAndSettle();

    expect(page, findsNothing, reason: 'the detail page covers the results');
    expect(find.byType(DoctorDetailScreen), findsOneWidget);
    expect(find.widgetWithText(AppBar, _t('platform.care.doctors.detail')),
        findsOneWidget);
    expect(find.text('Su Wanning'), findsWidgets);
  });

  testWidgets('医生 search cancels back to the directory',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 1);

    await tester.tap(find.byTooltip(_t('platform.care.doctors.searchAction')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
        of: find.byType(DoctorSearchScreen),
        matching: find.widgetWithText(
            TextButton, _t('platform.care.action.cancel'))));
    await tester.pumpAndSettle();

    expect(find.byType(DoctorSearchScreen), findsNothing);
    expect(inDoctor(find.text('Lin Qinghe')), findsOneWidget);
  });

  testWidgets('医生 lists the fallback roster and selecting one makes it primary',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 1);

    expect(find.widgetWithText(AppBar, _t('platform.care.nav.doctor')),
        findsOneWidget);
    expect(inDoctor(find.text(_t('platform.care.doctors.source.catalog'))),
        findsOneWidget);
    for (final DoctorProfile doctor in kCatalogDoctorRoster.doctors) {
      expect(inDoctor(find.text(doctor.displayName)), findsOneWidget,
          reason: doctor.id);
    }
    expect(
        inDoctor(find.text(_t('platform.care.doctors.none'))), findsOneWidget);
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

    await tester
        .tap(inDoctor(find.text(_t('platform.care.doctors.select'))).first);
    await tester.pumpAndSettle();

    expect(harness.doctors.primaryId, 'doctor-lin-qinghe');
    expect(harness.doctors.selectedIds, <String>['doctor-lin-qinghe']);
    expect(
        inDoctor(find.text(_t('platform.care.doctors.primary'))), findsWidgets);
    expect(
      inDoctor(find.text(_t('platform.care.doctors.selected'))),
      findsWidgets,
    );
  });

  testWidgets(
      'a human consultation records the reason against the active patient',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 1);

    await openDoctorDetail(tester, 'doctor-lin-qinghe');
    await tester.tap(find.byKey(const Key('doctor-detail-consult')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).last,
      'chest tightness after dinner',
    );
    await tester.tap(find.byKey(const Key('doctor-consult-submit')));
    await tester.pumpAndSettle();

    expect(harness.records.records, hasLength(1));
    final VisitRecord record = harness.records.records.first;
    expect(record.mode, 'human');
    expect(record.level, TriageLevel.routine);
    expect(record.doctorId, 'doctor-lin-qinghe');
    expect(record.doctorLabel,
        'Lin Qinghe · ${_t('platform.care.doctors.department.cardiology')}');
    expect(record.doctorOrganizationId, 'org-sdkwork-care-network');
    expect(record.doctorHospitalLabel,
        _t('platform.care.doctors.hospital.sdkwork_care_network'));
    expect(record.doctorEmploymentType, 'full_time');
    expect(record.memberId, 'member-self');
    expect(record.symptom, 'chest tightness after dinner');
    expect(
      record.advice,
      _t('platform.care.doctors.consultStarted',
          params: <String, String>{'doctor': 'Lin Qinghe'}),
    );
    // The consultation opens the conversation home instead of launching an
    // external channel: the detail page is gone, the human doctor strip is up,
    // and the reason is the first turn of the new conversation.
    expect(find.byType(DoctorDetailScreen), findsNothing,
        reason: 'the consultation lands on the conversation home');
    expect(find.text(_t('platform.care.chat.humanBadge')), findsWidgets,
        reason: 'the conversation says it is a human consultation');
    expect(find.text('chest tightness after dinner'), findsWidgets,
        reason: 'the reason is the first patient turn');
    expect(harness.humanConsultations.sessions, hasLength(1));
    final CareConversationSession session =
        harness.humanConsultations.sessions.first;
    expect(session.doctor.id, 'doctor-lin-qinghe');
    expect(session.doctor.displayName, 'Lin Qinghe');
    expect(session.memberLabel,
        '${_t('platform.care.profile.relation.self')} · Me');
    expect(session.title, 'chest tightness after dinner');
    expect(session.unreadCount, 0);
    expect(harness.humanConsultations.messages(session.id),
        hasLength(1));
    expect(harness.humanConsultations.messages(session.id).first.text,
        'chest tightness after dinner');

    final VisitRecord? reloaded = VisitRecord.fromJson(record.toJson());
    expect(reloaded, isNotNull);
    expect(reloaded!.doctorId, 'doctor-lin-qinghe');
    expect(reloaded.doctorLabel,
        'Lin Qinghe · ${_t('platform.care.doctors.department.cardiology')}');
    expect(reloaded.doctorOrganizationId, 'org-sdkwork-care-network');
    expect(reloaded.doctorEmploymentType, 'full_time');
  });

  testWidgets('choosing a practice site routes the consultation to that site',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 1);

    await openDoctorDetail(tester, 'doctor-lin-qinghe');

    // The detail page lists both practice sites; choosing the clinic routes the
    // consultation to that organization and engagement.
    await tester.tap(find
        .text(_t('platform.care.doctors.hospital.sdkwork_community_clinic')));
    await tester.pumpAndSettle();
    expect(
      find.text(_t('platform.care.doctors.employment.part_time')),
      findsWidgets,
      reason: 'the chosen site is the part-time engagement',
    );

    await tester.tap(find.byKey(const Key('doctor-detail-consult')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).last,
      'blood-pressure follow-up',
    );
    await tester.tap(find.byKey(const Key('doctor-consult-submit')));
    await tester.pumpAndSettle();

    final VisitRecord record = harness.records.records.single;
    expect(record.mode, 'human');
    expect(record.doctorOrganizationId, 'org-sdkwork-community-clinic');
    expect(record.doctorHospitalLabel,
        _t('platform.care.doctors.hospital.sdkwork_community_clinic'));
    expect(record.doctorEmploymentType, 'part_time');
    expect(record.doctorLabel,
        'Lin Qinghe · ${_t('platform.care.doctors.department.general_practice')}');
  });

  testWidgets('医生 cards open the detail page instead of expanding in the list',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 1);

    expect(
      inDoctor(find.text(_t('platform.care.doctors.detail'))),
      findsNothing,
      reason: 'the list carries no inline detail control',
    );

    await openDoctorDetail(tester, 'doctor-lin-qinghe');

    final DoctorProfile lin = kCatalogDoctorRoster.doctors.first;
    expect(find.widgetWithText(AppBar, _t('platform.care.doctors.detail')),
        findsOneWidget);
    expect(find.text(lin.displayName), findsWidgets);
    expect(find.text(_t('platform.care.doctors.about')), findsOneWidget);
    expect(find.text(lin.bio), findsOneWidget);
    expect(find.byKey(const Key('doctor-detail-consult')), findsOneWidget);
    expect(
      find.text(_t('platform.care.doctors.hospital.sdkwork_community_clinic')),
      findsOneWidget,
      reason: 'every practice site is listed on the detail page',
    );
    expect(
      find.textContaining(_t('platform.care.doctors.availability')),
      findsWidgets,
      reason: 'each site keeps its own consulting hours',
    );
  });

  testWidgets('医生 detail selects the doctor and the list reflects it',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 1);
    await openDoctorDetail(tester, 'doctor-su-wanning');

    await tester.tap(find.byKey(const Key('doctor-detail-select')));
    await tester.pumpAndSettle();

    expect(harness.doctors.selectedIds, <String>['doctor-su-wanning']);
    expect(harness.doctors.primaryId, 'doctor-su-wanning');
    expect(find.text(_t('platform.care.doctors.selected')), findsWidgets);

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(
        inDoctor(find.text(_t('platform.care.doctors.primary'))), findsWidgets,
        reason: 'the directory card shows the primary doctor after returning');
  });

  testWidgets('我的 owns the patient files and opens 看病记录 as a tab',
      (WidgetTester tester) async {
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
    final CareSessionStore sessions = CareSessionStore.memory(<CareSession>[
      appendCareSessionMessage(
        createCareSession(
          patient: kDemoSelfPatient,
          mode: 'offline',
          startedAt: DateTime.utc(2026, 11, 2, 13, 30),
        ),
        role: 'patient',
        text: 'chest pain for 10 minutes',
        at: DateTime.utc(2026, 11, 2, 13, 30),
        level: TriageLevel.emergency,
      ),
    ]);
    await pumpApp(tester, records: records, careSessions: sessions);
    await openTab(tester, 3);

    expect(inMe(find.text('Me')), findsOneWidget);
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

    await tester.tap(inMe(find.text(_t('platform.care.me.patients'))));
    await tester.pumpAndSettle();
    expect(find.byType(PatientFilesScreen), findsOneWidget);
    expect(
      find.widgetWithText(AppBar, _t('platform.care.profile.title')),
      findsOneWidget,
    );
    expect(find.text(_t('platform.care.active')), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(inMe(find.text(_t('platform.care.me.recordsAndMedical'))));
    await tester.pumpAndSettle();

    expect(find.byType(RecordsScreen), findsOneWidget);
    expect(find.text('chest pain for 10 minutes'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget,
        reason: 'records is a tab and keeps the bottom navigation');
    expect(
      find.widgetWithText(AppBar, _t('platform.care.nav.records')),
      findsOneWidget,
    );
  });

  testWidgets('看病记录 clears every visit and 病历 after confirmation',
      (WidgetTester tester) async {
    final CareSessionStore sessions = CareSessionStore.memory(<CareSession>[
      appendCareSessionMessage(
        createCareSession(
          patient: kDemoSelfPatient,
          mode: 'offline',
          startedAt: DateTime.utc(2026, 11, 2, 13, 30),
        ),
        role: 'patient',
        text: 'dizzy for two days',
        at: DateTime.utc(2026, 11, 2, 13, 30),
      ),
    ]);
    final Harness harness = await pumpApp(tester, careSessions: sessions);
    await openTab(tester, 2);
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(
        FilledButton, _t('platform.care.records.clearAll')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
      of: find.byType(AlertDialog),
      matching: find.text(_t('platform.care.records.clearAll')),
    ));
    await tester.pumpAndSettle();

    expect(harness.careSessions.isEmpty, isTrue);
    expect(find.text(_t('platform.care.records.empty')), findsOneWidget);
  });

  testWidgets('creating a patient file from 我的 adds and shows it',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 3);
    await tester.tap(inMe(find.text(_t('platform.care.me.patients'))));
    await tester.pumpAndSettle();

    await tester.tap(find.text(_t('platform.care.profile.add')));
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
    expect(
      find.widgetWithText(AppBar, _t('platform.care.profile.title')),
      findsOneWidget,
    );
    expect(find.text('Xiaoman'), findsOneWidget);
  });

  testWidgets('the patient editor reports a missing name and a bad birth year',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 3);
    await tester.tap(inMe(find.text(_t('platform.care.me.patients'))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_t('platform.care.profile.add')));
    await tester.pumpAndSettle();

    await tester.tap(find.text(_t('platform.care.profile.save')));
    await tester.pumpAndSettle();
    expect(
        find.text(_t('platform.care.profile.required.name')), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'Xiaoman');
    await tester.enterText(find.byType(TextField).at(1), '1899');
    await tester.tap(find.text(_t('platform.care.profile.save')));
    await tester.pumpAndSettle();
    expect(find.text(_t('platform.care.profile.invalid.birthYear')),
        findsOneWidget);
    expect(find.byType(PatientEditorScreen), findsOneWidget);
  });

  testWidgets('deleting a patient file asks first and then removes it',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);
    await openTab(tester, 3);
    await tester.tap(inMe(find.text(_t('platform.care.me.patients'))));
    await tester.pumpAndSettle();

    await tester.tap(find.text(_t('platform.care.profile.delete')).first);
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
      of: find.byType(AlertDialog),
      matching:
          find.widgetWithText(FilledButton, _t('platform.care.profile.delete')),
    ));
    await tester.pumpAndSettle();

    expect(harness.patients.profiles, isEmpty);
    expect(find.text(_t('platform.care.profile.empty')), findsOneWidget);
    expect(harness.patients.active, isNull);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(inMe(find.text(_t('platform.care.profile.notCreated'))),
        findsOneWidget);
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
    await openTab(tester, 3);
    await tester.tap(inMe(find.text(_t('platform.care.me.patients'))));
    await tester.pumpAndSettle();

    await tester.tap(find.text(_t('platform.care.profile.select')).first);
    await tester.pumpAndSettle();

    expect(harness.patients.activeId, added.id);
    expect(find.text(_t('platform.care.active')), findsOneWidget,
        reason: 'exactly one patient file carries the active badge');

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(inMe(find.text('Xiaoman')), findsOneWidget);
  });

  testWidgets('the me tab reports the conversation mode and the privacy line',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 3);

    expect(inMe(find.text(_t('platform.care.mode.offline'))), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.me.patients'))), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.privacy.local'))), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.me.device'))), findsOneWidget);
    expect(inMe(find.text(_t('platform.care.call.videoTitle'))), findsOneWidget,
        reason: 'the video call is one cell away from 我的');
  });

  testWidgets('我的 switches the care catalog language',
      (WidgetTester tester) async {
    await pumpApp(tester);
    await openTab(tester, 3);

    await tester.tap(inMe(find.text(_t('platform.care.language.label'))));
    await tester.pumpAndSettle();

    expect(
      find.widgetWithText(AppBar, careText('en-US', 'platform.care.nav.me')),
      findsOneWidget,
    );
    expect(
      inMe(find.text(careText('en-US', 'platform.care.mode.offline'))),
      findsOneWidget,
    );
  });

  testWidgets('the plus menu starts a new consultation and keeps records',
      (WidgetTester tester) async {
    final Harness harness = await pumpApp(tester);

    await tester.enterText(
        inChat(find.byType(TextField)), 'chest pain for 10 minutes');
    await tester.pump();
    await tester.tap(inChat(find.byKey(_composerSendKey)));
    await tester.pumpAndSettle();
    expect(harness.records.records, hasLength(1));

    await tester.tap(find.byTooltip(_t('platform.care.action.more')));
    await tester.pumpAndSettle();
    await tester.tap(menuItem('platform.care.action.newConsultation'));
    await tester.pumpAndSettle();

    expect(inChat(find.text('chest pain for 10 minutes')), findsNothing);
    expect(inChat(find.text(_t('platform.care.home.prompt'))), findsOneWidget);
    expect(harness.records.records, hasLength(1),
        reason: 'visit records survive a new consultation');
  });

  testWidgets('the plus menu opens 看病记录 as the records tab',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.tap(find.byTooltip(_t('platform.care.action.more')));
    await tester.pumpAndSettle();
    await tester.tap(menuItem('platform.care.records.title'));
    await tester.pumpAndSettle();

    expect(find.byType(RecordsScreen), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget,
        reason: 'the records tab keeps the bottom navigation');
    expect(
      find.widgetWithText(AppBar, _t('platform.care.nav.records')),
      findsOneWidget,
    );
  });

  testWidgets('扫一扫 scans a QR code and shows the decoded content',
      (WidgetTester tester) async {
    final FakeQrScanner scanner = FakeQrScanner();
    await pumpApp(tester, scanEnvironment: FakeQrScanEnvironment(scanner));

    await tester.tap(find.byTooltip(_t('platform.care.action.more')));
    await tester.pumpAndSettle();
    await tester.tap(menuItem('platform.care.action.scan'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(CareScanScreen), findsOneWidget);
    expect(find.text(_t('platform.care.scan.hint')), findsOneWidget);
    expect(find.byIcon(Icons.flashlight_off), findsOneWidget);

    await tester.tap(find.byIcon(Icons.flashlight_off));
    await tester.pump();
    expect(find.byIcon(Icons.flashlight_on), findsOneWidget);

    scanner.emit('SDKWORK-DOCTOR:doctor-lin-qinghe');
    await tester.pumpAndSettle();

    expect(find.text(_t('platform.care.scan.resultTitle')), findsOneWidget);
    expect(
      tester.widget<SelectableText>(find.byType(SelectableText)).data,
      'SDKWORK-DOCTOR:doctor-lin-qinghe',
    );

    await tester.tap(find.text(_t('platform.care.scan.done')));
    await tester.pumpAndSettle();
    expect(find.byType(CareScanScreen), findsNothing);
  });

  testWidgets('扫一扫 explains a denied camera permission and retries',
      (WidgetTester tester) async {
    final FakeQrScanner scanner =
        FakeQrScanner(failure: CareQrScanStatus.permissionDenied);
    await pumpApp(tester, scanEnvironment: FakeQrScanEnvironment(scanner));

    await tester.tap(find.byTooltip(_t('platform.care.action.more')));
    await tester.pumpAndSettle();
    await tester.tap(menuItem('platform.care.action.scan'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(
      find.text(_t('platform.care.scan.permissionDenied')),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.flashlight_off), findsNothing,
        reason: 'the torch control belongs to a running camera');

    scanner.failure = null;
    await tester.tap(find.text(_t('platform.care.scan.retry')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text(_t('platform.care.scan.hint')), findsOneWidget);
  });

  testWidgets('看病记录 opens a 4-tab detail page for one visit',
      (WidgetTester tester) async {
    final MedicalRecord caseRecord = MedicalRecord(
      id: 'case-detail',
      sessionId: 'session-detail',
      memberId: demoSelfMember.id,
      memberLabel: 'Me (self)',
      mode: 'offline',
      startedAt: '2026-11-03T11:00:00.000Z',
      endedAt: '2026-11-03T11:18:00.000Z',
      summary: 'Two turns about a high fever since last night.',
      transcript: <MedicalTranscriptEntry>[
        MedicalTranscriptEntry(
          id: 'entry-1',
          role: 'patient',
          text: 'Child has had a high fever since last night',
          at: '2026-11-03T11:01:00.000Z',
          level: TriageLevel.urgent,
        ),
        MedicalTranscriptEntry(
          id: 'entry-2',
          role: 'assistant',
          text: 'Contact a clinician today.',
          at: '2026-11-03T11:02:00.000Z',
        ),
      ],
      aiDiagnosis: createAiDiagnosis(
        id: 'ai-detail',
        impression: 'Febrile child; a same-day review is advised.',
        conditions: <String>['Respiratory infection'],
        recommendations: <String>['Contact a clinician today.'],
        level: TriageLevel.urgent,
        createdAt: DateTime.utc(2026, 11, 3, 11, 18),
      ),
      status: 'awaiting_doctor',
      attachments: const <MedicalAttachment>[],
    );
    final CareSession session = buildCareSessionFromMedicalRecord(caseRecord);
    await pumpApp(
      tester,
      careSessions: CareSessionStore.memory(<CareSession>[session]),
      medicalRecords: MedicalRecordStore.memory(<MedicalRecord>[caseRecord]),
    );
    await openTab(tester, 2);
    await tester.pumpAndSettle();

    await tester.tap(find.text(session.title));
    await tester.pumpAndSettle();

    expect(find.byType(RecordDetailScreen), findsOneWidget);
    expect(find.text(_t('platform.care.record.tab.medical')), findsOneWidget);
    expect(find.text(_t('platform.care.record.tab.ai')), findsOneWidget);
    expect(find.text(_t('platform.care.record.tab.doctor')), findsOneWidget);
    expect(find.text(_t('platform.care.record.tab.playback')), findsOneWidget);

    await tester.tap(find.text(_t('platform.care.record.tab.ai')));
    await tester.pumpAndSettle();
    expect(find.text(caseRecord.summary), findsOneWidget);
    expect(find.textContaining(caseRecord.aiDiagnosis.impression), findsOneWidget);

    await tester.tap(find.text(_t('platform.care.record.tab.doctor')));
    await tester.pumpAndSettle();
    expect(find.text(_t('platform.care.medical.review')), findsOneWidget);
    expect(
        find.textContaining(
            _t('platform.care.medical.status.awaiting_doctor')),
        findsWidgets);

    await tester.tap(find.text(_t('platform.care.record.tab.playback')));
    await tester.pumpAndSettle();
    expect(find.text(_t('platform.care.record.playback.title')), findsWidgets);
    expect(find.text(_t('platform.care.record.playback.hint')), findsOneWidget);
  });

  testWidgets('an emergency message escalates with guidance first',
      (WidgetTester tester) async {
    await pumpApp(tester);

    await tester.enterText(
        inChat(find.byType(TextField)), 'chest pain for 10 minutes');
    await tester.pump();
    await tester.tap(inChat(find.byKey(_composerSendKey)));
    await tester.pumpAndSettle();

    final List<String> texts = tester
        .widgetList<Text>(find.byType(Text))
        .map((Text text) => text.data ?? '')
        .toList();
    expect(
      texts.any((String value) =>
          value.contains(_t('platform.care.triage.action.emergency.call'))),
      isTrue,
      reason: 'emergency guidance must lead the reply',
    );
    expect(inChat(find.text(_t('platform.care.level.emergency'))),
        findsNWidgets(2),
        reason: 'both the message and the answer carry the emergency level');
  });

  testWidgets('the English locale renders the same four destinations',
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
        careText('en-US', 'platform.care.nav.records'),
        careText('en-US', 'platform.care.nav.me'),
      ],
    );
    expect(find.text(careText('en-US', 'platform.care.home.prompt')),
        findsOneWidget);
  });
}
