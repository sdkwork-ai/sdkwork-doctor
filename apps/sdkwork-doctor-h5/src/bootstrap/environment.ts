/**
 * H5 environment selection (APP_H5_ARCHITECTURE_SPEC.md 2.1).
 *
 * The runtime profile id is injected by Vite from `--mode`; values arrive from
 * the same-origin runtime document served at /runtime-env.json.
 *
 * The optional `app` and `theme` sections customize the composition and palette
 * per deployment; validation lives in `@sdkwork/doctor-common-blocks`.
 */
import type { AppBlockOverrides } from '@sdkwork/doctor-common-blocks';

export interface DoctorH5Environment {
  readonly deploymentProfile: 'standalone' | 'cloud';
  readonly environment: string;
  readonly profileId: string;
  readonly apiBaseUrl: string;
  readonly backendApiBaseUrl: string;
  readonly agentsApiBaseUrl: string;
  readonly appBlocks: AppBlockOverrides;
  readonly theme: Readonly<Record<string, unknown>>;
}

interface RuntimeDocument {
  environment?: string;
  deploymentProfile?: string;
  profileId?: string;
  appApiBaseUrl?: string;
  backendApiBaseUrl?: string;
  agentsApiBaseUrl?: string;
  app?: { blocks?: AppBlockOverrides };
  theme?: Record<string, unknown>;
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
  const appBlocks = document?.app?.blocks;
  return Object.freeze({
    deploymentProfile,
    environment,
    profileId: document?.profileId ?? deploymentProfile + '.' + environment,
    apiBaseUrl: document?.appApiBaseUrl ?? '/',
    backendApiBaseUrl: document?.backendApiBaseUrl ?? '/',
    agentsApiBaseUrl: document?.agentsApiBaseUrl ?? '',
    appBlocks: Object.freeze({
      hidden: Array.isArray(appBlocks?.hidden) ? [...appBlocks.hidden] : [],
      order: Array.isArray(appBlocks?.order) ? [...appBlocks.order] : [],
      labels: appBlocks?.labels && typeof appBlocks.labels === 'object' ? { ...appBlocks.labels } : {},
    }),
    theme: Object.freeze({ ...(document?.theme ?? {}) }),
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
