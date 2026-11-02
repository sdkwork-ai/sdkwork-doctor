import type { DoctorReport } from '@sdkwork/doctor-common-diagnostics';
import { Panel } from '@sdkwork/doctor-pc-commons';

import { CheckList } from '../components/CheckList';

export function ChecksPage({ report }: { report: DoctorReport | null }) {
  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">Check catalog</h1>
          <p className="doctor-page-subtitle">Every check runs locally; no diagnostic data leaves the browser.</p>
        </div>
      </header>
      <Panel title="Results" description="Expand the details and fix hints for failing or attention checks.">
        <CheckList outcomes={report?.outcomes ?? []} showDetails />
      </Panel>
    </div>
  );
}
