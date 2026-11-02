import { Navigate, Route, Routes } from 'react-router-dom';
import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import type { VisitRecordStore } from '@sdkwork/doctor-common-doctor';

import { ChatPage, DoctorPage, MePage, RecordsPage } from '@sdkwork/doctor-pc-care';
import { demoSelfMember } from '@sdkwork/doctor-common-doctor';

import { AppShell } from './AppShell';

export interface DoctorPcRoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostLabel: string;
  /** Conversation transport composed once by the app bootstrap. */
  readonly agent: AgentConversationPort;
  /** Device-local visit records shared by the chat and records tabs. */
  readonly records: VisitRecordStore;
}

export function DoctorPcRoutes({ runtime, agent, records }: DoctorPcRoutesProps) {
  return (
    <AppShell appVersion={runtime.appVersion} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<Navigate replace to="chat" />} />
        <Route path="chat" element={<ChatPage member={demoSelfMember} agent={agent} records={records} />} />
        <Route path="doctor" element={<DoctorPage member={demoSelfMember} />} />
        <Route path="records" element={<RecordsPage records={records} />} />
        <Route path="me" element={<MePage context={runtime} member={demoSelfMember} agent={agent} />} />
      </Routes>
    </AppShell>
  );
}
