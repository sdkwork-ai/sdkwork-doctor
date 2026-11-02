import {
  createCareAgentRuntime,
  resolveCareAgentMode,
  type CareAgentAccessTokenPort,
  type CareAgentMode,
  type CareAgentRuntime,
} from '@sdkwork/doctor-common-agent';

/** Runtime inputs that decide the conversation transport for this surface. */
export interface DoctorPcAgentsEnvironment {
  readonly agentsApiBaseUrl: string;
  /** IAM/appbase session token, or null before sign-in. Never a `VITE_*` value. */
  readonly accessToken: string | null;
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
  });
}
