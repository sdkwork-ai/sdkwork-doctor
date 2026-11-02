import { createDoctorRuntimeContext, type DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

import { loadRuntimeEnvironment, type DoctorPcEnvironment } from './environment';

export interface DoctorPcRuntime {
  readonly environment: DoctorPcEnvironment;
  readonly context: DoctorRuntimeContext;
}

let runtimePromise: Promise<DoctorPcRuntime> | null = null;

/**
 * Compose the PC runtime once per page load. SDK clients are added here (or in
 * the owning core package) later; UI packages never construct them.
 */
export function bootstrapDoctorPc(): Promise<DoctorPcRuntime> {
  if (!runtimePromise) {
    runtimePromise = loadRuntimeEnvironment().then((environment) => ({
      environment,
      context: createDoctorRuntimeContext({
        deploymentProfile: environment.deploymentProfile,
        environment: environment.environment,
        profileId: environment.profileId,
        appVersion: __SDKWORK_DOCTOR_APP_VERSION__,
        apiBaseUrl: environment.apiBaseUrl,
        backendApiBaseUrl: environment.backendApiBaseUrl,
      }),
    }));
  }
  return runtimePromise;
}
