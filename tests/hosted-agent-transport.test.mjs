import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

import './support/ts-resolve.mjs';

const repoRoot = new URL('../', import.meta.url);
const agentModulePath = new URL(
  'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-agent/src/index.ts',
  repoRoot,
).href;

const {
  createHostedCareAgent,
  createCareAgentRuntime,
  resolveCareAgentsBaseUrl,
  careTurnPayloadHash,
  CareAgentAuthError,
  CareAgentHttpError,
  CareAgentTurnFailedError,
  FAMILY_DOCTOR_AGENT_ID,
  CARE_AGENTS_API_PREFIX,
} = await import(agentModulePath);

const SESSION_ID = 'session.family.001';
const SESSIONS_PATH = `${CARE_AGENTS_API_PREFIX}/ai/agents/${FAMILY_DOCTOR_AGENT_ID}/sessions`;
const TURN_PATH = `${SESSIONS_PATH}/${SESSION_ID}/turns`;

const MEMBER = Object.freeze({
  id: 'member-self',
  displayName: 'Me',
  relation: 'self',
  birthYear: 1990,
  sex: 'unspecified',
  allergies: ['penicillin'],
  chronicConditions: ['hypertension'],
  medications: ['amlodipine 5mg'],
});

const replied = {
  ok: 'Rest and fluids. Monitor for 24 hours.',
  reassurance: 'Probably nothing serious. Take a rest and drink water.',
  redFlag: 'If you develop chest pain or cannot breathe, call emergency services.',
};

let server;
let baseUrl;
let received = [];

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => resolve(raw));
  });
}

function envelope(item) {
  return { code: 0, traceId: 'trace-' + String(Date.now()), data: { item } };
}

function sessionRecord() {
  return { sessionId: SESSION_ID, title: 'Family doctor conversation', updatedAt: new Date().toISOString(), version: '1' };
}

function turnRecord(status = 'completed', errorCode = null) {
  return { turnId: 'turn.1', status, errorCode, errorDetail: errorCode ? 'provider unavailable' : null };
}

function turnItem(text, status = 'completed') {
  return {
    session: sessionRecord(),
    turn: turnRecord(status),
    items: [
      { itemId: 'item.user.1', kind: 'user_input', content: 'symptom', sequence: '1' },
      { itemId: 'item.assistant.1', kind: 'assistant_output', content: text, sequence: '2' },
    ],
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'X-Trace-Id': 'trace-header' });
  response.end(JSON.stringify(payload));
}

function sendProblem(response, status, code, detail) {
  response.writeHead(status, { 'Content-Type': 'application/problem+json' });
  response.end(JSON.stringify({ type: 'about:blank', title: 'Forbidden', status, code, traceId: 'trace-forbidden', detail }));
}

function sendSse(response, item) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const frames = [
    { eventType: 'delta', delta: 'Rest ' },
    { eventType: 'delta', delta: 'and fluids.' },
    { eventType: 'completion', response: { code: 0, traceId: 'trace-stream', data: { item } } },
  ];
  for (const frame of frames) {
    response.write('data: ' + JSON.stringify(frame) + '\r\n\r\n');
  }
  response.end();
}

