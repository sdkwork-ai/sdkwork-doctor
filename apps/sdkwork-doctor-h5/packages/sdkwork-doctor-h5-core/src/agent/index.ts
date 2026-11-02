import {
  createCareAgentRuntime,
  resolveCareAgentMode,
  type CareAgentAccessTokenPort,
  type CareAgentMode,
  type CareAgentRuntime,
} from '@sdkwork/doctor-common-agent';

/** Runtime inputs that decide the conversation transport for this surface. */
export interface DoctorH5AgentsEnvironment {
  readonly agentsApiBaseUrl: string;
  /** IAM/appbase session token, or null before sign-in. Never a `VITE_*` value. */
  readonly accessToken: string | null;
}

export function createDoctorH5AccessTokenPort(environment: DoctorH5AgentsEnvironment): CareAgentAccessTokenPort {
  return Object.freeze({ getAccessToken: () => environment.accessToken });
}

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
    entrySurface: 'h5',
  });
}
