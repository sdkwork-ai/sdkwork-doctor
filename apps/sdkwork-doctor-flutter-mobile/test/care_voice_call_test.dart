import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/care/voice/care_voice_ports.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_directory.dart';
import 'package:sdkwork_doctor_flutter_mobile/doctors/doctor_selection.dart';
import 'package:sdkwork_doctor_flutter_mobile/i18n/care_i18n.dart';
import 'package:sdkwork_doctor_flutter_mobile/main.dart';
import 'package:sdkwork_doctor_flutter_mobile/patients/patient_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/records/visit_store.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage_copy.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/care_call_screen.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/care_widgets.dart';
import 'package:sdkwork_doctor_flutter_mobile/ui/chat_tab.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

const String _zh = 'zh-CN';

String _t(String key,
        {Map<String, String> params = const <String, String>{}}) =>
    careText(_zh, key, params: params);

/// Deterministic speech recognizer: the test decides what was heard.
class FakeSpeechRecognizer implements CareSpeechRecognizer {
  FakeSpeechRecognizer({this.available = true});

  bool available;
  bool listening = false;
  bool disposed = false;
  int cancels = 0;
  int listens = 0;
  void Function(CareSpeechResult result)? _onResult;
  void Function(String code)? _onError;
  void Function()? _onDone;

  @override
  Future<bool> initialize({required String localeTag}) async => available;

  @override
  Future<bool> listen({
    required void Function(CareSpeechResult result) onResult,
    required void Function(String code) onError,
    required void Function() onDone,
    required String localeTag,
  }) async {
    _onResult = onResult;
    _onError = onError;
    _onDone = onDone;
    listens += 1;
    listening = available;
    return available;
  }

  void hear(String text, {bool isFinal = false}) =>
      _onResult?.call(CareSpeechResult(text: text, isFinal: isFinal));

  void fail(String code) => _onError?.call(code);

  void finish() => _onDone?.call();

  @override
  Future<void> stop() async {
    listening = false;
  }

  @override
  Future<void> cancel() async {
    listening = false;
    cancels += 1;
  }

  @override
  Future<void> dispose() async {
    disposed = true;
  }
}

/// Deterministic speech engine: records what was read aloud.
class FakeSpeechSynthesizer implements CareSpeechSynthesizer {
  final List<String> spoken = <String>[];
  bool stopped = false;
  int stops = 0;

  /// When true, `speak` waits until [stop] is called, so the test can tap the
  /// orb while the answer is still being read.
  bool hold = false;
  Completer<void>? _pending;

  @override
  Future<bool> initialize({required String localeTag}) async => true;

  @override
  Future<void> speak(String text, {required String localeTag}) async {
    spoken.add(text);
    if (!hold) {
      return;
    }
    _pending = Completer<void>();
    await _pending!.future;
    _pending = null;
  }

  @override
  Future<void> stop() async {
    stopped = true;
    stops += 1;
    _pending?.complete();
    _pending = null;
  }

  @override
  Future<void> dispose() async {
    _pending?.complete();
    _pending = null;
  }
}

/// Deterministic camera: no sensor, no permission dialog.
class FakeCamera implements CareCameraPort {
  FakeCamera({this.opens = true});

  bool opens;
  bool isOpen = false;
  int flips = 0;
  int closes = 0;

  @override
  Future<bool> open() async {
    isOpen = opens;
    return opens;
  }

  @override
  Future<void> flip() async {
    flips += 1;
  }

  @override
  Future<void> close() async {
    isOpen = false;
    closes += 1;
  }

  @override
  Widget buildPreview(BuildContext context) =>
      const ColoredBox(color: Color(0xFF102030));
}

class FakeVoiceEnvironment implements CareVoiceCallEnvironment {
  FakeVoiceEnvironment({
    FakeSpeechRecognizer? recognizer,
    FakeSpeechSynthesizer? synthesizer,
    FakeCamera? camera,
  })  : recognizer = recognizer ?? FakeSpeechRecognizer(),
        synthesizer = synthesizer ?? FakeSpeechSynthesizer(),
        camera = camera ?? FakeCamera();

  final FakeSpeechRecognizer recognizer;
  final FakeSpeechSynthesizer synthesizer;
  final FakeCamera camera;

  @override
  CareSpeechRecognizer createRecognizer() => recognizer;

  @override
  CareSpeechSynthesizer createSynthesizer() => synthesizer;

