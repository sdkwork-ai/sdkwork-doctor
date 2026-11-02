import type { DoctorReport } from '@sdkwork/doctor-common-diagnostics';
import { MobileCard } from '@sdkwork/doctor-h5-commons';

import { CheckList } from '../components/CheckList';

export function ChecksPage({ report }: { report: DoctorReport | null }) {
  return (
    <div>
      <h1 className="doctor-page-title">Check catalog</h1>
      <p className="doctor-page-subtitle">Every check runs on-device; no diagnostic data leaves the browser.</p>
      <MobileCard title="Results">
        <CheckList outcomes={report?.outcomes ?? []} showDetails />
      </MobileCard>
    </div>
  );
}
