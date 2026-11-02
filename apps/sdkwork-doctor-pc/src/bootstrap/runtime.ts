import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import { applyThemeToStyle, resolveAppBlocks, resolveAppTheme, type ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';
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
  /** Blocks resolved for the PC surface, including deployment overrides. */
  readonly blocks: readonly ResolvedAppBlock[];
}

let runtimePromise: Promise<DoctorPcRuntime> | null = null;

/**
 * Compose the PC runtime once per page load. SDK clients and the block
 * composition are built here; UI packages receive the resolved ports.
 */
export function bootstrapDoctorPc(): Promise<DoctorPcRuntime> {
  if (!runtimePromise) {
    runtimePromise = loadRuntimeEnvironment().then(async (environment) => {
      const session = createAnonymousSessionPort();
      const careAgent = await createDoctorPcCareAgent({
        agentsApiBaseUrl: environment.agentsApiBaseUrl,
        accessToken: session.current().accessToken,
      });
      const blocks = resolveAppBlocks('pc', environment.appBlocks);
      // Personalization: deployment theme tokens become CSS variables before the
      // first paint, so no component needs to know about runtime configuration.
      applyThemeToStyle(document.documentElement.style, resolveAppTheme(environment.theme));
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
        blocks,
      };
    });
  }
  return runtimePromise;
}
