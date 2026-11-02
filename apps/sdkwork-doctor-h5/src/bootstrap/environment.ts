/**
 * H5 environment selection (APP_H5_ARCHITECTURE_SPEC.md 2.1).
 *
 * The runtime profile id is injected by Vite from `--mode`; values arrive from
 * the same-origin runtime document served at /runtime-env.json.
 */
export interface DoctorH5Environment {
  readonly deploymentProfile: 'standalone' | 'cloud';
  readonly environment: string;
  readonly profileId: string;
  readonly apiBaseUrl: string;
  readonly backendApiBaseUrl: string;
  readonly agentsApiBaseUrl: string;
}

interface RuntimeDocument {
  environment?: string;
  deploymentProfile?: string;
  profileId?: string;
  appApiBaseUrl?: string;
  backendApiBaseUrl?: string;
  agentsApiBaseUrl?: string;
}

const KNOWN_ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'];

export function resolveProfileId(): string {
  const injected = typeof __SDKWORK_DOCTOR_PROFILE_ID__ === 'string' ? __SDKWORK_DOCTOR_PROFILE_ID__ : '';
  return injected.includes('.') ? injected : 'standalone.development';
}

export function resolveEnvironmentFromDocument(document: RuntimeDocument | null): DoctorH5Environment {
  const [profileFromId = 'standalone', environmentFromId = 'development'] = resolveProfileId().split('.');
  const deploymentProfile = document?.deploymentProfile === 'cloud' || profileFromId === 'cloud' ? 'cloud' : 'standalone';
  const environment = document?.environment && KNOWN_ENVIRONMENTS.includes(document.environment) ? document.environment : environmentFromId;
  return Object.freeze({
    deploymentProfile,
    environment,
    profileId: document?.profileId ?? deploymentProfile + '.' + environment,
    apiBaseUrl: document?.appApiBaseUrl ?? '/',
    backendApiBaseUrl: document?.backendApiBaseUrl ?? '/',
    agentsApiBaseUrl: document?.agentsApiBaseUrl ?? '',
  });
}

export async function loadRuntimeEnvironment(): Promise<DoctorH5Environment> {
  try {
    const response = await fetch('/runtime-env.json', { cache: 'no-store' });
    if (!response.ok) return resolveEnvironmentFromDocument(null);
    return resolveEnvironmentFromDocument((await response.json()) as RuntimeDocument);
  } catch {
    return resolveEnvironmentFromDocument(null);
  }
}
