/**
 * PC environment selection (APP_PC_ARCHITECTURE_SPEC 2.1, CONFIG_SPEC).
 *
 * The runtime profile id is injected by the Vite configuration from the
 * selected `--mode <deployment-profile>.<environment>`; runtime values arrive
 * from the same-origin runtime document at /runtime-env.json.
 */
export interface DoctorPcEnvironment {
  readonly deploymentProfile: 'standalone' | 'cloud';
  readonly environment: string;
  readonly profileId: string;
  readonly apiBaseUrl: string;
  readonly backendApiBaseUrl: string;
  readonly cloudApiBaseUrl: string;
}

interface RuntimeDocument {
  environment?: string;
  deploymentProfile?: string;
  profileId?: string;
  appApiBaseUrl?: string;
  backendApiBaseUrl?: string;
  cloudApiBaseUrl?: string;
}

const KNOWN_ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'];

export function resolveProfileId(): string {
  const injected = typeof __SDKWORK_DOCTOR_PROFILE_ID__ === 'string' ? __SDKWORK_DOCTOR_PROFILE_ID__ : '';
  return injected.includes('.') ? injected : 'standalone.development';
}

export function resolveEnvironmentFromDocument(document: RuntimeDocument | null): DoctorPcEnvironment {
  const [profileFromId = 'standalone', environmentFromId = 'development'] = resolveProfileId().split('.');
  const deploymentProfile = document?.deploymentProfile === 'cloud' || profileFromId === 'cloud' ? 'cloud' : 'standalone';
  const environment = document?.environment && KNOWN_ENVIRONMENTS.includes(document.environment)
    ? document.environment
    : environmentFromId;
  return Object.freeze({
    deploymentProfile,
    environment,
    profileId: document?.profileId ?? deploymentProfile + '.' + environment,
    apiBaseUrl: document?.appApiBaseUrl ?? '/',
    backendApiBaseUrl: document?.backendApiBaseUrl ?? '/',
    cloudApiBaseUrl: document?.cloudApiBaseUrl ?? '',
  });
}

export async function loadRuntimeEnvironment(): Promise<DoctorPcEnvironment> {
  try {
    const response = await fetch('/runtime-env.json', { cache: 'no-store' });
    if (!response.ok) {
      return resolveEnvironmentFromDocument(null);
    }
    return resolveEnvironmentFromDocument((await response.json()) as RuntimeDocument);
  } catch {
    return resolveEnvironmentFromDocument(null);
  }
}
