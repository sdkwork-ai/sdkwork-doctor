import { Navigate, Route, Routes } from 'react-router-dom';
import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

import { ChatPage, DoctorPage, MePage } from '@sdkwork/doctor-pc-care';
import { demoSelfMember } from '@sdkwork/doctor-common-doctor';

import { AppShell } from './AppShell';

export interface DoctorPcRoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostLabel: string;
  /** Conversation transport composed once by the app bootstrap. */
  readonly agent: AgentConversationPort;
}

export function DoctorPcRoutes({ runtime, agent }: DoctorPcRoutesProps) {
  return (
    <AppShell appVersion={runtime.appVersion} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<Navigate replace to="chat" />} />
        <Route path="chat" element={<ChatPage member={demoSelfMember} agent={agent} />} />
        <Route path="doctor" element={<DoctorPage member={demoSelfMember} />} />
        <Route path="me" element={<MePage context={runtime} member={demoSelfMember} agent={agent} />} />
      </Routes>
    </AppShell>
  );
}
