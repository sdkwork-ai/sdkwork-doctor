import { Navigate, Route, Routes } from 'react-router-dom';
import type { AgentConversationPort, CareAgentCatalogPort } from '@sdkwork/doctor-common-agent';
import type { ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import type {
  DoctorDirectoryPort,
  DoctorSelectionStore,
  PatientProfileStore,
  VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';

import {
  ChatPage,
  DoctorPage,
  HomePage,
  MePage,
  RecordsPage,
  useCareAgentCatalog,
  useDoctorRoster,
} from '@sdkwork/doctor-h5-care';

import { MobileShell } from './MobileShell';

export interface DoctorH5RoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostPlatform: string;
  /** Conversation transport composed once by the app bootstrap. */
  readonly agent: AgentConversationPort;
  /** Device-local visit records shared by chat, landing, and records. */
  readonly records: VisitRecordStore;
  /** Household patient files (several patients per family). */
  readonly patients: PatientProfileStore;
  /** Device-local selection of human family doctors. */
  readonly selection: DoctorSelectionStore;
  /** Deployment doctor directory with the authored fallback inside. */
  readonly doctorDirectory: DoctorDirectoryPort;
  /** sdkwork-agents catalogue port, used to show the managed agent status. */
  readonly agentCatalog: CareAgentCatalogPort;
  /** Blocks resolved for this surface from the composition contract. */
  readonly blocks: readonly ResolvedAppBlock[];
}

/**
 * Route composition for the H5 surface: the same four tabs as every other
 * client, a workbench landing at `/doctor`, and a `/doctor/me/records` redirect
 * that keeps older links working.
 */
export function DoctorH5Routes({
  runtime,
  agent,
  records,
  patients,
  selection,
  doctorDirectory,
  agentCatalog,
  blocks,
}: DoctorH5RoutesProps) {
  const rosterState = useDoctorRoster(doctorDirectory);
  const catalogState = useCareAgentCatalog(agentCatalog);

  return (
    <MobileShell appVersion={runtime.appVersion} blocks={blocks} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<HomePage agent={agent} blocks={blocks} patients={patients} records={records} roster={rosterState.roster} selection={selection} />} />
        <Route path="chat" element={<ChatPage agent={agent} patients={patients} records={records} />} />
        <Route
          path="doctor"
          element={(
            <DoctorPage
              agentMode={agent.mode}
              agents={catalogState.agents}
              patients={patients}
              records={records}
              roster={rosterState.roster}
              rosterLoading={rosterState.loading}
              selection={selection}
            />
          )}
        />
        <Route path="me" element={<MePage agent={agent} agents={catalogState.agents} context={runtime} patients={patients} records={records} roster={rosterState.roster} selection={selection} />} />
        <Route path="records" element={<RecordsPage records={records} />} />
        <Route path="me/records" element={<Navigate replace to="/doctor/records" />} />
        <Route path="*" element={<Navigate replace to="/doctor" />} />
      </Routes>
    </MobileShell>
  );
}
