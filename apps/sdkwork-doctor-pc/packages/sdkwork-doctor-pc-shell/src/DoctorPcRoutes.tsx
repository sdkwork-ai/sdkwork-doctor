import { Navigate, Route, Routes } from 'react-router-dom';
import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import type { ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import type { VisitRecordStore } from '@sdkwork/doctor-common-doctor';

import { CARE_MEMBERS, ChatPage, DoctorPage, HomePage, MePage, RecordsPage } from '@sdkwork/doctor-pc-care';
import { demoSelfMember } from '@sdkwork/doctor-common-doctor';

import { AppShell } from './AppShell';

export interface DoctorPcRoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostLabel: string;
  /** Conversation transport composed once by the app bootstrap. */
  readonly agent: AgentConversationPort;
  /** Device-local visit records shared by the chat, home, and records blocks. */
  readonly records: VisitRecordStore;
  /** Blocks resolved for this surface from the composition contract. */
  readonly blocks: readonly ResolvedAppBlock[];
}

export function DoctorPcRoutes({ runtime, agent, records, blocks }: DoctorPcRoutesProps) {
  const home = blocks.find((block) => block.id === 'home');
  const landing = home ? home.route.replace('/doctor/', '') : 'chat';

  return (
    <AppShell appVersion={runtime.appVersion} blocks={blocks} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<Navigate replace to={landing} />} />
        <Route
          path="home"
          element={<HomePage agent={agent} blocks={blocks} member={demoSelfMember} members={CARE_MEMBERS} records={records} />}
        />
        <Route path="chat" element={<ChatPage agent={agent} member={demoSelfMember} records={records} />} />
        <Route path="doctor" element={<DoctorPage member={demoSelfMember} />} />
        <Route path="records" element={<RecordsPage records={records} />} />
        <Route path="me" element={<MePage agent={agent} context={runtime} member={demoSelfMember} />} />
      </Routes>
    </AppShell>
  );
}
