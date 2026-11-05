import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_agents_app_sdk/sdkwork_agents_app_sdk.dart';
import 'package:sdkwork_doctor_flutter_mobile/agent/care_agent.dart';
import 'package:sdkwork_doctor_flutter_mobile_care/sdkwork_doctor_flutter_mobile_care.dart';

/// Integration evidence for the hosted care transport: every call is a
/// generated Agents app SDK operation against `/app/v3/api`, carries the IAM
/// access token, and speaks the session / item / turn contract the PC, H5, and
/// mini program roots speak.

const String _accessToken = 'test-access-token';
const String _agentBasePath = '/app/v3/api/ai/agents/agent.family-doctor';

class RecordedRequest {
  RecordedRequest(this.method, this.path, this.query, this.headers, this.body);

  final String method;
  final String path;
  final String query;
  final Map<String, String> headers;
  final String body;

  Map<String, dynamic> get json => body.isEmpty
      ? const <String, dynamic>{}
      : jsonDecode(body) as Map<String, dynamic>;

  String? header(String name) {
    for (final MapEntry<String, String> entry in headers.entries) {
      if (entry.key.toLowerCase() == name.toLowerCase()) {
        return entry.value;
      }
    }
    return null;
  }
}

typedef RequestHandler = Future<void> Function(
  RecordedRequest request,
  HttpResponse response,
);

class FakeAgentsServer {
  FakeAgentsServer._(this._server);

  final HttpServer _server;
  final List<RecordedRequest> requests = <RecordedRequest>[];

  int get port => _server.port;

  static Future<FakeAgentsServer> start(RequestHandler handler) async {
    final HttpServer server =
        await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final FakeAgentsServer fake = FakeAgentsServer._(server);
    server.listen((HttpRequest request) async {
      final String body = await utf8.decoder.bind(request).join();
      final RecordedRequest recorded = RecordedRequest(
        request.method,
        request.uri.path,
        request.uri.query,
        <String, String>{
          for (final String name in <String>[
            'access-token',
            'authorization',
            'content-type',
            'accept',
          ])
            if (request.headers.value(name) != null)
              name: request.headers.value(name)!,
        },
        body,
      );
      fake.requests.add(recorded);
      try {
        await handler(recorded, request.response);
      } finally {
        await request.response.close();
      }
    });
    return fake;
  }

  Future<void> close() => _server.close(force: true);
}

void writeJson(HttpResponse response, Object payload, {int status = 200}) {
  response.statusCode = status;
  response.headers.contentType = ContentType.json;
  response.write(jsonEncode(payload));
}

Map<String, Object?> itemEnvelope(Map<String, Object?> item) =>
    <String, Object?>{
      'code': 0,
      'data': <String, Object?>{'item': item},
      'traceId': 'trace-item',
    };

Map<String, Object?> pageEnvelope(List<Map<String, Object?>> items) =>
    <String, Object?>{
      'code': 0,
      'data': <String, Object?>{
        'items': items,
        'pageInfo': <String, Object?>{'hasMore': false, 'nextCursor': null},
      },
      'traceId': 'trace-page',
    };

AgentsCareConversationService serviceFor(FakeAgentsServer server) =>
    AgentsCareConversationService(
      client: SdkworkAppClient.withBaseUrl(
        baseUrl: 'http://127.0.0.1:${server.port}',
        accessToken: _accessToken,
      ),
      agentId: 'agent.family-doctor',
      signer: const DoctorCarePayloadSigner(),
      now: () => DateTime.utc(2026, 11, 3, 4, 0),
      createId: () => 'care-id-1',
    );

