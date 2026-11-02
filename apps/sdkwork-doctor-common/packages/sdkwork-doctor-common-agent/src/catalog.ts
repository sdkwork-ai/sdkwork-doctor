/**
 * Agent catalogue capability from the sdkwork-agents app API.
 *
 * The family doctor conversation runs on a managed agent, so the app also
 * reads the managed agent list: it shows whether the pinned family-doctor agent
 * is present and active in this deployment, and it keeps the agent identity
 * visible instead of hiding it behind a transport switch.
 *
 * Authority: `sdkwork-agents` app API OpenAPI operation `agents.list`
 * (`GET /app/v3/api/ai/agents`), pinned in `specs/agents-app-api.contract.json`.
 */
import type { CareAgentAccessTokenPort, CareAgentHttpResponse } from './hosted';
import { CARE_AGENTS_API_PREFIX, resolveCareAgentsBaseUrl } from './contract';
import type { CareAgentMode } from './mode';

/** `agents.list` path, relative to the gateway root. */
export const CARE_AGENT_CATALOG_PATH = `${CARE_AGENTS_API_PREFIX}/ai/agents`;

/** One page is enough for a status probe; the API stays offset-paginated. */
export const CARE_AGENT_CATALOG_PAGE_SIZE = 20;

/** One managed agent, reduced to the fields a client renders. */
export interface CareAgentSummary {
  readonly agentId: string;
  readonly displayName: string;
  readonly status: string;
  readonly description: string;
}

export interface CareAgentCatalogPort {
  readonly mode: CareAgentMode;
  /** Empty when the transport is offline; throws only on a malformed response. */
  readonly list: () => Promise<readonly CareAgentSummary[]>;
}

/** Minimal GET-only HTTP surface so tests can inject a fetch double. */
export type CareAgentHttpGet = (
  url: string,
  init: { readonly method: 'GET'; readonly headers: Readonly<Record<string, string>> },
) => Promise<CareAgentHttpResponse>;

export interface CreateCareAgentCatalogOptions {
  readonly agentsApiBaseUrl: string;
  readonly accessTokens: CareAgentAccessTokenPort;
  readonly fetchImpl?: CareAgentHttpGet;
  readonly pageSize?: number;
}

function defaultFetch(): CareAgentHttpGet {
  return (url, init) => fetch(url, init);
}

function assertEnvelope(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('agents catalogue response is not an object');
  }
  const envelope = payload as Record<string, unknown>;
  if (envelope.code !== 0) {
    throw new Error('agents catalogue response did not carry success code 0');
  }
  if (typeof envelope.traceId !== 'string' || envelope.traceId.length === 0) {
    throw new Error('agents catalogue response is missing traceId');
  }
  const data = envelope.data;
  if (typeof data !== 'object' || data === null) {
    throw new Error('agents catalogue response is missing data');
  }
  return data as Record<string, unknown>;
}

function summaryFromUnknown(value: unknown): CareAgentSummary | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.agentId !== 'string' || !candidate.agentId.trim()) return null;
  if (typeof candidate.displayName !== 'string' || !candidate.displayName.trim()) return null;
  return Object.freeze({
    agentId: candidate.agentId.trim(),
    displayName: candidate.displayName.trim(),
    status: typeof candidate.status === 'string' ? candidate.status : 'unknown',
    description: typeof candidate.description === 'string' ? candidate.description : '',
  });
}

/**
 * Builds the catalogue port for one surface. The offline runtime answers with
 * an empty list and never performs a network call, so the mode stays observable
 * (ADR-20261102) instead of silently probing a service that does not exist.
 */
export function createCareAgentCatalog(options: CreateCareAgentCatalogOptions): CareAgentCatalogPort {
  const hasToken = typeof options.accessTokens?.getAccessToken === 'function';
  if (!hasToken || !(options.agentsApiBaseUrl ?? '').trim()) {
    return Object.freeze({
      mode: 'offline' as const,
      list: async () => Object.freeze([]) as readonly CareAgentSummary[],
    });
  }
  const baseUrl = resolveCareAgentsBaseUrl(options.agentsApiBaseUrl);
  const httpGet = options.fetchImpl ?? defaultFetch();
  const pageSize = Math.min(Math.max(1, options.pageSize ?? CARE_AGENT_CATALOG_PAGE_SIZE), 200);

  return Object.freeze({
    mode: 'hosted' as const,
    list: async () => {
      const token = (await options.accessTokens.getAccessToken() ?? '').trim();
      if (!token) throw new Error('agents catalogue requires an appbase IAM access token');
      const url = `${baseUrl}${CARE_AGENT_CATALOG_PATH}?page=1&page_size=${String(pageSize)}`;
      const response = await httpGet(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error('agents catalogue responded with HTTP ' + String(response.status));
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new Error('agents catalogue returned a body that is not JSON');
      }
      const data = assertEnvelope(payload);
      const items = Array.isArray(data.items) ? data.items : [];
      const agents = items
        .map(summaryFromUnknown)
        .filter((entry): entry is CareAgentSummary => entry !== null);
      return Object.freeze(agents) as readonly CareAgentSummary[];
    },
  });
}

/** The pinned family-doctor agent in a catalogue, or undefined when absent. */
export function findCareAgent(
  agents: readonly CareAgentSummary[],
  agentId: string,
): CareAgentSummary | undefined {
  return agents.find((agent) => agent.agentId === agentId);
}
