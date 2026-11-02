import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import { createDoctorRuntimeContext, type DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import { createAnonymousSessionPort, createDoctorH5CareAgent } from '@sdkwork/doctor-h5-core';

import { loadRuntimeEnvironment, type DoctorH5Environment } from './environment';

export interface DoctorH5Runtime {
  readonly environment: DoctorH5Environment;
  readonly context: DoctorRuntimeContext;
  /**
   * Conversation transport for this page load. Hosted when the runtime
   * document carries `agentsApiBaseUrl` and the session exposes a token;
   * offline otherwise. The mode travels with the port so the UI never guesses.
   */
  readonly agent: AgentConversationPort;
}

let runtimePromise: Promise<DoctorH5Runtime> | null = null;

export function bootstrapDoctorH5(): Promise<DoctorH5Runtime> {
  if (!runtimePromise) {
    runtimePromise = loadRuntimeEnvironment().then(async (environment) => {
      const session = createAnonymousSessionPort();
      const careAgent = await createDoctorH5CareAgent({
        agentsApiBaseUrl: environment.agentsApiBaseUrl,
        accessToken: session.current().accessToken,
      });
      return {
        environment,
        context: createDoctorRuntimeContext({
          deploymentProfile: environment.deploymentProfile,
          environment: environment.environment,
          profileId: environment.profileId,
          appVersion: __SDKWORK_DOCTOR_APP_VERSION__,
          apiBaseUrl: environment.apiBaseUrl,
          backendApiBaseUrl: environment.backendApiBaseUrl,
        }),
        agent: careAgent.port,
      };
    });
  }
  return runtimePromise;
}
