import {
  createCareAgentCatalog,
  createCareAgentRuntime,
  resolveCareAgentMode,
  type CareAgentAccessTokenPort,
  type CareAgentCatalogPort,
  type CareAgentMode,
  type CareAgentRuntime,
} from '@sdkwork/doctor-common-agent';

/** Runtime inputs that decide the conversation transport for this surface. */
export interface DoctorH5AgentsEnvironment {
  readonly agentsApiBaseUrl: string;
  /** IAM/appbase session token, or null before sign-in. Never a `VITE_*` value. */
  readonly accessToken: string | null;
}

/**
 * Token port handed to the shared transport. The H5 core package is the only
 * place allowed to read the session token; feature packages receive the port.
 */
export function createDoctorH5AccessTokenPort(environment: DoctorH5AgentsEnvironment): CareAgentAccessTokenPort {
  return Object.freeze({ getAccessToken: () => environment.accessToken });
}

/** Observable mode for the Me tab; never inferred from the adapter that answered. */
export function readDoctorH5CareAgentMode(environment: DoctorH5AgentsEnvironment): CareAgentMode {
  return resolveCareAgentMode({
    agentsApiBaseUrl: environment.agentsApiBaseUrl,
    hasAccessToken: (environment.accessToken ?? '').trim().length > 0,
  });
}

/** Builds the conversation runtime for the H5 surface (hosted or offline). */
export function createDoctorH5CareAgent(environment: DoctorH5AgentsEnvironment): Promise<CareAgentRuntime> {
  return createCareAgentRuntime({
    agentsApiBaseUrl: environment.agentsApiBaseUrl,
    accessTokens: createDoctorH5AccessTokenPort(environment),
    entrySurface: 'pc',
  });
}

/**
 * Agent catalogue capability (sdkwork-agents `agents.list`). The doctor tab
 * shows whether the pinned family-doctor agent is present in this deployment;
 * offline mode answers with an empty catalogue and no network call.
 */
export function createDoctorH5AgentCatalog(environment: DoctorH5AgentsEnvironment): CareAgentCatalogPort {
  return createCareAgentCatalog({
    agentsApiBaseUrl: environment.agentsApiBaseUrl,
    accessTokens: createDoctorH5AccessTokenPort(environment),
  });
}
