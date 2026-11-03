import { triageSymptoms, type FamilyMember, type TriageLevel, type TriageResult } from '@sdkwork/doctor-common-doctor';
import { careComposeHostedReply, type CareTranslate } from './care-copy';
import {
  CARE_AGENT_ASSISTANT_ITEM_KIND,
  CARE_AGENT_SESSION_KIND,
  CARE_AGENT_STREAM_QUERY,
  CARE_AGENT_TURN_MODE,
  careAgentsSessionsPath,
  careAgentsTurnPath,
  resolveCareAgentsBaseUrl,
  type CareAgentApiEnvelope,
  type CareAgentCreateSessionRequest,
  type CareAgentCreateTurnRequest,
  type CareAgentEntrySurface,
  type CareAgentProblemDetail,
  type CareAgentSessionItem,
  type CareAgentSessionRecord,
  type CareAgentTurnExecutionItem,
  type CareAgentTurnStreamFrame,
} from './contract';
import { careSessionPayloadHash, careTurnPayloadHash } from './fingerprint';
import type { AgentConversationPort, AgentTurnContext, ChatMessage } from './types';

/** Product binding: the managed sdkwork-agents agent that plays the family doctor. */
export const FAMILY_DOCTOR_AGENT_ID = 'agent.family-doctor';

/** Session title sent once, before the conversation has any content. */
const SESSION_TITLE = 'Family doctor conversation';

/** Rank used to promote, never downgrade, a triage level. */
const TRIAGE_RANK: Readonly<Record<TriageLevel, number>> = Object.freeze({
  'self-care': 0,
  routine: 1,
  urgent: 2,
  emergency: 3,
});

/** Access-token port. The token comes from the appbase IAM session, never a `VITE_*` value. */
export interface CareAgentAccessTokenPort {
  readonly getAccessToken: () => string | null | Promise<string | null>;
}

/** Minimal HTTP response surface so tests can inject a fetch double. */
export interface CareAgentHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export interface CareAgentRequestInit {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type CareAgentFetch = (url: string, init: CareAgentRequestInit) => Promise<CareAgentHttpResponse>;

export interface HostedCareAgentOptions {
  /** Gateway root or URL ending with `/app/v3/api`. Empty selects nothing: callers resolve the mode first. */
  readonly agentsApiBaseUrl: string;
  readonly accessTokens: CareAgentAccessTokenPort;
  readonly entrySurface: CareAgentEntrySurface;
  readonly agentId?: string;
  /** Reuse an existing session instead of creating one on first send. */
  readonly sessionId?: string;
  readonly systemPrompt?: string | ((context: AgentTurnContext) => string);
  readonly fetchImpl?: CareAgentFetch;
  readonly now?: () => Date;
  readonly createId?: () => string;
  /** Receives visible assistant deltas when the streaming transport is used. */
  readonly onDelta?: (delta: string) => void;
  /** Defaults to streaming; set false to use the idempotent non-stream turn. */
  readonly stream?: boolean;
  /** Host i18n translator for the visible escalation copy; absent keeps English. */
  readonly translate?: CareTranslate;
}

/** Base error for every hosted-transport failure. */
export class CareAgentTransportError extends Error {
  readonly traceId?: string;

  constructor(message: string, traceId?: string) {
    super(message);
    this.name = new.target.name;
    this.traceId = traceId;
  }
}

/** The selected mode is `hosted` but no IAM access token is available. */
export class CareAgentAuthError extends CareAgentTransportError {
  constructor() {
    super('hosted agents transport requires an appbase IAM access token');
  }
}

/** The agents API answered with a ProblemDetail (HTTP 4xx/5xx). */
export class CareAgentHttpError extends CareAgentTransportError {
  readonly status: number;
  readonly code?: number | string;
  readonly problem?: CareAgentProblemDetail;

