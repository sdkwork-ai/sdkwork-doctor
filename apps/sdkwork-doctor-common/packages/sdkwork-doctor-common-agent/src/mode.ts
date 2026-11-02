export type CareAgentMode = 'hosted' | 'offline';

export interface CareAgentEnvironment {
  readonly agentsApiBaseUrl?: string;
  readonly hasAccessToken?: boolean;
}

/**
 * Selects the conversation transport for this runtime.
 *
 * Selection is explicit and observable: a hosted base URL plus a credential
 * selects `hosted`; everything else selects `offline`. Callers must surface the
 * mode (ADR-20261102) and must not silently substitute the offline adapter when
 * hosted was requested.
 */
export function resolveCareAgentMode(environment: CareAgentEnvironment): CareAgentMode {
  const baseUrl = (environment.agentsApiBaseUrl ?? '').trim();
  if (baseUrl === '') return 'offline';
  if (!environment.hasAccessToken) return 'offline';
  return 'hosted';
}

export class HostedAgentNotConfiguredError extends Error {
  constructor() {
    super('hosted agents transport is selected but not constructed; wire @sdkwork/agents-app-sdk in the core package before use');
    this.name = 'HostedAgentNotConfiguredError';
  }
}
