import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import { createDoctorRuntimeContext, type DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import type { VisitRecordStore } from '@sdkwork/doctor-common-doctor';
import { createAnonymousSessionPort, createDoctorPcCareAgent, createDoctorPcVisitRecordStore } from '@sdkwork/doctor-pc-core';

import { loadRuntimeEnvironment, type DoctorPcEnvironment } from './environment';

export interface DoctorPcRuntime {
  readonly environment: DoctorPcEnvironment;
  readonly context: DoctorRuntimeContext;
  /**
   * Conversation transport for this page load. Hosted when the runtime
   * document carries `agentsApiBaseUrl` and the session exposes a token;
   * offline otherwise. The mode travels with the port so the UI never guesses.
   */
  readonly agent: AgentConversationPort;
  /** Device-local consultation history shared by the chat and records tabs. */
  readonly records: VisitRecordStore;
}

let runtimePromise: Promise<DoctorPcRuntime> | null = null;

/**
 * Compose the PC runtime once per page load. SDK clients are constructed in the
 * core package; UI packages receive the ports.
 */
export function bootstrapDoctorPc(): Promise<DoctorPcRuntime> {
  if (!runtimePromise) {
    runtimePromise = loadRuntimeEnvironment().then(async (environment) => {
      const session = createAnonymousSessionPort();
      const careAgent = await createDoctorPcCareAgent({
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
        records: createDoctorPcVisitRecordStore(),
      };
    });
  }
  return runtimePromise;
}
