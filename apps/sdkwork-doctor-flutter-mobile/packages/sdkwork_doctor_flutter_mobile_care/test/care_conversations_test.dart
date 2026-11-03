import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

/// Behaviour of the care conversation capability: the on-device transport, the
/// controller that feeds the drawer, and the drawer widget itself.

String _t(String key, {Map<String, String> params = const <String, String>{}}) =>
    key;

CareSessionsDrawerStyle get _style => const CareSessionsDrawerStyle(
      background: Colors.white,
      primary: Color(0xFF0A5CFF),
      primarySoft: Color(0xFFE7EFFF),
      ink: Color(0xFF0A1324),
      muted: Color(0xFF5A6B85),
      danger: Color(0xFFE5484D),
      divider: Color(0xFFE6EDF8),
    );

LocalCareConversationService _service({
  InMemoryCareConversationStorage? storage,
  String Function(String content)? responder,
  DateTime Function()? now,
}) =>
    LocalCareConversationService(
      storage: storage ?? InMemoryCareConversationStorage(),
      offlineResponder: responder ?? (String content) => 'answer: $content',
      defaultTitle: 'On-device triage',
      now: now,
    );

void main() {
  group('local conversation transport', () {
    test('seeds one on-device conversation and persists it', () async {
      final InMemoryCareConversationStorage storage = InMemoryCareConversationStorage();
      final LocalCareConversationService service = _service(storage: storage);

      final List<CareConversationSession> first = await service.listSessions();
      final List<CareConversationSession> second = await service.listSessions();

      expect(first, hasLength(1));
      expect(first.single.title, 'On-device triage');
      expect(second.single.id, first.single.id, reason: 'the seed is written once');
    });

    test('create, rename, and delete keep the list sorted and stored', () async {
      final InMemoryCareConversationStorage storage = InMemoryCareConversationStorage();
      DateTime now = DateTime.utc(2026, 11, 3, 4, 0);
      final LocalCareConversationService service =
          _service(storage: storage, now: () => now);

      await service.listSessions();
      now = now.add(const Duration(minutes: 1));
      final CareConversationSession created = await service.createSession(title: 'Second');

      List<CareConversationSession> sessions = await service.listSessions();
      expect(sessions.first.id, created.id);

      await service.renameSession(created.id, 'Renamed');
      sessions = await service.listSessions();
      expect(sessions.first.title, 'Renamed');

      await service.deleteSession(created.id);
      sessions = await service.listSessions();
      expect(sessions.single.id, isNot(created.id));
    });

    test('a turn is stored in the active conversation', () async {
      final LocalCareConversationService service = _service(
        responder: (String content) => 'No red flag was found.',
      );
      final CareConversationSession session = (await service.listSessions()).single;

      final String answer = await service.sendTurn(
        sessionId: session.id,
        content: 'fever',
        decorate: (String raw) => '$raw Stay safe.',
      );

      expect(answer, 'No red flag was found. Stay safe.');
      final List<CareConversationMessage> messages =
          await service.listMessages(session.id);
      expect(messages, hasLength(2));
      expect(messages.first.isUser, isTrue);
      expect(messages.first.text, 'fever');
      expect(messages.last.isUser, isFalse);
      expect(messages.last.text, answer);
    });
  });

  group('conversations controller', () {
    test('loads, opens, sends, and reports failures', () async {
      final LocalCareConversationService service = _service();
      final CareConversationsController controller =
          CareConversationsController(service: service);
      addTearDown(controller.dispose);

      await controller.load();
      expect(controller.sessions, hasLength(1));
      expect(controller.activeSessionId, controller.sessions.single.id);
      expect(controller.mode, 'offline');

      final String? reply = await controller.send('headache');
      expect(reply, 'answer: headache');
      expect(controller.messages, hasLength(2));
      expect(controller.error, isNull);

      final CareConversationSession created = await () async {
        await controller.createNew(title: 'Follow-up');
        return controller.activeSession!;
      }();
      expect(created.title, 'Follow-up');
      expect(controller.messages, isEmpty);
      expect(controller.sessions, hasLength(2));

      await controller.rename(created.id, 'Renamed session');
      expect(controller.activeSession!.title, 'Renamed session');

      await controller.delete(created.id);
      expect(controller.sessions, hasLength(1));
      expect(controller.activeSessionId, isNot(created.id));
    });

    test('a transport failure surfaces as the controller error', () async {
      final CareConversationsController controller = CareConversationsController(
        service: _FailingService(),
      );
      addTearDown(controller.dispose);

      await controller.load();
      expect(controller.error, 'agents API is unreachable');
      expect(controller.sessions, isEmpty);
    });
  });

  testWidgets('the drawer lists conversations and reports selection',
      (WidgetTester tester) async {
    final LocalCareConversationService service = _service();
    await service.listSessions();
    await service.createSession(title: 'Second conversation');
    final CareConversationsController controller =
        CareConversationsController(service: service);
    addTearDown(controller.dispose);
    await controller.load();

    CareConversationSession? selected;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        drawer: CareSessionsDrawer(
          controller: controller,
          translate: _t,
          style: _style,
          onSelected: (CareConversationSession session) => selected = session,
        ),
        body: const SizedBox.shrink(),
      ),
    ));
    final ScaffoldState state = tester.firstState(find.byType(Scaffold));
    state.openDrawer();
    await tester.pumpAndSettle();

    expect(find.text('SDKWork Doctor'), findsOneWidget);
    expect(find.text('Second conversation'), findsOneWidget);
    expect(find.text('platform.care.sessions.new'), findsOneWidget);

    await tester.tap(find.text('Second conversation'));
    await tester.pumpAndSettle();

    expect(selected?.title, 'Second conversation');
    expect(controller.activeSessionId, selected?.id);
  });

  testWidgets('the drawer shows the empty state', (WidgetTester tester) async {
    final CareConversationsController controller = CareConversationsController(
      service: _EmptyService(),
    );
    addTearDown(controller.dispose);
    await controller.load();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        drawer: CareSessionsDrawer(
          controller: controller,
          translate: _t,
          style: _style,
        ),
        body: const SizedBox.shrink(),
      ),
    ));
    tester.firstState<ScaffoldState>(find.byType(Scaffold)).openDrawer();
    await tester.pumpAndSettle();

    expect(find.text('platform.care.sessions.empty'), findsOneWidget);
  });
}

class _FailingService implements CareConversationService {
  @override
  String get mode => 'hosted';

  @override
  Future<CareConversationSession> createSession({String? title}) =>
      throw const CareConversationException('agents API is unreachable');

  @override
  Future<void> deleteSession(String sessionId) async {}

  @override
  Future<List<CareConversationMessage>> listMessages(String sessionId) async =>
      const <CareConversationMessage>[];

  @override
  Future<List<CareConversationSession>> listSessions() =>
      throw const CareConversationException('agents API is unreachable');

  @override
  Future<void> renameSession(String sessionId, String title) async {}

  @override
  Future<String> sendTurn({
    required String sessionId,
    required String content,
    String? systemPrompt,
    String Function(String rawReply)? decorate,
  }) =>
      throw const CareConversationException('agents API is unreachable');
}

class _EmptyService extends _FailingService {
  @override
  Future<List<CareConversationSession>> listSessions() async =>
      const <CareConversationSession>[];
}
