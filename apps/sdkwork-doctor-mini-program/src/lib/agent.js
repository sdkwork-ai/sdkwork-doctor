// Conversation runtime for the mini program.
//
// Hosted mode speaks the documented sdkwork-agents app API
// (`agents.sessions.create` then `agents.turns.stream` with `stream=false`).
// The port is injected in tests; production uses `wx.request`. An emergency red
// flag is always escalated before the hosted answer, and a red flag inside the
// hosted answer can only raise the level, never lower it.
const { triageLevel } = require('./triage.js');
const { careTurnPayloadHash, careSessionPayloadHash } = require('./fingerprint.js');

const FAMILY_DOCTOR_AGENT_ID = 'agent.family-doctor';
const API_PREFIX = '/app/v3/api';
const SESSION_TITLE = 'Family doctor conversation';
const SAFETY_LINE = 'This is general guidance, not a diagnosis. For emergencies call your local emergency number.';
const EMERGENCY_LEAD =
  'Emergency red flag detected. Call local emergency services now. Do not drive yourself. Stay with the person until help arrives.';
const RANK = { 'self-care': 0, routine: 1, urgent: 2, emergency: 3 };

function careAgentError(message, extra) {
  const error = new Error(message);
  if (extra) {
    if (extra.status !== undefined) error.status = extra.status;
    if (extra.code !== undefined) error.code = extra.code;
    if (extra.traceId !== undefined) error.traceId = extra.traceId;
  }
  return error;
}

function resolveCareAgentMode(environment) {
  const baseUrl = String(environment.agentsApiBaseUrl || '').trim();
  if (!baseUrl) return 'offline';
  if (!environment.hasAccessToken) return 'offline';
  return 'hosted';
}

function resolveBaseUrl(agentsApiBaseUrl) {
  const normalized = String(agentsApiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) throw careAgentError('agentsApiBaseUrl must not be empty');
  const hasSuffix = normalized.slice(-API_PREFIX.length) === API_PREFIX;
  if (normalized.indexOf(API_PREFIX) >= 0 && !hasSuffix) {
    throw careAgentError('agentsApiBaseUrl must be a gateway root or end with ' + API_PREFIX);
  }
  return hasSuffix ? normalized.slice(0, normalized.length - API_PREFIX.length) : normalized;
}

function createId() {
  const hex = [];
  for (let index = 0; index < 16; index += 1) {
    hex.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
  }
  const joined = hex.join('');
  return (
    joined.slice(0, 8) + '-' + joined.slice(8, 12) + '-' + joined.slice(12, 16) + '-' +
    joined.slice(16, 20) + '-' + joined.slice(20)
  );
}

function defaultRequest(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: options.url,
      method: options.method,
      header: options.header,
      data: options.data,
      success: (response) => resolve({ status: response.statusCode, body: response.data }),
      fail: (error) => reject(careAgentError((error && error.errMsg) || 'agents request failed')),
    });
  });
}

function asObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function buildSystemPrompt(member) {
  const subject = member || { displayName: 'Me', relation: 'self', birthYear: 1990 };
  const allergies = subject.allergies && subject.allergies.length ? subject.allergies.join(', ') : 'none recorded';
  const conditions = subject.chronicConditions && subject.chronicConditions.length
    ? subject.chronicConditions.join(', ')
    : 'none recorded';
  const medications = subject.medications && subject.medications.length ? subject.medications.join(', ') : 'none recorded';
  return [
    'You are the family private doctor for ' + subject.displayName + ' (' + subject.relation + ', born ' + subject.birthYear + ').',
    'Known allergies: ' + allergies + '. Chronic conditions: ' + conditions + '. Current medications: ' + medications + '.',
    'Answer in the language the user writes in, concisely, with concrete next steps.',
    'Never claim a diagnosis and never change a prescription dose.',
    'If the message contains an emergency red flag, tell the user to call local emergency services immediately and do not offer self-treatment.',
  ].join(' ');
}

function resolveReplyTriage(userText, replyText) {
  const fromUser = triageLevel(userText);
  const fromReply = triageLevel(replyText);
  return RANK[fromReply] > RANK[fromUser] ? fromReply : fromUser;
}

function composeReply(level, replyText, member) {
  const who = member && member.displayName && member.displayName !== 'Me' ? member.displayName : 'you';
  const body = replyText.indexOf(SAFETY_LINE) >= 0 ? replyText : replyText + ' ' + SAFETY_LINE;
  if (level === 'emergency') return EMERGENCY_LEAD + ' (' + who + ') ' + body;
  if (level === 'urgent') return 'This needs a same-day clinician review (' + who + '). ' + body;
  return body;
}

function answerText(item) {
  const turn = item && item.turn;
  if (turn && (turn.status === 'failed' || turn.status === 'cancelled')) {
    throw careAgentError(turn.errorDetail || turn.errorCode || 'agent turn failed', {
      code: turn.errorCode,
      traceId: turn.traceId,
    });
  }
  const items = item && item.items;
  if (!Array.isArray(items)) throw careAgentError('agents API turn response is missing items');
  return items
    .filter((entry) => entry && entry.kind === 'assistant_output' && typeof entry.content === 'string')
    .map((entry) => entry.content.trim())
    .filter((value) => value.length > 0)
    .join('\n');
}

