/**
 * Wire contract for the hosted sdkwork-agents conversation.
 *
 * Authority: `sdkwork-agents` app API OpenAPI
 * (`sdks/sdkwork-agents-app-sdk/openapi/sdkwork-agents-app-api.openapi.yaml`),
 * operations `agents.sessions.create` and `agents.turns.stream`. This module
 * pins every path, enum, and envelope field the Doctor clients depend on, so a
 * contract test can compare it with the upstream document
 * (`tests/agents-upstream-contract.test.mjs`).
 */

/** Gateway surface prefix every sdkwork-agents app API operation lives under. */
export const CARE_AGENTS_API_PREFIX = '/app/v3/api';

/** `AgentSessionKind` value used for a chat conversation. */
export const CARE_AGENT_SESSION_KIND = 'assistant';

/** `CreateAgentTurnRequest.turnMode` value used for an interactive chat turn. */
export const CARE_AGENT_TURN_MODE = 'interactive';

/** `AgentSessionItemKind` value that carries visible assistant text. */
export const CARE_AGENT_ASSISTANT_ITEM_KIND = 'assistant_output';

/** `AgentSessionItemKind` values that must never be rendered as the answer. */
export const CARE_AGENT_NON_ANSWER_ITEM_KINDS = Object.freeze([
  'user_input',
  'system_instruction',
  'reasoning',
  'tool_call',
  'tool_result',
  'artifact_reference',
  'status_notice',
  'error_notice',
] as const);

/** Surfaces the agents API accepts as `entrySurface`. */
export type CareAgentEntrySurface = 'pc' | 'h5' | 'flutter' | 'mini_program';

/** Error payload shape returned with HTTP 4xx/5xx (`application/problem+json`). */
export interface CareAgentProblemDetail {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: number | string;
  readonly traceId?: string;
  readonly i18nKey?: string;
}

/** One durable session item. Only `assistant_output` carries answer text. */
export interface CareAgentSessionItem {
  readonly itemId: string;
  readonly kind: string;
  readonly content?: string | null;
  readonly status?: string;
  readonly sequence?: string;
  readonly createdAt?: string;
}

export interface CareAgentTurnRecord {
  readonly turnId: string;
  readonly status: string;
  readonly errorCode?: string | null;
  readonly errorDetail?: string | null;
  readonly traceId?: string | null;
}

export interface CareAgentSessionRecord {
  readonly sessionId: string;
  readonly title?: string | null;
  readonly updatedAt?: string;
  readonly version?: string;
}

/** `data.item` payload of a completed turn. */
export interface CareAgentTurnExecutionItem {
  readonly session: CareAgentSessionRecord;
  readonly turn: CareAgentTurnRecord;
  readonly items: readonly CareAgentSessionItem[];
}

/** SDKWork success envelope: numeric `code: 0` plus a server-owned `traceId`. */
export interface CareAgentApiEnvelope<TItem> {
  readonly code: number;
  readonly traceId: string;
  readonly data: { readonly item: TItem };
}

/** Request body of `agents.sessions.create`. */
export interface CareAgentCreateSessionRequest {
  readonly sessionKind: typeof CARE_AGENT_SESSION_KIND;
  readonly entrySurface: CareAgentEntrySurface;
  readonly title: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly requestedAt: string;
}

/** Request body of `agents.turns.stream` with `stream=false`. */
export interface CareAgentCreateTurnRequest {
  readonly content: string;
  readonly contentType: string;
  readonly turnMode: typeof CARE_AGENT_TURN_MODE;
  readonly systemPrompt?: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly clientRequestId: string;
  readonly requestedAt: string;
}

/** One SSE frame of the `kernel-v1` turn stream. */
export interface CareAgentTurnStreamFrame {
  readonly eventType?: 'delta' | 'event' | 'completion' | 'error';
  readonly delta?: string;
  readonly index?: number;
  readonly response?: CareAgentApiEnvelope<CareAgentTurnExecutionItem>;
  readonly event?: {
    readonly type?: string;
    readonly payload?: { readonly kind?: string; readonly delta?: string };
  };
  readonly problem?: CareAgentProblemDetail;
}

/**
 * Normalizes an agents API base URL to the gateway root the path builders
 * expect. Mirrors the generated app SDK: a URL that ends with the surface
 * prefix is accepted, a URL that embeds the prefix in the middle is rejected
 * because it would duplicate the prefix.
 */
export function resolveCareAgentsBaseUrl(agentsApiBaseUrl: string): string {
  const normalized = agentsApiBaseUrl.trim().replace(/\/+$/u, '');
  if (!normalized) {
    throw new Error('agentsApiBaseUrl must not be empty');
  }
  const prefixIndex = normalized.indexOf(CARE_AGENTS_API_PREFIX);
  const hasCanonicalSuffix = normalized.endsWith(CARE_AGENTS_API_PREFIX);
  if (prefixIndex >= 0 && !hasCanonicalSuffix) {
    throw new Error(`agentsApiBaseUrl must be a gateway root or end with ${CARE_AGENTS_API_PREFIX}`);
  }
  if (!hasCanonicalSuffix) return normalized;
  const root = normalized.slice(0, -CARE_AGENTS_API_PREFIX.length);
  if (root.includes(CARE_AGENTS_API_PREFIX)) {
    throw new Error(`agentsApiBaseUrl must include ${CARE_AGENTS_API_PREFIX} at most once`);
  }
  return root;
}

function pathSegment(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return encodeURIComponent(normalized);
}

/** `POST {root}/app/v3/api/ai/agents/{agentId}/sessions` */
export function careAgentsSessionsPath(agentId: string): string {
  return `${CARE_AGENTS_API_PREFIX}/ai/agents/${pathSegment(agentId, 'agentId')}/sessions`;
}

/** `POST {root}/app/v3/api/ai/agents/{agentId}/sessions/{sessionId}/turns` */
export function careAgentsTurnPath(agentId: string, sessionId: string): string {
  return `${careAgentsSessionsPath(agentId)}/${pathSegment(sessionId, 'sessionId')}/turns`;
}

/** Streaming query used by `completeAgentTurnStream` in the generated SDK. */
export const CARE_AGENT_STREAM_QUERY = `?stream=true&event_protocol=kernel-v1`;