  constructor(status: number, problem?: CareAgentProblemDetail) {
    super(problem?.detail ?? problem?.title ?? `agents API responded with HTTP ${String(status)}`, problem?.traceId);
    this.status = status;
    this.code = problem?.code;
    this.problem = problem;
  }
}

/** The agents API answered with a body that violates the documented contract. */
export class CareAgentContractError extends CareAgentTransportError {
  constructor(message: string, traceId?: string) {
    super(message, traceId);
  }
}

/** The durable turn finished in `failed` status. */
export class CareAgentTurnFailedError extends CareAgentTransportError {
  readonly errorCode?: string;

  constructor(errorCode: string | null | undefined, errorDetail: string | null | undefined, traceId?: string) {
    super(errorDetail ?? errorCode ?? 'agent turn failed', traceId);
    this.errorCode = errorCode ?? undefined;
  }
}

/**
 * System prompt that turns a generic agent into this family's private doctor.
 * Health facts stay in the request; nothing is persisted by the client.
 */
export function buildFamilyDoctorSystemPrompt(member: FamilyMember): string {
  const allergies = member.allergies.length > 0 ? member.allergies.join(', ') : 'none recorded';
  const conditions = member.chronicConditions.length > 0 ? member.chronicConditions.join(', ') : 'none recorded';
  const medications = member.medications.length > 0 ? member.medications.join(', ') : 'none recorded';
  return [
    'You are the family private doctor for ' + member.displayName + ' (' + member.relation + ', born ' + String(member.birthYear) + ').',
    'Known allergies: ' + allergies + '. Chronic conditions: ' + conditions + '. Current medications: ' + medications + '.',
    'Answer in the language the user writes in, concisely, with concrete next steps.',
    'Never claim a diagnosis and never change a prescription dose.',
    'If the message contains an emergency red flag, tell the user to call local emergency services immediately and do not offer self-treatment.',
  ].join(' ');
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function defaultFetch(): CareAgentFetch {
  return (url, init) => fetch(url, init);
}

function parseJson<T>(text: string, traceId?: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CareAgentContractError('agents API returned a body that is not JSON', traceId);
  }
}

function readItemText(items: readonly CareAgentSessionItem[]): string {
  return items
    .filter((item) => item.kind === CARE_AGENT_ASSISTANT_ITEM_KIND && typeof item.content === 'string')
    .map((item) => (item.content ?? '').trim())
    .filter((value) => value.length > 0)
    .join('\n');
}

function assertCompletedTurn(item: CareAgentTurnExecutionItem, traceId: string): void {
  const status = item.turn.status;
  if (status === 'failed') {
    throw new CareAgentTurnFailedError(item.turn.errorCode, item.turn.errorDetail, traceId);
  }
  if (status === 'cancelled') {
    throw new CareAgentTurnFailedError('cancelled', 'the agent turn was cancelled', traceId);
  }
}

function unwrapEnvelope<TItem>(text: string): CareAgentApiEnvelope<TItem> {
  const envelope = parseJson<CareAgentApiEnvelope<TItem>>(text);
  if (typeof envelope !== 'object' || envelope === null) {
    throw new CareAgentContractError('agents API response is not an object');
  }
  if (envelope.code !== 0) {
    throw new CareAgentContractError('agents API response did not carry success code 0', envelope.traceId);
  }
  if (typeof envelope.traceId !== 'string' || envelope.traceId.length === 0) {
    throw new CareAgentContractError('agents API response is missing traceId');
  }
  if (!envelope.data || typeof envelope.data !== 'object' || !('item' in envelope.data)) {
    throw new CareAgentContractError('agents API response is missing data.item', envelope.traceId);
  }
  return envelope;
}

function problemFromText(text: string): CareAgentProblemDetail | undefined {
  try {
    return JSON.parse(text) as CareAgentProblemDetail;
  } catch {
    return undefined;
  }
}

/** Splits an SSE byte stream into `data:` frames and dispatches each parsed frame. */
async function consumeSseFrames(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: CareAgentTurnStreamFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let boundary = buffer.indexOf('\n');
    while (boundary >= 0) {
      const line = buffer.slice(0, boundary).replace(/\r$/u, '');
      buffer = buffer.slice(boundary + 1);
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload.length > 0) {
          onFrame(JSON.parse(payload) as CareAgentTurnStreamFrame);
        }
      }
      boundary = buffer.indexOf('\n');
    }
  }
}

