import { Route, Routes } from 'react-router-dom';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

import { ChecksPage, EnvironmentPage, OverviewPage, useDiagnosticsReport } from '@sdkwork/doctor-pc-diagnostics';

import { AppShell } from './AppShell';

export interface DoctorPcRoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostLabel: string;
}

export function DoctorPcRoutes({ runtime, hostLabel }: DoctorPcRoutesProps) {
  const state = useDiagnosticsReport(runtime);
  return (
    <AppShell appVersion={runtime.appVersion} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<OverviewPage context={runtime} error={state.error} onRun={state.run} report={state.report} running={state.running} />} />
        <Route path="checks" element={<ChecksPage report={state.report} />} />
        <Route path="environment" element={<EnvironmentPage context={runtime} hostPlatform={hostLabel} />} />
      </Routes>
    </AppShell>
  );
}
