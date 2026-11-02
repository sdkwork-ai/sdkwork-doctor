import { Navigate, Route, Routes } from 'react-router-dom';
import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import type { ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import type { VisitRecordStore } from '@sdkwork/doctor-common-doctor';
import { demoSelfMember } from '@sdkwork/doctor-common-doctor';

import { CARE_MEMBERS, ChatPage, DoctorPage, HomePage, MePage, RecordsPage } from '@sdkwork/doctor-h5-care';

import { MobileShell } from './MobileShell';

export interface DoctorH5RoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostPlatform: string;
  /** Conversation transport composed once by the app bootstrap. */
  readonly agent: AgentConversationPort;
  /** Device-local visit records shared by the chat, home, and records blocks. */
  readonly records: VisitRecordStore;
  /** Blocks resolved for this surface from the composition contract. */
  readonly blocks: readonly ResolvedAppBlock[];
}

export function DoctorH5Routes({ runtime, agent, records, blocks }: DoctorH5RoutesProps) {
  const home = blocks.find((block) => block.id === 'home');
  const landing = home ? home.route.replace('/doctor/', '') : 'chat';

  return (
    <MobileShell appVersion={runtime.appVersion} blocks={blocks} profileId={runtime.profileId}>
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
    </MobileShell>
  );
}
