import i18n from 'i18next';

import type { AgentConversationPort, CareAgentCatalogPort } from '@sdkwork/doctor-common-agent';
import { applyThemeToStyle, resolveAppBlocks, resolveAppTheme, type ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';
import { createDoctorRuntimeContext, type DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import type { DoctorDirectoryPort, DoctorSelectionStore, PatientProfileStore, VisitRecordStore } from '@sdkwork/doctor-common-doctor';
import {
  createAnonymousSessionPort,
  createDoctorH5AgentCatalog,
  createDoctorH5CareAgent,
  createDoctorH5DoctorDirectoryPort,
  createDoctorH5DoctorSelectionStore,
  createDoctorH5PatientProfileStore,
  createDoctorH5VisitRecordStore,
} from '@sdkwork/doctor-h5-core';

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
  /** Managed agent catalogue: shows whether the family-doctor agent is deployed. */
  readonly agentCatalog: CareAgentCatalogPort;
  /** Household patient files, one per patient. */
  readonly patients: PatientProfileStore;
  /** Device-local selection of human family doctors. */
  readonly selection: DoctorSelectionStore;
  /** Deployment doctor directory with the authored fallback inside. */
  readonly doctorDirectory: DoctorDirectoryPort;
  /** Device-local consultation history shared by chat, landing, and records. */
  readonly records: VisitRecordStore;
  /** Blocks resolved for the H5 surface, including deployment overrides. */
  readonly blocks: readonly ResolvedAppBlock[];
}

let runtimePromise: Promise<DoctorH5Runtime> | null = null;

export function bootstrapDoctorH5(): Promise<DoctorH5Runtime> {
  if (!runtimePromise) {
    runtimePromise = loadRuntimeEnvironment().then(async (environment) => {
      const session = createAnonymousSessionPort();
      const careAgent = await createDoctorH5CareAgent({
        agentsApiBaseUrl: environment.agentsApiBaseUrl,
        accessToken: session.current().accessToken,
        // Live translator: the language toggle changes this without a reload.
        translate: (key, params) => (params ? i18n.t(key, params) : i18n.t(key)),
      });
      const blocks = resolveAppBlocks('h5', environment.appBlocks);
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
        agentCatalog: createDoctorH5AgentCatalog({
          agentsApiBaseUrl: environment.agentsApiBaseUrl,
          accessToken: session.current().accessToken,
        }),
        patients: createDoctorH5PatientProfileStore(),
        selection: createDoctorH5DoctorSelectionStore(),
        doctorDirectory: createDoctorH5DoctorDirectoryPort({ directoryUrl: environment.careDoctorDirectoryUrl }),
        records: createDoctorH5VisitRecordStore(),
        blocks,
      };
    });
  }
  return runtimePromise;
}
