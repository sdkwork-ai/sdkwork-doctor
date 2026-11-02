import { Navigate, Route, Routes } from 'react-router-dom';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import { demoSelfMember } from '@sdkwork/doctor-common-doctor';

import { ChatPage, DoctorPage, MePage } from '@sdkwork/doctor-h5-care';

import { MobileShell } from './MobileShell';

export interface DoctorH5RoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostPlatform: string;
}

export function DoctorH5Routes({ runtime }: DoctorH5RoutesProps) {
  return (
    <MobileShell appVersion={runtime.appVersion} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<Navigate replace to="chat" />} />
        <Route path="chat" element={<ChatPage member={demoSelfMember} />} />
        <Route path="doctor" element={<DoctorPage member={demoSelfMember} />} />
        <Route path="me" element={<MePage context={runtime} member={demoSelfMember} />} />
      </Routes>
    </MobileShell>
  );
}