  @override
  CareCameraPort createCamera() => camera;
}

class Harness {
  const Harness({required this.records, required this.patients});

  final VisitRecordStore records;
  final PatientProfileStore patients;
}

Future<Harness> pumpApp(
  WidgetTester tester, {
  FakeVoiceEnvironment? voice,
  VisitRecordStore? records,
  PatientProfileStore? patients,
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
  await tester.pumpWidget(DoctorApp(
    records: recordStore,
    patients: patientStore,
    doctors: DoctorSelectionStore.memory(),
    directory: DoctorDirectory(directoryUrl: ''),
    conversationService: LocalCareConversationService(
      storage: InMemoryCareConversationStorage(),
      offlineResponder: (String content) =>
          buildOfflineAnswer(_zh, triageSymptoms(content).level),
      defaultTitle: careText(_zh, 'platform.care.sessions.defaultTitle'),
    ),
    voiceEnvironment: voice ?? FakeVoiceEnvironment(),
    initialLocale: _zh,
  ));
  await tester.pumpAndSettle();
  return Harness(records: recordStore, patients: patientStore);
}

/// Taps the navbar voice action and waits out the route transition without
/// `pumpAndSettle`, because the call orb breathes forever.
Future<void> openCall(WidgetTester tester) async {
  await tester.tap(find.byTooltip(_t('platform.care.call.open')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 60));
}

Future<void> closeCall(WidgetTester tester) async {
  await tester.tap(find.byKey(careCallHangUpKey));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the navbar puts the voice-call action left of the plus',
      (WidgetTester tester) async {
    await pumpApp(tester);

    final AppBar appBar = tester.widget<AppBar>(find.byType(AppBar).first);
    final List<Widget> actions = appBar.actions ?? const <Widget>[];
    final List<String?> tooltips = <String?>[
      for (final Widget action in actions)
        if (action is IconButton) action.tooltip,
    ];

    expect(tooltips, <String?>[
      _t('platform.care.call.open'),
      _t('platform.care.action.newConsultation'),
    ]);
    expect(
      (actions.first as IconButton).icon,
      isA<Icon>()
          .having((Icon icon) => icon.icon, 'icon', Icons.graphic_eq_rounded),
    );
    expect(find.byTooltip(_t('platform.care.call.open')), findsOneWidget);
  });

  testWidgets('the call opens on the active patient and starts listening',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice = FakeVoiceEnvironment();
    final Harness harness = await pumpApp(tester, voice: voice);
    await openCall(tester);

    expect(find.byKey(careCallScreenKey), findsOneWidget);
    expect(voice.recognizer.listening, isTrue);
    expect(
      find.text(carePatientLabel(_zh, harness.patients.active!)),
      findsOneWidget,
    );
    expect(find.text(_t('platform.care.call.listening')), findsOneWidget);
    expect(
      voice.synthesizer.spoken,
      contains(_t('platform.care.call.greeting')),
      reason: 'the doctor opens the call with a spoken greeting',
    );
    expect(find.byKey(careCallOrbKey), findsOneWidget);
    expect(find.byKey(careCallMicKey), findsOneWidget);
    expect(find.byKey(careCallCameraKey), findsOneWidget);
    expect(find.byKey(careCallHangUpKey), findsOneWidget);
  });

  testWidgets('a spoken turn is answered aloud and recorded',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice = FakeVoiceEnvironment();
    final Harness harness = await pumpApp(tester, voice: voice);
    await openCall(tester);

    voice.recognizer.hear('胸痛十分钟', isFinal: true);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));

    expect(harness.records.records, hasLength(1));
    final VisitRecord record = harness.records.records.first;
    expect(record.symptom, '胸痛十分钟');
    expect(record.level, TriageLevel.emergency);
    expect(record.mode, 'offline');
    expect(
      voice.synthesizer.spoken,
      contains(record.advice),
      reason: 'the answer is read aloud, not only shown',
    );

    await closeCall(tester);

    expect(find.byKey(careCallScreenKey), findsNothing);
    expect(
      find.descendant(
        of: find.byType(ChatTab),
        matching: find.text('胸痛十分钟'),
      ),
      findsOneWidget,
      reason: 'the spoken turn joins the same transcript as a typed turn',
    );
  });

  testWidgets(
      'tapping the orb interrupts the answer and reopens the microphone',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice = FakeVoiceEnvironment();
    await pumpApp(tester, voice: voice);
    await openCall(tester);
    voice.synthesizer.hold = true;

    voice.recognizer.hear('头晕两天', isFinal: true);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text(_t('platform.care.call.interrupt')), findsOneWidget);

    await tester.tap(find.byKey(careCallOrbKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(voice.synthesizer.stops, greaterThanOrEqualTo(1));
    expect(voice.recognizer.listening, isTrue);
    expect(find.text(_t('platform.care.call.listening')), findsOneWidget);

    await closeCall(tester);
  });

  testWidgets('the microphone can be muted and reopened',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice = FakeVoiceEnvironment();
    await pumpApp(tester, voice: voice);
    await openCall(tester);

    await tester.tap(find.byKey(careCallMicKey));
    await tester.pump();
    expect(voice.recognizer.cancels, greaterThanOrEqualTo(1));
    expect(find.text(_t('platform.care.call.muted')), findsOneWidget);

    await tester.tap(find.byKey(careCallMicKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(voice.recognizer.listening, isTrue);

    await closeCall(tester);
  });

  testWidgets('the camera switches the call into video mode',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice = FakeVoiceEnvironment();
    await pumpApp(tester, voice: voice);
    await openCall(tester);

    await tester.tap(find.byKey(careCallCameraKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(voice.camera.isOpen, isTrue);
    expect(find.byKey(careCallVideoPreviewKey), findsOneWidget);
    expect(find.byKey(careCallOrbKey), findsNothing);
    expect(find.byKey(careCallFlipKey), findsOneWidget);
    expect(find.text(_t('platform.care.call.videoTitle')), findsOneWidget);

    await tester.tap(find.byKey(careCallFlipKey));
    await tester.pump();
    expect(voice.camera.flips, 1);

    await tester.tap(find.byKey(careCallCameraKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(voice.camera.isOpen, isFalse);
    expect(find.byKey(careCallOrbKey), findsOneWidget);

    await closeCall(tester);
  });

  testWidgets('a denied camera keeps the call in voice mode',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice =
        FakeVoiceEnvironment(camera: FakeCamera(opens: false));
    await pumpApp(tester, voice: voice);
    await openCall(tester);

    await tester.tap(find.byKey(careCallCameraKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text(_t('platform.care.call.cameraDenied')), findsOneWidget);
    expect(find.byKey(careCallOrbKey), findsOneWidget);
    expect(find.byKey(careCallVideoPreviewKey), findsNothing);

    await closeCall(tester);
  });

  testWidgets(
      'without speech recognition the call says so and only offers exit',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice = FakeVoiceEnvironment(
      recognizer: FakeSpeechRecognizer(available: false),
    );
    await pumpApp(tester, voice: voice);
    await openCall(tester);

    expect(find.text(_t('platform.care.call.unavailable')), findsOneWidget);
    expect(find.byKey(careCallMicKey), findsNothing,
        reason: 'a control that cannot listen must not be shown');
    expect(find.byKey(careCallCameraKey), findsNothing);
    expect(find.byKey(careCallHangUpKey), findsOneWidget);

    await closeCall(tester);
    expect(find.byKey(careCallScreenKey), findsNothing);
    expect(find.widgetWithText(AppBar, _t('platform.care.nav.chat')),
        findsOneWidget);
  });

  testWidgets('a missed utterance keeps the call listening',
      (WidgetTester tester) async {
    final FakeVoiceEnvironment voice = FakeVoiceEnvironment();
    await pumpApp(tester, voice: voice);
    await openCall(tester);

    voice.recognizer.fail('no_match');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text(_t('platform.care.call.missed')), findsOneWidget);
    expect(find.byKey(careCallMicKey), findsOneWidget,
        reason: 'a silent turn is not a dead call');
    expect(find.byKey(careCallCameraKey), findsOneWidget);
    expect(voice.recognizer.listens, greaterThanOrEqualTo(2),
        reason: 'the microphone reopens for the next turn');

    await closeCall(tester);
  });

  testWidgets('without a patient file the call explains and exits',
      (WidgetTester tester) async {
    await pumpApp(
      tester,
      patients: PatientProfileStore.memory(profiles: <PatientProfile>[]),
    );
    await openCall(tester);

    expect(find.text(_t('platform.care.call.patientMissing')), findsOneWidget);
    expect(find.byKey(careCallMicKey), findsNothing);

    await closeCall(tester);
    expect(find.byKey(careCallScreenKey), findsNothing);
  });
}