void main() {
  group('transport mode', () {
    test('mode resolution never silently falls back from hosted', () {
      expect(
        resolveCareConversationMode(
            agentsApiBaseUrl: 'https://agents.example.com',
            hasAccessToken: true),
        'hosted',
      );
      expect(
        resolveCareConversationMode(
            agentsApiBaseUrl: 'https://agents.example.com',
            hasAccessToken: false),
        'offline',
      );
      expect(
        resolveCareConversationMode(agentsApiBaseUrl: '', hasAccessToken: true),
        'offline',
      );
      expect(
        createCareConversationService(
          agentsApiBaseUrl: '',
          getAccessToken: () => 'token',
          locale: () => 'en-US',
          localSessionTitle: 'On-device triage',
        ).mode,
        'offline',
      );
      expect(
        createCareConversationService(
          agentsApiBaseUrl: 'https://agents.example.com',
          getAccessToken: () => null,
          locale: () => 'en-US',
          localSessionTitle: 'On-device triage',
        ).mode,
        'offline',
      );
    });

    test('the agents base URL normalizes to the transport root', () {
      expect(resolveCareAgentsBaseUrl('https://agents.example.com/'),
          'https://agents.example.com');
      expect(
        resolveCareAgentsTransportBaseUrl(
            'https://agents.example.com$kAgentsApiPrefix/'),
        'https://agents.example.com',
      );
      expect(
        () => resolveCareAgentsBaseUrl(
            'https://agents.example.com/x$kAgentsApiPrefix/y'),
        throwsA(isA<CareConversationException>()),
      );
      expect(() => resolveCareAgentsBaseUrl('  '),
          throwsA(isA<CareConversationException>()));
    });
  });

  test('listSessions reads the paged envelope and orders newest first',
      () async {
    final FakeAgentsServer server = await FakeAgentsServer.start(
      (RecordedRequest request, HttpResponse response) async {
        writeJson(
          response,
          pageEnvelope(<Map<String, Object?>>[
            <String, Object?>{
              'sessionId': 'session-old',
              'title': 'Yesterday',
              'updatedAt': '2026-11-02T03:00:00Z',
            },
            <String, Object?>{
              'sessionId': 'session-new',
              'title': 'Today',
              'updatedAt': '2026-11-03T03:00:00Z',
            },
          ]),
        );
      },
    );
    addTearDown(server.close);

    final List<CareConversationSession> sessions =
        await serviceFor(server).listSessions();

    expect(
        sessions.map((CareConversationSession session) => session.id).toList(),
        <String>['session-new', 'session-old']);
    final RecordedRequest request = server.requests.single;
    expect(request.method, 'GET');
    expect(request.path, '$_agentBasePath/sessions');
    expect(request.query, contains('page_size=50'));
    expect(request.header('access-token'), _accessToken,
        reason: 'the IAM access token is carried by the generated SDK client');
  });

  test('createSession posts the agents session contract', () async {
    final FakeAgentsServer server = await FakeAgentsServer.start(
      (RecordedRequest request, HttpResponse response) async {
        writeJson(
          response,
          itemEnvelope(<String, Object?>{
            'sessionId': 'session-created',
            'title': 'New chat',
            'updatedAt': '2026-11-03T04:00:00Z',
          }),
          status: 201,
        );
      },
    );
    addTearDown(server.close);

    final CareConversationSession session =
        await serviceFor(server).createSession(title: 'New chat');

    expect(session.id, 'session-created');
    final RecordedRequest request = server.requests.single;
    expect(request.method, 'POST');
    expect(request.path, '$_agentBasePath/sessions');
    expect(request.json['sessionKind'], 'assistant');
    expect(request.json['entrySurface'], 'flutter');
    expect(request.json['title'], 'New chat');
    expect(request.json['idempotencyKey'], 'care-id-1');
    expect(request.json['payloadHash'] as String, startsWith('care.v1:'));
    expect(request.json['requestedAt'], '2026-11-03T04:00:00.000Z');
  });

  test('renameSession and deleteSession address the session resource',
      () async {
    final FakeAgentsServer server = await FakeAgentsServer.start(
      (RecordedRequest request, HttpResponse response) async {
        if (request.method == 'DELETE') {
          response.statusCode = 204;
          return;
        }
        writeJson(
          response,
          itemEnvelope(<String, Object?>{
            'sessionId': 'session-1',
            'title': 'Renamed',
            'updatedAt': '2026-11-03T04:00:00Z',
          }),
        );
      },
    );
    addTearDown(server.close);

    final AgentsCareConversationService service = serviceFor(server);
    await service.renameSession('session-1', 'Renamed');
    await service.deleteSession('session-1');

    expect(server.requests, hasLength(2));
    expect(server.requests.first.method, 'PATCH');
    expect(server.requests.first.path, '$_agentBasePath/sessions/session-1');
    expect(server.requests.first.json['title'], 'Renamed');
    expect(server.requests.last.method, 'DELETE');
    expect(server.requests.last.path, '$_agentBasePath/sessions/session-1');
  });

  test('listMessages renders only the visible transcript, oldest first',
      () async {
    final FakeAgentsServer server = await FakeAgentsServer.start(
      (RecordedRequest request, HttpResponse response) async {
        writeJson(
          response,
          pageEnvelope(<Map<String, Object?>>[
            <String, Object?>{
              'itemId': 'item-3',
              'kind': 'assistant_output',
              'content': 'Monitor for 24-48 hours.',
              'sequence': '3',
              'createdAt': '2026-11-03T04:01:00Z',
            },
            <String, Object?>{
              'itemId': 'item-2',
              'kind': 'reasoning',
              'content': 'internal thinking',
              'sequence': '2',
              'createdAt': '2026-11-03T04:00:30Z',
            },
            <String, Object?>{
              'itemId': 'item-1',
              'kind': 'user_input',
              'content': 'Child has a fever',
              'sequence': '1',
              'createdAt': '2026-11-03T04:00:00Z',
            },
          ]),
        );
      },
    );
    addTearDown(server.close);

    final List<CareConversationMessage> messages =
        await serviceFor(server).listMessages('session-1');

    expect(messages, hasLength(2));
    expect(messages.first.isUser, isTrue);
    expect(messages.first.text, 'Child has a fever');
    expect(messages.last.isUser, isFalse);
    expect(messages.last.text, 'Monitor for 24-48 hours.');
    expect(server.requests.single.path,
        '$_agentBasePath/sessions/session-1/items');
    expect(server.requests.single.query, contains('sort=-sequence'));
  });

  test('sendTurn streams the kernel-v1 frames and returns the answer',
      () async {
    final FakeAgentsServer server = await FakeAgentsServer.start(
      (RecordedRequest request, HttpResponse response) async {
        response.statusCode = 200;
        response.headers.contentType = ContentType('text', 'event-stream');
        response.write('data: {"eventType":"delta","delta":"Call local "}\n\n');
        response.write(
            'data: {"eventType":"delta","delta":"emergency services now."}\n\n');
        response.write('data: ${jsonEncode(<String, Object?>{
              'eventType': 'completion',
              'response': <String, Object?>{
                'code': 0,
                'data': <String, Object?>{
                  'item': <String, Object?>{
                    'items': <Map<String, Object?>>[
                      <String, Object?>{
                        'kind': 'assistant_output',
                        'content': 'Call local emergency services now.',
                      },
                    ],
                  },
                },
                'traceId': 'trace-turn',
              },
            })}\n\n');
      },
    );
    addTearDown(server.close);

    final String answer = await serviceFor(server).sendTurn(
      sessionId: 'session-1',
      content: 'chest pain',
      systemPrompt: 'You are the family doctor.',
      decorate: (String raw) => 'LEAD $raw',
    );

    expect(answer, 'LEAD Call local emergency services now.');
    final RecordedRequest request = server.requests.single;
    expect(request.method, 'POST');
    expect(request.path, '$_agentBasePath/sessions/session-1/turns');
    expect(request.query, contains('stream=true'));
    expect(request.query, contains('event_protocol=kernel-v1'));
    expect(request.header('accept'), 'text/event-stream');
    expect(request.json['turnMode'], 'interactive');
    expect(request.json['contentType'], 'text/plain');
    expect(request.json['systemPrompt'], 'You are the family doctor.');
    expect(request.json['payloadHash'] as String, startsWith('care.v1:'));
  });

  test('an API failure surfaces as CareConversationException', () async {
    final FakeAgentsServer server = await FakeAgentsServer.start(
      (RecordedRequest request, HttpResponse response) async {
        writeJson(
          response,
          <String, Object?>{
            'code': 403,
            'detail': 'ai.agents.manage is required',
            'traceId': 'trace-forbidden',
          },
          status: 403,
        );
      },
    );
    addTearDown(server.close);

    await expectLater(
      serviceFor(server).listSessions(),
      throwsA(isA<CareConversationException>()
          .having(
              (CareConversationException error) => error.status, 'status', 403)
          .having((CareConversationException error) => error.traceId, 'traceId',
              'trace-forbidden')
          .having((CareConversationException error) => error.message, 'message',
              'ai.agents.manage is required')),
    );
  });
}
