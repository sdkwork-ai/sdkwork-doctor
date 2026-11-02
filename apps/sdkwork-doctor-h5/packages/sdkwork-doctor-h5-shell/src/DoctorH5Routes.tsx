import { Route, Routes } from 'react-router-dom';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

import { ChecksPage, EnvironmentPage, OverviewPage, useDiagnosticsReport } from '@sdkwork/doctor-h5-diagnostics';

import { MobileShell } from './MobileShell';

export interface DoctorH5RoutesProps {
  readonly runtime: DoctorRuntimeContext;
  readonly hostPlatform: string;
}

export function DoctorH5Routes({ runtime, hostPlatform }: DoctorH5RoutesProps) {
  const state = useDiagnosticsReport(runtime);
  return (
    <MobileShell appVersion={runtime.appVersion} profileId={runtime.profileId}>
      <Routes>
        <Route index element={<OverviewPage context={runtime} error={state.error} onRun={state.run} report={state.report} running={state.running} />} />
        <Route path="checks" element={<ChecksPage report={state.report} />} />
        <Route path="environment" element={<EnvironmentPage context={runtime} hostPlatform={hostPlatform} />} />
      </Routes>
    </MobileShell>
  );
}
