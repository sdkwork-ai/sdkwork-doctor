import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const agent = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/agent.js'));
const i18n = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/i18n.js'));

// The mini program defaults to zh-CN; these contract assertions are written
// against the catalog's en-US copy, and one test below proves the zh-CN copy.
beforeEach(() => {
  i18n.setLocale('en-US');
});

const MEMBER = Object.freeze({
  displayName: 'Me',
  relation: 'self',
  birthYear: 1990,
  allergies: ['penicillin'],
  chronicConditions: ['hypertension'],
  medications: [],
});

const SESSION_PATH = agent.API_PREFIX + '/ai/agents/' + agent.FAMILY_DOCTOR_AGENT_ID + '/sessions';
const TURN_PATH = SESSION_PATH + '/session.family.001/turns';

function envelope(item) {
  return { code: 0, traceId: 'trace-test', data: { item } };
}

function turnItem(text, status = 'completed') {
  return {
    session: { sessionId: 'session.family.001' },
    turn: { turnId: 'turn.1', status },
    items: [
      { itemId: 'item.user.1', kind: 'user_input', content: 'symptom' },
      { itemId: 'item.assistant.1', kind: 'assistant_output', content: text },
    ],
  };
}

/** Injected transport that mirrors `wx.request` and records every call. */
function transport(options = {}) {
  const calls = [];
  const token = options.token ?? 'test-token';
  const request = (call) => {
    calls.push(call);
    if (!token) return Promise.resolve({ status: 401, body: { code: 40101, detail: 'missing access token' } });
    if (call.url.endsWith('/sessions')) {
      return Promise.resolve({ status: 201, body: envelope({ sessionId: 'session.family.001' }) });
    }
    if (call.url.includes('/turns')) {
      const content = String(call.data.content || '');
      if (content.includes('FORBIDDEN')) {
        return Promise.resolve({ status: 403, body: { status: 403, code: 40301, traceId: 'trace-forbidden', detail: 'permission denied' } });
      }
      if (content.includes('FAIL_TURN')) {
        return Promise.resolve({ status: 200, body: envelope(turnItem('', 'failed')) });
      }
      const text = content.includes('REASSURANCE')
        ? 'Probably nothing serious. Take a rest.'
        : content.includes('REPLY_REDFLAG')
          ? 'If you develop chest pain or cannot breathe, call emergency services.'
          : 'Rest and fluids. Monitor for 24 hours.';
      return Promise.resolve({ status: 200, body: envelope(turnItem(text)) });
    }
    return Promise.resolve({ status: 404, body: { detail: 'unknown route' } });
  };
  return { calls, request };
}

test('the mini program creates one session and completes a turn', async () => {
  const fake = transport();
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => 'test-token',
    request: fake.request,
  });
  assert.equal(care.mode, 'hosted');
  const reply = await care.send('LEGACY_OK headache', MEMBER);

  assert.equal(reply.role, 'assistant');
  assert.match(reply.text, /Rest and fluids/u);
  assert.equal(care.history().length, 2);

  assert.equal(fake.calls[0].url, 'https://agents.example.com' + SESSION_PATH);
  assert.equal(fake.calls[0].header.Authorization, 'Bearer test-token');
  assert.equal(fake.calls[0].data.sessionKind, 'assistant');
  assert.equal(fake.calls[0].data.entrySurface, 'mini_program');
  assert.match(fake.calls[0].data.payloadHash, /^care\.v1:[0-9a-f]{32}$/u);

  const turn = fake.calls[1];
  assert.equal(turn.url, 'https://agents.example.com' + TURN_PATH + '?stream=false');
  assert.equal(turn.data.turnMode, 'interactive');
  assert.equal(turn.data.contentType, 'text/plain');
  assert.equal(turn.data.idempotencyKey, turn.data.clientRequestId);
  assert.match(turn.data.payloadHash, /^care\.v1:[0-9a-f]{32}$/u);
  assert.ok(!Number.isNaN(Date.parse(turn.data.requestedAt)));
  assert.match(turn.data.systemPrompt, /penicillin/u);
});

test('a second send reuses the session', async () => {
  const fake = transport();
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => 'test-token',
    request: fake.request,
  });
  await care.send('LEGACY_OK first', MEMBER);
  await care.send('LEGACY_OK second', MEMBER);
  assert.equal(fake.calls.filter((call) => call.url.endsWith('/sessions')).length, 1);
  assert.equal(care.history().length, 4);
});

