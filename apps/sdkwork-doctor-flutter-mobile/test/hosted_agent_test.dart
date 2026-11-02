import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sdkwork_doctor_flutter_mobile/agent/care_agent.dart';
import 'package:sdkwork_doctor_flutter_mobile/family.dart';
import 'package:sdkwork_doctor_flutter_mobile/triage.dart';

const String _sessionId = 'session.family.001';
final List<Map<String, dynamic>> _received = <Map<String, dynamic>>[];

HttpServer? _server;
String _baseUrl = '';

Map<String, dynamic> _envelope(Object item) => <String, dynamic>{
      'code': 0,
      'traceId': 'trace-test',
      'data': <String, dynamic>{'item': item},
    };

Map<String, dynamic> _item(String text, {String status = 'completed'}) => <String, dynamic>{
      'session': <String, dynamic>{'sessionId': _sessionId},
      'turn': <String, dynamic>{'turnId': 'turn.1', 'status': status},
      'items': <Map<String, dynamic>>[
        <String, dynamic>{'itemId': 'item.user.1', 'kind': 'user_input', 'content': 'symptom'},
        <String, dynamic>{'itemId': 'item.assistant.1', 'kind': 'assistant_output', 'content': text},
      ],
    };

Future<void> _json(HttpRequest request, int status, Object payload) async {
  request.response.statusCode = status;
  request.response.headers.contentType = ContentType.json;
  request.response.write(jsonEncode(payload));
  await request.response.close();
}

Future<void> _sse(HttpRequest request, Map<String, dynamic> item) async {
  request.response.headers.contentType = ContentType('text', 'event-stream');
  request.response.write('data: ${jsonEncode(<String, dynamic>{'eventType': 'delta', 'delta': 'Rest '})}\r\n\r\n');
  request.response.write('data: ${jsonEncode(<String, dynamic>{'eventType': 'delta', 'delta': 'and fluids.'})}\r\n\r\n');
  request.response.write('data: ${jsonEncode(<String, dynamic>{'eventType': 'completion', 'response': _envelope(item)})}\r\n\r\n');
  await request.response.close();
}

Future<void> _handle(HttpRequest request) async {
  final String raw = await utf8.decoder.bind(request).join();
  final Map<String, dynamic> body = raw.isEmpty ? <String, dynamic>{} : jsonDecode(raw) as Map<String, dynamic>;
  _received.add(<String, dynamic>{
    'path': request.uri.path,
    'query': request.uri.query,
    'authorization': request.headers.value(HttpHeaders.authorizationHeader),
    'body': body,
  });
  if (request.headers.value(HttpHeaders.authorizationHeader) != 'Bearer test-token') {
    await _json(request, 401, <String, dynamic>{'status': 401, 'code': 40101, 'detail': 'missing access token'});
    return;
  }
  final String path = request.uri.path;
  if (path.endsWith('/sessions') && request.method == 'POST') {
    await _json(request, 201, _envelope(<String, dynamic>{'sessionId': _sessionId}));
    return;
  }
  if (path.endsWith('/turns') && request.method == 'POST') {
    final String content = (body['content'] as String?) ?? '';
    if (content.contains('FORBIDDEN')) {
      await _json(request, 403, <String, dynamic>{
        'status': 403,
        'code': 40301,
        'traceId': 'trace-forbidden',
        'detail': 'permission ai.agents.use denied',
      });
      return;
    }
    if (content.contains('FAIL_TURN')) {
      await _json(request, 200, _envelope(_item('', status: 'failed')));
      return;
    }
    final String text = content.contains('REASSURANCE')
        ? 'Probably nothing serious. Take a rest and drink water.'
        : content.contains('REPLY_REDFLAG')
            ? 'If you develop chest pain or cannot breathe, call emergency services.'
            : 'Rest and fluids. Monitor for 24 hours.';
    if (request.uri.query.contains('stream=true')) {
      await _sse(request, _item(text));
      return;
    }
    await _json(request, 200, _envelope(_item(text)));
    return;
  }
  await _json(request, 404, <String, dynamic>{'status': 404, 'code': 40401, 'detail': 'unknown route'});
}

