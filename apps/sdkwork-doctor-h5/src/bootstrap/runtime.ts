import { createDoctorRuntimeContext, type DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

import { loadRuntimeEnvironment, type DoctorH5Environment } from './environment';

export interface DoctorH5Runtime {
  readonly environment: DoctorH5Environment;
  readonly context: DoctorRuntimeContext;
}

let runtimePromise: Promise<DoctorH5Runtime> | null = null;

export function bootstrapDoctorH5(): Promise<DoctorH5Runtime> {
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
