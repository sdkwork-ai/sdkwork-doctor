import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_chat_composer_flutter/sdkwork_chat_composer_flutter.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';
import 'package:sdkwork_doctor_flutter_mobile/care/attachment_picker.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_directory.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_selection.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/main.dart';
import 'package:sdkwork_doctor_flutter_mobile/patients/patient_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/care_session_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/medical_record_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/visit_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage_copy.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/attachment_sheet.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/chat_tab.dart';

const String _zh = 'zh-CN';

String _t(String key) => careText(_zh, key);

/// The composer's "+": one tap opens the source popup instead of jumping into a
/// system chooser, the three choices name the three sources, and dismissing the
/// popup opens no chooser at all.
///
/// The picker is a fake, so no test opens a camera, a gallery, or a file
/// dialog; it records the source each choice asked for.
class FakeAttachmentPicker implements CareAttachmentPicker {
  FakeAttachmentPicker({this.files = const <MedicalAttachment>[]});

  /// Attachments the next pick returns; empty models a cancelled chooser.
  final List<MedicalAttachment> files;

  /// Sources the popup asked the picker for, in order.
  final List<CareAttachmentSource> sources = <CareAttachmentSource>[];

  @override
  Future<List<MedicalAttachment>> pick(CareAttachmentSource source) async {
    sources.add(source);
    return files;
  }
}

Future<void> pumpChat(
  WidgetTester tester,
  CareAttachmentPicker picker, {
  PatientProfileStore? patients,
}) async {
  tester.view.physicalSize = const Size(1200, 3200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(DoctorApp(
    records: VisitRecordStore.memory(),
    medicalRecords: MedicalRecordStore.memory(),
    careSessions: CareSessionStore.memory(),
    patients: patients ?? PatientProfileStore.memory(),
    doctors: DoctorSelectionStore.memory(),
    directory: DoctorDirectory(directoryUrl: ''),
    attachmentPicker: picker,
    conversationService: LocalCareConversationService(
      storage: InMemoryCareConversationStorage(),
      offlineResponder: (String content) =>
          buildOfflineAnswer(_zh, triageSymptoms(content).level),
      defaultTitle: _t('platform.care.sessions.defaultTitle'),
    ),
    initialLocale: _zh,
  ));
  await tester.pumpAndSettle();
}

Finder inComposer(Finder matching) => find.descendant(
      of: find.byType(SdkworkChatComposer),
      matching: matching,
    );

Finder inChat(Finder matching) =>
    find.descendant(of: find.byType(ChatTab), matching: matching);

void main() {
  testWidgets('the composer "+" opens the source popup and calls no chooser',
      (WidgetTester tester) async {
    final FakeAttachmentPicker picker = FakeAttachmentPicker();
    await pumpChat(tester, picker);

    await tester.tap(inChat(find.byKey(const Key('sdkwork-chat-composer-attach'))));
    await tester.pumpAndSettle();

    expect(find.byKey(CareAttachmentSheet.sheetKey), findsOneWidget);
    expect(find.text(_t('platform.care.chat.attachCamera')), findsOneWidget);
    expect(find.text(_t('platform.care.chat.attachMedia')), findsOneWidget);
    expect(find.text(_t('platform.care.chat.attachFile')), findsOneWidget);
    expect(picker.sources, isEmpty,
        reason: 'opening the popup must not open a system chooser');
  });

  testWidgets('each popup choice asks the picker for that source',
      (WidgetTester tester) async {
    final FakeAttachmentPicker picker = FakeAttachmentPicker();
    await pumpChat(tester, picker);

    final Map<Key, CareAttachmentSource> choices =
        <Key, CareAttachmentSource>{
      CareAttachmentSheet.cameraKey: CareAttachmentSource.camera,
      CareAttachmentSheet.mediaKey: CareAttachmentSource.media,
      CareAttachmentSheet.filesKey: CareAttachmentSource.files,
    };

    for (final MapEntry<Key, CareAttachmentSource> choice
        in choices.entries) {
      await tester.tap(inChat(find.byKey(const Key('sdkwork-chat-composer-attach'))));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(choice.key));
      await tester.pumpAndSettle();
      expect(find.byKey(CareAttachmentSheet.sheetKey), findsNothing,
          reason: 'the popup closes once a source is chosen');
    }

    expect(picker.sources, choices.values.toList());
  });

  testWidgets('dismissing the popup opens no chooser',
      (WidgetTester tester) async {
    final FakeAttachmentPicker picker = FakeAttachmentPicker();
    await pumpChat(tester, picker);

    await tester.tap(inChat(find.byKey(const Key('sdkwork-chat-composer-attach'))));
    await tester.pumpAndSettle();
    // The scrim above the sheet: tapping it dismisses without a choice.
    await tester.tapAt(const Offset(12, 12));
    await tester.pumpAndSettle();

    expect(find.byKey(CareAttachmentSheet.sheetKey), findsNothing);
    expect(picker.sources, isEmpty);
  });

  testWidgets('a chosen file becomes a pending attachment chip',
      (WidgetTester tester) async {
    final FakeAttachmentPicker picker = FakeAttachmentPicker(
      files: <MedicalAttachment>[
        createMedicalAttachment(
          name: 'blood-test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
        ),
      ],
    );
    await pumpChat(tester, picker);

    await tester.tap(inChat(find.byKey(const Key('sdkwork-chat-composer-attach'))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(CareAttachmentSheet.filesKey));
    await tester.pumpAndSettle();

    expect(inChat(find.textContaining('blood-test.pdf')), findsOneWidget);
    expect(picker.sources, <CareAttachmentSource>[CareAttachmentSource.files]);
  });

  testWidgets('the "+" stays disabled without a patient file',
      (WidgetTester tester) async {
    final FakeAttachmentPicker picker = FakeAttachmentPicker();
    await pumpChat(
      tester,
      picker,
      patients: PatientProfileStore.memory(profiles: <PatientProfile>[]),
    );

    await tester.tap(inChat(find.byKey(const Key('sdkwork-chat-composer-attach'))));
    await tester.pumpAndSettle();

    expect(find.byKey(CareAttachmentSheet.sheetKey), findsNothing);
    expect(picker.sources, isEmpty);
    expect(inComposer(find.byKey(const Key('sdkwork-chat-composer-attach'))),
        findsOneWidget);
  });
}
