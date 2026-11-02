import { Navigate, Route, Routes } from 'react-router-dom';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

import { ChatPage, DoctorPage, MePage } from '@sdkwork/doctor-pc-care';
import { demoSelfMember } from '@sdkwork/doctor-common-doctor';

import { AppShell } from './AppShell';

export interface DoctorPcRoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostLabel: string;
}

export function DoctorPcRoutes({ runtime }: DoctorPcRoutesProps) {
  return (
    <AppShell appVersion={runtime.appVersion} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<Navigate replace to="chat" />} />
        <Route path="chat" element={<ChatPage member={demoSelfMember} />} />
        <Route path="doctor" element={<DoctorPage member={demoSelfMember} />} />
        <Route path="me" element={<MePage context={runtime} member={demoSelfMember} />} />
      </Routes>
    </AppShell>
  );
}