void main() {
  setUpAll(() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _baseUrl = 'http://127.0.0.1:${_server!.port}';
    _server!.listen((HttpRequest request) {
      _handle(request).catchError((Object error) async {
        request.response.statusCode = 500;
        await request.response.close();
      });
    });
  });

  tearDownAll(() async {
    await _server?.close(force: true);
  });

  setUp(() => _received.clear());

  HostedCareAgent agent({String? Function()? token, bool stream = false, void Function(String)? onDelta}) =>
      HostedCareAgent(
        agentsApiBaseUrl: _baseUrl,
        getAccessToken: token ?? () => 'test-token',
        stream: stream,
        onDelta: onDelta,
      );

  test('creates one session and completes a non-streaming turn', () async {
    final HostedCareAgent care = agent();
    final CareMessage reply = await care.send('LEGACY_OK headache since yesterday', demoSelfMember);

    expect(reply.role, 'assistant');
    expect(reply.text, contains('Rest and fluids'));
    expect(care.history.length, 2);

    final List<Map<String, dynamic>> sessions =
        _received.where((Map<String, dynamic> r) => (r['path'] as String).endsWith('/sessions')).toList();
    expect(sessions.length, 1);
    final Map<String, dynamic> sessionBody = sessions.single['body'] as Map<String, dynamic>;
    expect(sessionBody['sessionKind'], 'assistant');
    expect(sessionBody['entrySurface'], 'flutter');
    expect(sessionBody['payloadHash'], startsWith('care.v1:'));

    final Map<String, dynamic> turn =
        _received.firstWhere((Map<String, dynamic> r) => (r['path'] as String).endsWith('/turns'));
    expect(turn['query'], 'stream=false');
    expect(turn['authorization'], 'Bearer test-token');
    final Map<String, dynamic> turnBody = turn['body'] as Map<String, dynamic>;
    expect(turnBody['turnMode'], 'interactive');
    expect(turnBody['contentType'], 'text/plain');
    expect(turnBody['idempotencyKey'], turnBody['clientRequestId']);
    expect(turnBody['payloadHash'], startsWith('care.v1:'));
    expect(turnBody['systemPrompt'], contains('family private doctor'));
  });

  test('a second send reuses the session', () async {
    final HostedCareAgent care = agent();
    await care.send('LEGACY_OK first', demoSelfMember);
    await care.send('LEGACY_OK second', demoSelfMember);
    expect(_received.where((Map<String, dynamic> r) => (r['path'] as String).endsWith('/sessions')).length, 1);
    expect(care.history.length, 4);
  });

  test('the streaming transport surfaces deltas', () async {
    final List<String> deltas = <String>[];
    final HostedCareAgent care = agent(stream: true, onDelta: deltas.add);
    final CareMessage reply = await care.send('LEGACY_OK streaming', demoSelfMember);
    expect(deltas, <String>['Rest ', 'and fluids.']);
    expect(reply.text, contains('Rest and fluids.'));
    final Map<String, dynamic> turn =
        _received.firstWhere((Map<String, dynamic> r) => (r['path'] as String).endsWith('/turns'));
    expect(turn['query'], contains('stream=true'));
    expect(turn['query'], contains('event_protocol=kernel-v1'));
  });

  test('a hosted answer never softens an emergency red flag', () async {
    final CareMessage reply = await agent().send('chest pain for 10 minutes REASSURANCE', demoSelfMember);
    expect(reply.level, TriageLevel.emergency);
    expect(reply.text, startsWith('Emergency red flag detected.'));
    expect(reply.text, contains('Call local emergency services now.'));
    expect(reply.text, contains('Probably nothing serious'));
  });

  test('a red flag inside the hosted answer promotes the turn', () async {
    final CareMessage reply = await agent().send('mild headache REPLY_REDFLAG', demoSelfMember);
    expect(reply.level, TriageLevel.emergency);
    expect(reply.text, startsWith('Emergency red flag detected.'));
  });

  test('a problem response raises a typed transport error', () async {
    final HostedCareAgent care = agent();
    await expectLater(
      care.send('FORBIDDEN topic', demoSelfMember),
      throwsA(isA<CareAgentException>()
          .having((CareAgentException e) => e.status, 'status', 403)
          .having((CareAgentException e) => e.traceId, 'traceId', 'trace-forbidden')),
    );
    expect(care.history, isEmpty);
  });

  test('a failed durable turn raises a typed error', () async {
    await expectLater(agent().send('FAIL_TURN headache', demoSelfMember), throwsA(isA<CareAgentException>()));
  });

  test('a hosted configuration without a token is rejected, never downgraded', () async {
    await expectLater(
      agent(token: () => null).send('LEGACY_OK hi', demoSelfMember),
      throwsA(isA<CareAgentException>()),
    );
  });

  test('runtime selection is explicit and observable', () {
    expect(resolveCareAgentMode(agentsApiBaseUrl: _baseUrl, hasAccessToken: true), 'hosted');
    expect(resolveCareAgentMode(agentsApiBaseUrl: _baseUrl, hasAccessToken: false), 'offline');
    expect(resolveCareAgentMode(agentsApiBaseUrl: '', hasAccessToken: true), 'offline');
    expect(createCareAgent(agentsApiBaseUrl: '', getAccessToken: () => 'token').mode, 'offline');
    expect(createCareAgent(agentsApiBaseUrl: _baseUrl, getAccessToken: () => null).mode, 'offline');
  });

  test('base URL normalization rejects an embedded surface prefix', () {
    expect(resolveCareAgentsBaseUrl('https://agents.example.com/'), 'https://agents.example.com');
    expect(
      resolveCareAgentsBaseUrl('https://agents.example.com$kAgentsApiPrefix/'),
      'https://agents.example.com',
    );
    expect(() => resolveCareAgentsBaseUrl('https://agents.example.com/x$kAgentsApiPrefix/y'), throwsA(isA<CareAgentException>()));
    expect(() => resolveCareAgentsBaseUrl('  '), throwsA(isA<CareAgentException>()));
  });
}