before(async () => {
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const raw = await readBody(request);
    const body = raw ? JSON.parse(raw) : null;
    received.push({ method: request.method, path: url.pathname, search: url.search, headers: request.headers, body });

    if (request.headers.authorization !== 'Bearer test-token') {
      sendProblem(response, 401, 40101, 'missing access token');
      return;
    }
    if (url.pathname === SESSIONS_PATH && request.method === 'POST') {
      sendJson(response, 201, envelope(sessionRecord()));
      return;
    }
    if (url.pathname === TURN_PATH && request.method === 'POST') {
      const content = String(body?.content ?? '');
      if (content.includes('FORBIDDEN')) {
        sendProblem(response, 403, 40301, 'permission ai.agents.use denied');
        return;
      }
      if (content.includes('FAIL_TURN')) {
        sendJson(response, 200, envelope(turnItem('', 'failed')));
        return;
      }
      const text = content.includes('REASSURANCE')
        ? replied.reassurance
        : content.includes('REPLY_REDFLAG')
          ? replied.redFlag
          : replied.ok;
      if (url.searchParams.get('stream') === 'true') {
        sendSse(response, turnItem(text));
        return;
      }
      sendJson(response, 200, envelope(turnItem(text)));
      return;
    }
    sendProblem(response, 404, 40401, 'unknown route ' + url.pathname);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + String(server.address().port);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function newPort(overrides = {}) {
  return createHostedCareAgent({
    agentsApiBaseUrl: baseUrl,
    accessTokens: { getAccessToken: () => 'test-token' },
    entrySurface: 'pc',
    ...overrides,
  });
}

test('hosted adapter creates one session and completes a non-streaming turn', async () => {
  received = [];
  const port = newPort({ stream: false });
  assert.equal(port.mode, 'hosted');
  const reply = await port.send('LEGACY_OK headache since yesterday', { member: MEMBER });

  assert.equal(reply.role, 'assistant');
  assert.match(reply.text, /Rest and fluids/u);
  assert.equal(port.history().length, 2);
  assert.equal(port.history()[0].role, 'user');

  const sessionRequests = received.filter((entry) => entry.path === SESSIONS_PATH);
  assert.equal(sessionRequests.length, 1, 'one session create');
  assert.equal(sessionRequests[0].body.sessionKind, 'assistant');
  assert.equal(sessionRequests[0].body.entrySurface, 'pc');
  assert.match(sessionRequests[0].body.payloadHash, /^care\.v1:[0-9a-f]{32}$/u);
  assert.match(sessionRequests[0].body.idempotencyKey, /^[0-9a-f-]{36}$/u);

  const turnRequests = received.filter((entry) => entry.path === TURN_PATH);
  assert.equal(turnRequests.length, 1);
  assert.equal(turnRequests[0].search, '?stream=false');
  assert.equal(turnRequests[0].headers.authorization, 'Bearer test-token');
  assert.equal(turnRequests[0].body.turnMode, 'interactive');
  assert.equal(turnRequests[0].body.contentType, 'text/plain');
  assert.match(turnRequests[0].body.payloadHash, /^care\.v1:[0-9a-f]{32}$/u);
  assert.equal(turnRequests[0].body.idempotencyKey, turnRequests[0].body.clientRequestId);
  assert.ok(!Number.isNaN(Date.parse(turnRequests[0].body.requestedAt)));
  assert.match(turnRequests[0].body.systemPrompt, /penicillin/u);
  assert.match(turnRequests[0].body.systemPrompt, /hypertension/u);
});

test('a second send reuses the session', async () => {
  received = [];
  const port = newPort({ stream: false });
  await port.send('LEGACY_OK first', { member: MEMBER });
  await port.send('LEGACY_OK second', { member: MEMBER });
  assert.equal(received.filter((entry) => entry.path === SESSIONS_PATH).length, 1);
  assert.equal(received.filter((entry) => entry.path === TURN_PATH).length, 2);
  assert.equal(port.history().length, 4);
});

test('the streaming transport surfaces deltas and the completion item', async () => {
  received = [];
  const deltas = [];
  const port = newPort({ onDelta: (delta) => deltas.push(delta) });
  const reply = await port.send('LEGACY_OK streaming', { member: MEMBER });
  assert.deepEqual(deltas, ['Rest ', 'and fluids.']);
  assert.match(reply.text, /Rest and fluids\./u);
  const turnRequest = received.find((entry) => entry.path === TURN_PATH);
  assert.match(turnRequest.search, /stream=true/u);
  assert.match(turnRequest.search, /event_protocol=kernel-v1/u);
});

test('a hosted answer can never soften an emergency red flag', async () => {
  const port = newPort({ stream: false });
  const reply = await port.send('chest pain for 10 minutes REASSURANCE', { member: MEMBER });
  assert.equal(reply.triage.level, 'emergency');
  assert.equal(reply.triage.escalate, true);
  assert.match(reply.text, /^Emergency red flag detected\./u);
  assert.match(reply.text, /Call local emergency services now\./u);
  assert.match(reply.text, /Probably nothing serious/u, 'the hosted answer is preserved after the escalation');
});

test('a red flag inside the hosted answer promotes the turn to emergency', async () => {
  const port = newPort({ stream: false });
  const reply = await port.send('mild headache REPLY_REDFLAG', { member: MEMBER });
  assert.equal(reply.triage.level, 'emergency');
  assert.match(reply.text, /^Emergency red flag detected\./u);
});

test('a routine exchange stays routine and keeps the safety line', async () => {
  const port = newPort({ stream: false });
  const reply = await port.send('LEGACY_OK mild headache', { member: MEMBER });
  assert.equal(reply.triage.level, 'routine');
  assert.match(reply.text, /not a diagnosis/u);
});

test('a problem response becomes a typed transport error with traceId', async () => {
  const port = newPort({ stream: false });
  await assert.rejects(
    () => port.send('FORBIDDEN topic', { member: MEMBER }),
    (error) => {
      assert.ok(error instanceof CareAgentHttpError);
      assert.equal(error.status, 403);
      assert.equal(error.code, 40301);
      assert.equal(error.traceId, 'trace-forbidden');
      return true;
    },
  );
  assert.equal(port.history().length, 0, 'a failed turn commits no message');
});

test('a failed durable turn becomes a typed turn error', async () => {
  const port = newPort({ stream: false });
  await assert.rejects(
    () => port.send('FAIL_TURN headache', { member: MEMBER }),
    (error) => {
      assert.ok(error instanceof CareAgentTurnFailedError);
      return true;
    },
  );
});

test('a failed session create is retried instead of poisoning the port', async () => {
  received = [];
  let attempts = 0;
  const port = newPort({
    stream: false,
    fetchImpl: async (url, init) => {
      attempts += 1;
      if (attempts === 1) throw new Error('network down');
      return fetch(url, init);
    },
  });
  await assert.rejects(() => port.send('LEGACY_OK first', { member: MEMBER }), /network down/u);
  const reply = await port.send('LEGACY_OK second', { member: MEMBER });
  assert.match(reply.text, /Rest and fluids/u);
  assert.ok(attempts >= 2, 'the second send must attempt a fresh session');
  assert.equal(received.filter((entry) => entry.path === SESSIONS_PATH).length, 1);
});

test('a hosted configuration without a token is rejected, never downgraded', async () => {
  const port = newPort({ accessTokens: { getAccessToken: () => null } });
  await assert.rejects(() => port.send('LEGACY_OK hi', { member: MEMBER }), CareAgentAuthError);
});

test('runtime selection reports offline when no credential is provisioned', async () => {
  const runtime = await createCareAgentRuntime({
    agentsApiBaseUrl: baseUrl,
    accessTokens: { getAccessToken: () => null },
    entrySurface: 'pc',
  });
  assert.equal(runtime.mode, 'offline');
  assert.equal(runtime.port.mode, 'offline');
});

test('runtime selection constructs the hosted port from the same inputs', async () => {
  const runtime = await createCareAgentRuntime({
    agentsApiBaseUrl: baseUrl,
    accessTokens: { getAccessToken: () => 'test-token' },
    entrySurface: 'h5',
    stream: false,
  });
  assert.equal(runtime.mode, 'hosted');
  assert.equal(runtime.port.mode, 'hosted');
});

test('base URL normalization mirrors the generated app SDK', () => {
  assert.equal(resolveCareAgentsBaseUrl('https://agents.example.com/'), 'https://agents.example.com');
  assert.equal(
    resolveCareAgentsBaseUrl('https://agents.example.com' + CARE_AGENTS_API_PREFIX + '/'),
    'https://agents.example.com',
  );
  assert.throws(() => resolveCareAgentsBaseUrl('https://agents.example.com/x' + CARE_AGENTS_API_PREFIX + '/y'));
  assert.throws(() => resolveCareAgentsBaseUrl('   '));
});

test('turn payload hashes are deterministic and content-bound', () => {
  const first = careTurnPayloadHash('chest pain', 'text/plain', 'pc');
  const second = careTurnPayloadHash('chest pain', 'text/plain', 'pc');
  assert.equal(first, second);
  assert.notEqual(first, careTurnPayloadHash('chest pain', 'text/plain', 'h5'));
  assert.notEqual(first, careTurnPayloadHash('chest pains', 'text/plain', 'pc'));
  assert.match(first, /^care\.v1:[0-9a-f]{32}$/u);
});