test('a hosted answer never softens an emergency red flag', async () => {
  const fake = transport();
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => 'test-token',
    request: fake.request,
  });
  const reply = await care.send('chest pain for 10 minutes REASSURANCE', MEMBER);
  assert.equal(reply.level, 'emergency');
  assert.match(reply.text, /^Emergency red flag detected\./u);
  assert.match(reply.text, /Call local emergency services now\./u);
  assert.match(reply.text, /Probably nothing serious/u);
});

test('a red flag inside the hosted answer promotes the turn', async () => {
  const fake = transport();
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => 'test-token',
    request: fake.request,
  });
  const reply = await care.send('mild headache REPLY_REDFLAG', MEMBER);
  assert.equal(reply.level, 'emergency');
  assert.match(reply.text, /^Emergency red flag detected\./u);
});

test('a problem response becomes a typed error carrying traceId', async () => {
  const fake = transport();
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => 'test-token',
    request: fake.request,
  });
  await assert.rejects(
    () => care.send('FORBIDDEN topic', MEMBER),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, 40301);
      assert.equal(error.traceId, 'trace-forbidden');
      return true;
    },
  );
  assert.equal(care.history().length, 0);
});

test('a failed durable turn rejects', async () => {
  const fake = transport();
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => 'test-token',
    request: fake.request,
  });
  await assert.rejects(() => care.send('FAIL_TURN headache', MEMBER), /agent turn failed|provider/u);
});

test('a failed session create is retried instead of poisoning the port', async () => {
  const fake = transport();
  let attempts = 0;
  const flaky = (call) => {
    attempts += 1;
    if (attempts === 1) return Promise.reject(new Error('network down'));
    return fake.request(call);
  };
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => 'test-token',
    request: flaky,
  });
  await assert.rejects(() => care.send('LEGACY_OK first', MEMBER), /network down/u);
  const reply = await care.send('LEGACY_OK second', MEMBER);
  assert.match(reply.text, /Rest and fluids/u);
  assert.ok(attempts >= 2);
});

test('a hosted configuration without a token is rejected, never downgraded', async () => {
  const fake = transport();
  const care = agent.createCareAgent({
    agentsApiBaseUrl: 'https://agents.example.com',
    getAccessToken: () => null,
    request: fake.request,
  });
  assert.equal(care.mode, 'offline');
  assert.equal(fake.calls.length, 0);
});

test('mode selection and base URL normalization mirror the other clients', () => {
  assert.equal(agent.resolveCareAgentMode({ agentsApiBaseUrl: 'https://x', hasAccessToken: true }), 'hosted');
  assert.equal(agent.resolveCareAgentMode({ agentsApiBaseUrl: 'https://x', hasAccessToken: false }), 'offline');
  assert.equal(agent.resolveCareAgentMode({ agentsApiBaseUrl: '', hasAccessToken: true }), 'offline');
  assert.equal(agent.resolveBaseUrl('https://agents.example.com/'), 'https://agents.example.com');
  assert.equal(agent.resolveBaseUrl('https://agents.example.com' + agent.API_PREFIX + '/'), 'https://agents.example.com');
  assert.throws(() => agent.resolveBaseUrl('https://agents.example.com/x' + agent.API_PREFIX + '/y'));
  assert.throws(() => agent.resolveBaseUrl('   '));
});

test('the offline adapter still escalates emergencies', async () => {
  const care = agent.createCareAgent({ agentsApiBaseUrl: '', getAccessToken: () => null });
  assert.equal(care.mode, 'offline');
  const reply = await care.send('chest pain', MEMBER);
  assert.equal(reply.level, 'emergency');
  assert.match(reply.text, /emergency services/iu);
  assert.doesNotMatch(reply.text, /take (medicine|ibuprofen|paracetamol)/iu);
});

test('the same escalation reads in zh-CN from the shared catalog', async () => {
  i18n.setLocale('zh-CN');
  const care = agent.createCareAgent({ agentsApiBaseUrl: '', getAccessToken: () => null });
  const reply = await care.send('chest pain', MEMBER);
  assert.equal(reply.level, 'emergency');
  assert.match(reply.text, /检测到 你 的急症红旗信号。/u);
  assert.match(reply.text, /立即拨打当地急救电话。/u);
  assert.match(reply.text, /以上为一般性建议/u);
});
