import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

/// Minimal transport that answers nothing: a human consultation must not need it.
class _EmptyService implements CareConversationService {
  @override
  String get mode => 'offline';

  @override
  Future<List<CareConversationSession>> listSessions() async =>
      <CareConversationSession>[];

  @override
  Future<CareConversationSession> createSession({String? title}) async =>
      CareConversationSession(
        id: 'ai-1',
        title: title ?? '',
        updatedAt: DateTime.utc(2026, 11, 3, 8),
      );

  @override
  Future<void> renameSession(String sessionId, String title) async {}

  @override
  Future<void> deleteSession(String sessionId) async {}

  @override
  Future<List<CareConversationMessage>> listMessages(String sessionId) async =>
      const <CareConversationMessage>[];

  @override
  Future<String> sendTurn({
    required String sessionId,
    required String content,
    String? systemPrompt,
    String Function(String rawReply)? decorate,
  }) async =>
      'AI answer';
}

const CareConversationDoctor _lin = CareConversationDoctor.human(
  id: 'doctor-lin-qinghe',
  displayName: 'Lin Qinghe',
  department: 'Cardiology',
);

CareHumanConsultationStore _store([MemoryCareHumanConsultationStorage? storage]) =>
    CareHumanConsultationStore(
      storage: storage ?? MemoryCareHumanConsultationStorage(),
      now: () => DateTime.utc(2026, 11, 3, 12),
    );

void main() {
  test('a human consultation stores its doctor, member, and opening reason', () async {
    final CareHumanConsultationStore store = _store();
    final CareConversationSession session = await store.start(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'chest tightness after dinner',
    );

    expect(session.isHuman, isTrue);
    expect(session.isActive, isTrue);
    expect(session.doctor.id, 'doctor-lin-qinghe');
    expect(session.doctor.displayName, 'Lin Qinghe');
    expect(session.doctor.department, 'Cardiology');
    expect(session.memberLabel, 'Self · Me');
    expect(session.title, 'chest tightness after dinner');
    expect(session.unreadCount, 0);
    expect(session.awaitingDoctor, isTrue);
    expect(session.preview, startsWith(kCarePatientPreviewPrefix));
    expect(carePreviewText(session.preview), 'chest tightness after dinner');
    expect(store.messages(session.id), hasLength(1));
    expect(store.messages(session.id).single.isUser, isTrue);
    expect(store.messages(session.id).single.text, 'chest tightness after dinner');
  });

  test('a second tap continues the open conversation with the same doctor', () async {
    final CareHumanConsultationStore store = _store();
    final CareConversationSession first = await store.start(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'chest tightness',
    );
    final CareConversationSession second = await store.start(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'worse after climbing stairs',
    );

    expect(second.id, first.id);
    expect(store.sessions, hasLength(1));
    expect(store.messages(first.id), hasLength(2));
  });

  test('a doctor reply is unread until the family opens the conversation', () async {
    final CareHumanConsultationStore store = _store();
    final CareConversationSession session = await store.start(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'chest tightness',
    );

    await store.appendDoctorReply(session.id, 'Come in tomorrow for an ECG.');
    CareConversationSession replied = store.find(session.id)!;
    expect(replied.unreadCount, 1);
    expect(replied.awaitingDoctor, isFalse);
    expect(replied.preview, startsWith(kCareDoctorPreviewPrefix));

    await store.appendDoctorReply(session.id, 'Bring the medication list.');
    replied = store.find(session.id)!;
    expect(replied.unreadCount, 2);

    await store.markRead(session.id);
    expect(store.find(session.id)!.unreadCount, 0);
    expect(store.messages(session.id).where((metric) => !metric.isUser), hasLength(2));
  });

  test('a patient turn after a reply marks the conversation as waiting again', () async {
    final CareHumanConsultationStore store = _store();
    final CareConversationSession session = await store.start(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'chest tightness',
    );
    await store.appendDoctorReply(session.id, 'Noted.');
    await store.appendPatientMessage(session.id, 'It is worse today.');
    expect(store.find(session.id)!.awaitingDoctor, isTrue);
  });

  test('ending a consultation keeps the transcript and refuses new turns', () async {
    final CareHumanConsultationStore store = _store();
    final CareConversationSession session = await store.start(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'chest tightness',
    );
    await store.end(session.id);
    expect(store.find(session.id)!.isActive, isFalse);
    expect(store.find(session.id)!.endedAt, isNotNull);

    await store.appendPatientMessage(session.id, 'Are you there?');
    expect(store.messages(session.id), hasLength(1));
  });

  test('consultations persist across a store restart', () async {
    final MemoryCareHumanConsultationStorage storage =
        MemoryCareHumanConsultationStorage();
    final CareHumanConsultationStore store = _store(storage);
    final CareConversationSession session = await store.start(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'chest tightness',
    );
    await store.appendDoctorReply(session.id, 'Come in tomorrow.');

    final CareHumanConsultationStore reloaded = CareHumanConsultationStore(
      storage: storage,
      now: () => DateTime.utc(2026, 11, 3, 12),
    );
    await reloaded.load();
    expect(reloaded.sessions, hasLength(1));
    final CareConversationSession restored = reloaded.sessions.single;
    expect(restored.id, session.id);
    expect(restored.doctor.displayName, 'Lin Qinghe');
    expect(restored.unreadCount, 1);
    expect(reloaded.messages(session.id), hasLength(2));
  });

  test('the controller starts, sends, and receives a doctor reply', () async {
    final CareHumanConsultationStore store = _store();
    final CareConversationsController controller = CareConversationsController(
      service: _EmptyService(),
      humanStore: store,
    );
    addTearDown(controller.dispose);
    await controller.load();

    final CareConversationSession? started = await controller.startHumanConsultation(
      doctor: _lin,
      memberLabel: 'Self · Me',
      reason: 'chest tightness',
    );
    expect(started, isNotNull);
    expect(controller.activeIsHuman, isTrue);
    expect(controller.activeSessionId, started!.id);
    expect(controller.messages, hasLength(1));

    await controller.sendPatientMessage('worse after climbing stairs');
    expect(controller.messages, hasLength(2));
    expect(controller.unreadTotal, 0);

    await controller.replyAsDoctor(started.id, 'Come in tomorrow.');
    expect(controller.messages, hasLength(3));
    // The open conversation is on screen, so its reply is already read.
    expect(controller.unreadTotal, 0);

    await controller.select('');
    await controller.replyAsDoctor(started.id, 'Bring your medication list.');
    expect(controller.unreadTotal, 1);
  });
}
