import type { DoctorReport, DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import { ActionButton, Panel, StatusBadge, formatCount, formatTimestamp } from '@sdkwork/doctor-pc-commons';

import { CheckList } from '../components/CheckList';

export function OverviewPage({ context, report, running, error, onRun }: {
  context: DoctorRuntimeContext;
  report: DoctorReport | null;
  running: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const summary = report?.summary ?? { ok: 0, warn: 0, error: 0, skipped: 0 };
  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">Workspace health</h1>
          <p className="doctor-page-subtitle">
            {context.profileId} · {context.locale} · {report ? 'last run ' + formatTimestamp(report.finishedAt, context.locale) : 'not run yet'}
          </p>
        </div>
        <ActionButton tone="primary" onClick={onRun} disabled={running}>
          {running ? 'Running...' : 'Run diagnostics'}
        </ActionButton>
      </header>

      {error ? <div className="doctor-error-banner">Diagnostics failed: {error}</div> : null}

      <div className="doctor-overview">
        <div className="doctor-stat">
          <div className="doctor-stat-label">Overall</div>
          <div className="doctor-stat-value">{report ? <StatusBadge status={report.status} /> : '-'}</div>
        </div>
        <div className="doctor-stat">
          <div className="doctor-stat-label">Healthy</div>
          <div className="doctor-stat-value">{summary.ok}</div>
        </div>
        <div className="doctor-stat">
          <div className="doctor-stat-label">Attention</div>
          <div className="doctor-stat-value">{summary.warn}</div>
        </div>
        <div className="doctor-stat">
          <div className="doctor-stat-label">Failing</div>
          <div className="doctor-stat-value">{summary.error}</div>
        </div>
      </div>

      <Panel
        title="Latest checks"
        description={report ? formatCount(report.outcomes.length, 'check', 'checks') + ' in the catalog.' : 'Run the catalog to populate this view.'}
      >
        <CheckList outcomes={report?.outcomes ?? []} />
      </Panel>
    </div>
  );
}