function envelopeItem(body) {
  const envelope = asObject(body);
  if (!envelope) throw careAgentError('agents API response is not an object');
  if (envelope.code !== 0) throw careAgentError('agents API response did not carry success code 0', { traceId: envelope.traceId });
  if (typeof envelope.traceId !== 'string' || !envelope.traceId) {
    throw careAgentError('agents API response is missing traceId');
  }
  const data = envelope.data;
  if (!data || typeof data !== 'object' || !data.item || typeof data.item !== 'object') {
    throw careAgentError('agents API response is missing data.item', { traceId: envelope.traceId });
  }
  return data.item;
}

function createOfflineAgent() {
  const history = [];
  return {
    mode: 'offline',
    history: () => history.slice(),
    send(input, member) {
      const text = String(input || '').trim();
      if (!text) return Promise.reject(careAgentError('message must not be empty'));
      const level = triageLevel(text);
      const reply = {
        role: 'assistant',
        text:
          level === 'emergency'
            ? EMERGENCY_LEAD + ' ' + SAFETY_LINE
            : 'No red flag was found in what you described. ' + SAFETY_LINE,
        level,
      };
      history.push({ role: 'user', text: text, level: level });
      history.push(reply);
      return Promise.resolve(reply);
    },
  };
}

function createHostedAgent(options) {
  const baseUrl = resolveBaseUrl(options.agentsApiBaseUrl);
  const agentId = String(options.agentId || FAMILY_DOCTOR_AGENT_ID).trim();
  const entrySurface = options.entrySurface || 'mini_program';
  const request = options.request || defaultRequest;
  const now = options.now || (() => new Date());
  const createRequestId = options.createId || createId;
  const history = [];
  let sessionPromise = null;

  function token() {
    const value = String((options.getAccessToken ? options.getAccessToken() : '') || '').trim();
    if (!value) throw careAgentError('hosted agents transport requires an appbase IAM access token');
    return value;
  }

  const sessionsPath = API_PREFIX + '/ai/agents/' + encodeURIComponent(agentId) + '/sessions';

  function post(path, body, accessToken) {
    return request({
      url: baseUrl + path,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      data: body,
    });
  }

  function problem(status, body) {
    const envelope = asObject(body) || {};
    return careAgentError(envelope.detail || envelope.title || 'agents API responded with HTTP ' + status, {
      status: status,
      code: envelope.code,
      traceId: envelope.traceId,
    });
  }

  function ensureSession(accessToken) {
    if (!sessionPromise) {
      const body = {
        sessionKind: 'assistant',
        entrySurface: entrySurface,
        title: SESSION_TITLE,
        idempotencyKey: createRequestId(),
        payloadHash: careSessionPayloadHash(SESSION_TITLE, entrySurface),
        requestedAt: now().toISOString(),
      };
      sessionPromise = post(sessionsPath, body, accessToken).then((response) => {
        if (response.status < 200 || response.status >= 300) throw problem(response.status, response.body);
        const sessionId = envelopeItem(response.body).sessionId;
        if (typeof sessionId !== 'string' || !sessionId) throw careAgentError('agents API session response is missing sessionId');
        return sessionId;
      });
    }
    return sessionPromise;
  }

  return {
    mode: 'hosted',
    history: () => history.slice(),
    async send(input, member) {
      const text = String(input || '').trim();
      if (!text) throw careAgentError('message must not be empty');
      const accessToken = token();
      const sessionId = await ensureSession(accessToken);
      const requestId = createRequestId();
      const body = {
        content: text,
        contentType: 'text/plain',
        turnMode: 'interactive',
        systemPrompt: options.systemPrompt ? options.systemPrompt(member) : buildSystemPrompt(member),
        idempotencyKey: requestId,
        payloadHash: careTurnPayloadHash(text, 'text/plain', entrySurface),
        clientRequestId: requestId,
        requestedAt: now().toISOString(),
      };
      const path = sessionsPath + '/' + encodeURIComponent(sessionId) + '/turns?stream=false';
      const response = await post(path, body, accessToken);
      if (response.status < 200 || response.status >= 300) throw problem(response.status, response.body);
      const item = envelopeItem(response.body);
      const replyText = answerText(item);
      if (!replyText.trim()) throw careAgentError('agent turn produced no assistant_output content');
      const level = resolveReplyTriage(text, replyText);
      const reply = { role: 'assistant', text: composeReply(level, replyText, member), level: level };
      history.push({ role: 'user', text: text, level: level });
      history.push(reply);
      return reply;
    },
  };
}

function createCareAgent(options) {
  const settings = options || {};
  const accessToken = settings.getAccessToken ? settings.getAccessToken() : null;
  const mode = resolveCareAgentMode({
    agentsApiBaseUrl: settings.agentsApiBaseUrl,
    hasAccessToken: typeof accessToken === 'string' && accessToken.trim().length > 0,
  });
  return mode === 'hosted' ? createHostedAgent(settings) : createOfflineAgent();
}

module.exports = {
  FAMILY_DOCTOR_AGENT_ID,
  API_PREFIX,
  resolveCareAgentMode,
  resolveBaseUrl,
  createCareAgent,
  createHostedAgent,
  createOfflineAgent,
  resolveReplyTriage,
  composeReply,
  buildSystemPrompt,
};
