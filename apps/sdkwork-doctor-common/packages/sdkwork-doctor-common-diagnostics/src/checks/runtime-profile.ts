import type { DoctorCheck } from '../types';

const KNOWN_ENVIRONMENTS = new Set(['development', 'test', 'staging', 'demo', 'production']);

export const runtimeProfileCheck: DoctorCheck = {
  id: 'configuration.runtime-profile',
  title: 'Runtime profile',
  description: 'The surface must resolve one deployment profile and one lifecycle environment before SDK construction.',
  category: 'configuration',
  async run(context) {
    const details: string[] = [
      'deploymentProfile=' + context.deploymentProfile,
      'environment=' + context.environment,
      'profileId=' + context.profileId,
      'appVersion=' + context.appVersion,
    ];
    if (!KNOWN_ENVIRONMENTS.has(context.environment)) {
      return {
        status: 'error',
        summary: 'Unknown lifecycle environment: ' + context.environment,
        details,
        hint: 'Use development, test, staging, demo, or production.',
      };
    }
    if (context.profileId !== context.deploymentProfile + '.' + context.environment) {
      return {
        status: 'warn',
        summary: 'Profile id does not match the selected profile and environment.',
        details,
      };
    }
    return { status: 'ok', summary: 'Runtime profile is consistent.', details };
  },
};
