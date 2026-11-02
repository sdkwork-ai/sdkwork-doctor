import type { DoctorRuntimeContext } from './types';

export interface DoctorRuntimeContextInput {
  deploymentProfile: 'standalone' | 'cloud';
  environment: string;
  profileId: string;
  appVersion: string;
  apiBaseUrl: string;
  backendApiBaseUrl: string;
  locale?: string;
  now?: () => Date;
}

/**
 * Build the immutable runtime context every check receives.
 */
export function createDoctorRuntimeContext(input: DoctorRuntimeContextInput): DoctorRuntimeContext {
  const profileId = input.profileId || input.deploymentProfile + '.' + input.environment;
  return Object.freeze({
    deploymentProfile: input.deploymentProfile,
    environment: input.environment,
    profileId,
    appVersion: input.appVersion,
    apiBaseUrl: input.apiBaseUrl,
    backendApiBaseUrl: input.backendApiBaseUrl,
    locale: input.locale ?? readDocumentLocale(),
    now: input.now ?? (() => new Date()),
  });
}

export function readDocumentLocale(): string {
  if (typeof navigator === 'undefined') {
    return 'en';
  }
  return navigator.language || 'en';
}