/**
 * Hosted conversation adapter. One instance owns one session id and one turn
 * history; `send` never answers from a local fallback, so a transport failure
 * surfaces as an error instead of silently impersonating the hosted agent.
 */
export function createHostedCareAgent(options: HostedCareAgentOptions): AgentConversationPort {
  const baseUrl = resolveCareAgentsBaseUrl(options.agentsApiBaseUrl);
  const agentId = (options.agentId ?? FAMILY_DOCTOR_AGENT_ID).trim();
  const httpFetch = options.fetchImpl ?? defaultFetch();
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? defaultCreateId;
  const messages: ChatMessage[] = [];
  let sessionPromise: Promise<string> | null = options.sessionId ? Promise.resolve(options.sessionId) : null;

  async function accessToken(): Promise<string> {
    const token = await options.accessTokens.getAccessToken();
    const normalized = (token ?? '').trim();
    if (!normalized) throw new CareAgentAuthError();
    return normalized;
  }

  async function request(
    token: string,
    path: string,
    body: unknown,
    accept = 'application/json',
  ): Promise<CareAgentHttpResponse> {
    return httpFetch(baseUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: accept,
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(body),
    });
  }

  async function createSession(token: string): Promise<string> {
    const requestId = createId();
    const payload: CareAgentCreateSessionRequest = {
      sessionKind: CARE_AGENT_SESSION_KIND,
      entrySurface: options.entrySurface,
      title: SESSION_TITLE,
      idempotencyKey: requestId,
      payloadHash: careSessionPayloadHash(SESSION_TITLE, options.entrySurface),
      requestedAt: now().toISOString(),
    };
    const response = await request(token, careAgentsSessionsPath(agentId), payload);
    const text = await response.text();
    if (!response.ok) throw new CareAgentHttpError(response.status, problemFromText(text));
    const envelope = unwrapEnvelope<CareAgentSessionRecord>(text);
    const sessionId = envelope.data.item.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new CareAgentContractError('agents API session response is missing sessionId', envelope.traceId);
    }
    return sessionId;
  }

  async function ensureSession(token: string): Promise<string> {
    if (!sessionPromise) {
      // A failed create must not poison every later send: clear the cached
      // promise so the next attempt can establish the session.
      sessionPromise = createSession(token).catch((error: unknown) => {
        sessionPromise = null;
        throw error;
      });
    }
    return sessionPromise;
  }

  function buildTurnRequest(content: string, context: AgentTurnContext): CareAgentCreateTurnRequest {
    const requestId = createId();
    const systemPrompt = typeof options.systemPrompt === 'function'
      ? options.systemPrompt(context)
      : options.systemPrompt ?? buildFamilyDoctorSystemPrompt(context.member);
    return {
      content,
      contentType: 'text/plain',
      turnMode: CARE_AGENT_TURN_MODE,
      systemPrompt,
      idempotencyKey: requestId,
      payloadHash: careTurnPayloadHash(content, 'text/plain', options.entrySurface),
      clientRequestId: requestId,
      requestedAt: now().toISOString(),
    };
  }

  async function completeTurn(token: string, sessionId: string, body: CareAgentCreateTurnRequest): Promise<CareAgentTurnExecutionItem> {
    const response = await request(token, careAgentsTurnPath(agentId, sessionId) + '?stream=false', body);
    const text = await response.text();
    if (!response.ok) throw new CareAgentHttpError(response.status, problemFromText(text));
    const envelope = unwrapEnvelope<CareAgentTurnExecutionItem>(text);
    assertCompletedTurn(envelope.data.item, envelope.traceId);
    return envelope.data.item;
  }

  async function streamTurn(token: string, sessionId: string, body: CareAgentCreateTurnRequest): Promise<CareAgentTurnExecutionItem> {
    const response = await request(token, careAgentsTurnPath(agentId, sessionId) + CARE_AGENT_STREAM_QUERY, body, 'text/event-stream');
    if (!response.ok) {
      throw new CareAgentHttpError(response.status, problemFromText(await response.text()));
    }
    if (!response.body) {
      throw new CareAgentContractError('agents API streaming response has no body');
    }
    let completion: CareAgentApiEnvelope<CareAgentTurnExecutionItem> | undefined;
    let streamError: CareAgentProblemDetail | undefined;
    await consumeSseFrames(response.body, (frame) => {
      if (frame.eventType === 'delta' && typeof frame.delta === 'string') {
        options.onDelta?.(frame.delta);
        return;
      }
      if (frame.eventType === 'error') {
        streamError = frame.problem;
        return;
      }
      if (frame.eventType === 'completion' && frame.response) {
        completion = frame.response;
      }
    });
    if (streamError) throw new CareAgentHttpError(streamError.status ?? 502, streamError);
    if (!completion) {
      throw new CareAgentContractError('agents turn stream ended without a completion frame');
    }
    if (completion.code !== 0) {
      throw new CareAgentContractError('agents turn completion did not carry success code 0', completion.traceId);
    }
    assertCompletedTurn(completion.data.item, completion.traceId);
    return completion.data.item;
  }

  return {
    mode: 'hosted',
    history: () => messages,
    async send(input, context) {
      const text = input.trim();
      if (!text) throw new Error('message must not be empty');
      const token = await accessToken();
      const sessionId = await ensureSession(token);
      const body = buildTurnRequest(text, context);
      const item = options.stream === false
        ? await completeTurn(token, sessionId, body)
        : await streamTurn(token, sessionId, body);
      const replyText = readItemText(item.items);
      if (!replyText) {
        throw new CareAgentContractError('agent turn produced no assistant_output content', item.turn.traceId ?? undefined);
      }
      const triage = resolveReplyTriage(text, replyText);
      const userMessage: ChatMessage = {
        id: 'user-' + String(messages.length + 1),
        role: 'user',
        text,
        createdAt: now().toISOString(),
        triage,
      };
      const reply: ChatMessage = {
        id: 'assistant-' + String(messages.length + 2),
        role: 'assistant',
        text: composeSafeReply(triage, replyText, context.member, options.translate),
        createdAt: now().toISOString(),
        triage,
      };
      messages.push(userMessage, reply);
      return reply;
    },
  };
}

/**
 * Triage for one exchange: the user's own text decides the floor, and a red
 * flag recognized inside the hosted answer can only raise it. A hosted answer
 * that reads as reassurance never lowers an emergency.
 */
export function resolveReplyTriage(userText: string, replyText: string): TriageResult {
  const fromUser = triageSymptoms(userText);
  const fromReply = triageSymptoms(replyText);
  if (TRIAGE_RANK[fromReply.level] <= TRIAGE_RANK[fromUser.level]) return fromUser;
  return {
    level: fromReply.level,
    reason: 'The doctor reply itself contained a red flag: ' + fromReply.reason,
    actions: fromReply.actions,
    escalate: fromReply.escalate,
  };
}

/**
 * Composes the visible answer. Escalation guidance leads the message and the
 * hosted answer is kept after it, so a model reply can never bury a red flag.
 *
 * `translate` localizes the lead, the actions, and the safety line; without it
 * the historical English copy is used, which keeps the fixtures stable.
 */
export function composeSafeReply(
  triage: TriageResult,
  replyText: string,
  member: FamilyMember,
  translate?: CareTranslate,
): string {
  return careComposeHostedReply(triage.level, replyText, member, translate);
}
