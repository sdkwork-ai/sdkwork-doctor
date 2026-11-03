import type { CareAgentEntrySurface } from './contract';
import type { CareTranslate } from './care-copy';
import { createHostedCareAgent, type CareAgentAccessTokenPort, type CareAgentFetch, type HostedCareAgentOptions } from './hosted';
import { resolveCareAgentMode } from './mode';
import { createLocalCareAgent } from './offline';
import type { AgentTurnContext, CareAgentRuntime } from './types';

export interface CreateCareAgentRuntimeOptions {
  readonly agentsApiBaseUrl?: string;
  readonly accessTokens?: CareAgentAccessTokenPort;
  readonly entrySurface: CareAgentEntrySurface;
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly systemPrompt?: HostedCareAgentOptions['systemPrompt'];
  readonly fetchImpl?: CareAgentFetch;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly onDelta?: (delta: string) => void;
  readonly stream?: boolean;
  /** Host i18n translator for the visible care copy (both transports). */
  readonly translate?: CareTranslate;
}

/**
 * Resolves the conversation runtime for one bootstrapped surface.
 *
 * The mode is decided from the runtime document plus the credential port, and
 * the returned runtime always reports which adapter actually answers. A hosted
 * configuration with no token is `offline` (observable), never a hosted claim
 * backed by the offline adapter.
 */
export async function createCareAgentRuntime(options: CreateCareAgentRuntimeOptions): Promise<CareAgentRuntime> {
  const token = options.accessTokens ? await options.accessTokens.getAccessToken() : null;
  const hasAccessToken = typeof token === 'string' && token.trim().length > 0;
  const mode = resolveCareAgentMode({ agentsApiBaseUrl: options.agentsApiBaseUrl, hasAccessToken });
  if (mode === 'offline' || !options.accessTokens) {
    return Object.freeze({ mode: 'offline', port: createLocalCareAgent({ translate: options.translate }) });
  }
  const hosted = createHostedCareAgent({
    agentsApiBaseUrl: options.agentsApiBaseUrl ?? '',
    accessTokens: options.accessTokens,
    entrySurface: options.entrySurface,
    agentId: options.agentId,
    sessionId: options.sessionId,
    systemPrompt: options.systemPrompt,
    fetchImpl: options.fetchImpl,
    now: options.now,
    createId: options.createId,
    onDelta: options.onDelta,
    stream: options.stream,
    translate: options.translate,
  });
  return Object.freeze({ mode: 'hosted', port: hosted });
}

