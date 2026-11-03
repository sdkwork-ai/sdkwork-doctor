import {
  createCareAgentCatalog,
  createCareAgentRuntime,
  resolveCareAgentMode,
  type CareAgentAccessTokenPort,
  type CareAgentCatalogPort,
  type CareAgentMode,
  type CareAgentRuntime,
  type CareTranslate,
} from '@sdkwork/doctor-common-agent';

/** Runtime inputs that decide the conversation transport for this surface. */
export interface DoctorPcAgentsEnvironment {
  readonly agentsApiBaseUrl: string;
  /** IAM/appbase session token, or null before sign-in. Never a `VITE_*` value. */
  readonly accessToken: string | null;
  /** Live i18n translator; absence keeps the transport's English fallback. */
  readonly translate?: CareTranslate;
}

/**
 * Token port handed to the shared transport. The PC core package is the only
 * place allowed to read the session token; feature packages receive the port.
 */
export function createDoctorPcAccessTokenPort(environment: DoctorPcAgentsEnvironment): CareAgentAccessTokenPort {
  return Object.freeze({ getAccessToken: () => environment.accessToken });
}

/** Observable mode for the Me tab; never inferred from the adapter that answered. */
export function readDoctorPcCareAgentMode(environment: DoctorPcAgentsEnvironment): CareAgentMode {
  return resolveCareAgentMode({
    agentsApiBaseUrl: environment.agentsApiBaseUrl,
    hasAccessToken: (environment.accessToken ?? '').trim().length > 0,
  });
}

/** Builds the conversation runtime for the PC surface (hosted or offline). */
export function createDoctorPcCareAgent(environment: DoctorPcAgentsEnvironment): Promise<CareAgentRuntime> {
  return createCareAgentRuntime({
    agentsApiBaseUrl: environment.agentsApiBaseUrl,
    accessTokens: createDoctorPcAccessTokenPort(environment),
    entrySurface: 'pc',
    translate: environment.translate,
  });
}

/**
 * Agent catalogue capability (sdkwork-agents `agents.list`). The doctor tab
 * shows whether the pinned family-doctor agent is present in this deployment;
 * offline mode answers with an empty catalogue and no network call.
 */
export function createDoctorPcAgentCatalog(environment: DoctorPcAgentsEnvironment): CareAgentCatalogPort {
  return createCareAgentCatalog({
    agentsApiBaseUrl: environment.agentsApiBaseUrl,
    accessTokens: createDoctorPcAccessTokenPort(environment),
  });
}
