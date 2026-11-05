import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

/// Behaviour of the care conversation capability: the on-device transport, the
/// controller that feeds the drawer, and the drawer widget itself.

String _t(String key,
        {Map<String, String> params = const <String, String>{}}) =>
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
      final InMemoryCareConversationStorage storage =
          InMemoryCareConversationStorage();
      final LocalCareConversationService service = _service(storage: storage);

      final List<CareConversationSession> first = await service.listSessions();
      final List<CareConversationSession> second = await service.listSessions();

      expect(first, hasLength(1));
      expect(first.single.title, 'On-device triage');
      expect(first.single.doctor.isAi, isTrue,
          reason: 'every on-device conversation is with the AI family doctor');
      expect(second.single.id, first.single.id,
          reason: 'the seed is written once');
    });

    test('create, rename, and delete keep the list sorted and stored',
        () async {
      final InMemoryCareConversationStorage storage =
          InMemoryCareConversationStorage();
      DateTime now = DateTime.utc(2026, 11, 3, 4, 0);
      final LocalCareConversationService service =
          _service(storage: storage, now: () => now);

      await service.listSessions();
      now = now.add(const Duration(minutes: 1));
      final CareConversationSession created =
          await service.createSession(title: 'Second');

      List<CareConversationSession> sessions = await service.listSessions();
      expect(sessions.first.id, created.id);

      await service.renameSession(created.id, 'Renamed');
      sessions = await service.listSessions();
      expect(sessions.first.title, 'Renamed');
      expect(sessions.first.doctor.isAi, isTrue,
          reason: 'a rename must not drop the doctor attribution');

      await service.deleteSession(created.id);
      sessions = await service.listSessions();
      expect(sessions.single.id, isNot(created.id));
    });

    test('a stored human doctor attribution survives a reload and a rename',
        () async {
      final InMemoryCareConversationStorage storage =
          InMemoryCareConversationStorage();
      await storage.write(
        LocalCareConversationService.sessionsKey,
        jsonEncode(<Map<String, Object?>>[
          <String, Object?>{
            'id': 'session-human',
            'title': 'Cardiology follow-up',
            'updatedAt': DateTime.utc(2026, 11, 3, 4).toIso8601String(),
            'doctor': <String, Object?>{
              'kind': 'human',
              'id': 'doctor-lin-qinghe',
              'displayName': 'Lin Qinghe',
              'department': 'Cardiology',
            },
          },
        ]),
      );
      final LocalCareConversationService service = _service(storage: storage);

      CareConversationSession session = (await service.listSessions()).single;
      expect(session.doctor.isHuman, isTrue);
      expect(session.doctor.id, 'doctor-lin-qinghe');
      expect(session.doctor.displayName, 'Lin Qinghe');
      expect(session.doctor.department, 'Cardiology');

      await service.renameSession(session.id, 'Renamed by the family');
      session = (await service.listSessions()).single;
      expect(session.title, 'Renamed by the family');
      expect(session.doctor.isHuman, isTrue,
          reason: 'a rename must keep the human doctor on the session');
      expect(session.doctor.displayName, 'Lin Qinghe');
    });

    test('a stored session without an attribution reads as the AI doctor',
        () async {
      final InMemoryCareConversationStorage storage =
          InMemoryCareConversationStorage();
      await storage.write(
        LocalCareConversationService.sessionsKey,
        jsonEncode(<Map<String, Object?>>[
          <String, Object?>{
            'id': 'session-legacy',
            'title': 'Older conversation',
            'updatedAt': DateTime.utc(2026, 11, 3, 4).toIso8601String(),
          },
        ]),
      );

      final CareConversationSession session =
          (await _service(storage: storage).listSessions()).single;
      expect(session.doctor.isAi, isTrue,
          reason:
              'sessions written before attribution existed are AI sessions');
      expect(session.doctor.id, isEmpty);
    });

    test('a turn is stored in the active conversation', () async {
      final LocalCareConversationService service = _service(
        responder: (String content) => 'No red flag was found.',
      );
      final CareConversationSession session =
          (await service.listSessions()).single;

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

    test('pinning floats a session above newer ones and persists', () async {
      final MemoryCareSessionPinStorage pins = MemoryCareSessionPinStorage();
      // A deterministic clock keeps the two sessions distinguishable even on a
      // platform whose wall clock is coarser than a microsecond.
      DateTime clock = DateTime.utc(2026, 11, 3, 4);
      final LocalCareConversationService service = _service(now: () {
        final DateTime at = clock;
        clock = clock.add(const Duration(minutes: 1));
        return at;
      });
      final CareConversationsController controller =
          CareConversationsController(service: service, pinStorage: pins);
      addTearDown(controller.dispose);

      await controller.load();
      final String older = controller.sessions.single.id;
      await controller.createNew(title: 'Newest');
      final String newer = controller.sessions.first.id;
      expect(newer, isNot(older));

      await controller.togglePin(older);
      expect(controller.isPinned(older), isTrue);
      expect(controller.sessions.first.id, older,
          reason: 'a pinned session floats above a newer unpinned one');
      expect(await pins.read(), <String>[older]);

      await controller.togglePin(older);
      expect(controller.isPinned(older), isFalse);
      expect(controller.sessions.first.id, newer);
      expect(await pins.read(), isEmpty);
    });

    test('a stored pin is applied on the first load', () async {
      final LocalCareConversationService service = _service();
      await service.listSessions();
      final CareConversationSession older =
          (await service.listSessions()).single;
      await service.createSession(title: 'Newest');
      final MemoryCareSessionPinStorage pins =
          MemoryCareSessionPinStorage(<String>[older.id]);
      final CareConversationsController controller =
          CareConversationsController(service: service, pinStorage: pins);
      addTearDown(controller.dispose);

      await controller.load();
      expect(controller.sessions.first.id, older.id);
      expect(controller.isPinned(older.id), isTrue);
    });

    test('a transport failure surfaces as the controller error', () async {
      final CareConversationsController controller =
          CareConversationsController(
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

  testWidgets('the drawer prints the doctor each conversation belongs to',
      (WidgetTester tester) async {
    final CareConversationsController controller = CareConversationsController(
      service: _FixedSessionsService(<CareConversationSession>[
        CareConversationSession(
          id: 'session-ai',
          title: 'Night fever',
          updatedAt: DateTime.utc(2026, 11, 3, 4),
        ),
        CareConversationSession(
          id: 'session-human',
          title: 'Heart follow-up',
          updatedAt: DateTime.utc(2026, 11, 3, 3),
          doctor: const CareConversationDoctor.human(
            id: 'doctor-lin-qinghe',
            displayName: 'Lin Qinghe',
            department: 'Cardiology',
          ),
        ),
      ]),
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

    expect(
      find.text('platform.care.doctors.ai'),
      findsOneWidget,
      reason:
          'an AI session states the AI family doctor instead of staying blank',
    );
    expect(find.textContaining('Lin Qinghe · Cardiology'), findsOneWidget,
        reason: 'a human session prints its doctor name and department');
    expect(
      find.textContaining('platform.care.sessions.replied'),
      findsWidgets,
      reason: 'a human row states whether the doctor has replied',
    );
    expect(find.byIcon(Icons.smart_toy_outlined), findsOneWidget,
        reason: 'the AI row carries the robot identity mark');
  });

  testWidgets('long-pressing a conversation opens the row action menu',
      (WidgetTester tester) async {
    final LocalCareConversationService service = _service();
    await service.listSessions();
    final CareConversationsController controller =
        CareConversationsController(service: service);
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

    await tester.longPress(find.text('On-device triage'));
    await tester.pumpAndSettle();

    for (final String label in <String>[
      'platform.care.sessions.batch',
      'platform.care.sessions.rename',
      'platform.care.sessions.pin',
      'platform.care.sessions.delete',
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.byIcon(Icons.edit_outlined), findsOneWidget,
        reason: 'the menu carries the edit action instead of the row');
  });

  testWidgets('pinning from the menu floats the session to the top',
      (WidgetTester tester) async {
    final LocalCareConversationService service = _service();
    await service.listSessions();
    await service.createSession(title: 'Second conversation');
    final CareConversationsController controller =
        CareConversationsController(service: service);
    addTearDown(controller.dispose);
    await controller.load();
    final String newest = controller.sessions.first.id;

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

    await tester.longPress(find.text('On-device triage'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('platform.care.sessions.pin'));
    await tester.pumpAndSettle();

    expect(controller.isPinned(controller.sessions.first.id), isTrue);
    expect(controller.sessions.first.id, isNot(newest));
    expect(find.byIcon(Icons.push_pin), findsOneWidget,
        reason: 'a pinned row carries the pin mark');
  });

  testWidgets('batch mode deletes the selected conversations',
      (WidgetTester tester) async {
    final LocalCareConversationService service = _service();
    await service.listSessions();
    await service.createSession(title: 'Second conversation');
    final CareConversationsController controller =
        CareConversationsController(service: service);
    addTearDown(controller.dispose);
    await controller.load();
    expect(controller.sessions, hasLength(2));

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

    await tester.longPress(find.text('Second conversation'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('platform.care.sessions.batch'));
    await tester.pumpAndSettle();
    expect(find.byType(Checkbox), findsNWidgets(2));

    await tester.tap(find.text('platform.care.sessions.selectAll'));
    await tester.pumpAndSettle();
    expect(find.text('platform.care.sessions.selected'), findsOneWidget);

    await tester.tap(find.text('platform.care.sessions.delete'));
    await tester.pumpAndSettle();
    await tester.tap(
        find.widgetWithText(FilledButton, 'platform.care.sessions.delete'));
    await tester.pumpAndSettle();

    expect(controller.sessions, isEmpty);
    expect(find.text('platform.care.sessions.empty'), findsOneWidget);
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

/// Serves a fixed session list, so the drawer can be rendered with a human
/// doctor attribution the on-device transport cannot create yet.
class _FixedSessionsService implements CareConversationService {
  _FixedSessionsService(this._sessions);

  final List<CareConversationSession> _sessions;

  @override
  String get mode => 'offline';

  @override
  Future<List<CareConversationSession>> listSessions() async => _sessions;

  @override
  Future<CareConversationSession> createSession({String? title}) async =>
      _sessions.first;

  @override
  Future<void> deleteSession(String sessionId) async {}

  @override
  Future<List<CareConversationMessage>> listMessages(String sessionId) async =>
      const <CareConversationMessage>[];

  @override
  Future<void> renameSession(String sessionId, String title) async {}

  @override
  Future<String> sendTurn({
    required String sessionId,
    required String content,
    String? systemPrompt,
    String Function(String rawReply)? decorate,
  }) async =>
      '';
}
