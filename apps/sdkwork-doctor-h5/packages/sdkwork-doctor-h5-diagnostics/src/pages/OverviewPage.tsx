import { useTranslation } from 'react-i18next';
import type { DoctorReport, DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import { ActionButton, MobileCard, StatusBadge, formatTimestamp } from '@sdkwork/doctor-h5-commons';

import { CheckList } from '../components/CheckList';

export function OverviewPage({ context, report, running, error, onRun }: {
  context: DoctorRuntimeContext;
  report: DoctorReport | null;
  running: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const { t } = useTranslation();
  const summary = report?.summary ?? { ok: 0, warn: 0, error: 0, skipped: 0 };
  const subtitle = report
    ? t('platform.diagnostics.page.overview.subtitle.lastRun', {
      profileId: context.profileId,
      locale: context.locale,
      time: formatTimestamp(report.finishedAt, context.locale),
    })
    : t('platform.diagnostics.page.overview.subtitle.notRun', {
      profileId: context.profileId,
      locale: context.locale,
    });

  return (
    <div>
      <h1 className="doctor-page-title">{t('platform.diagnostics.page.overview.title')}</h1>
      <p className="doctor-page-subtitle">{subtitle}</p>

      {error ? (
        <div className="doctor-error-banner">
          {t('platform.diagnostics.error.runFailed', { message: error })}
        </div>
      ) : null}

      <div className="doctor-overview">
        <div className="doctor-stat">
          <div className="doctor-stat-label">{t('platform.diagnostics.stat.overall')}</div>
          <div className="doctor-stat-value">
            {report ? <StatusBadge label={t('platform.diagnostics.status.' + report.status)} status={report.status} /> : '-'}
          </div>
        </div>
        <div className="doctor-stat">
          <div className="doctor-stat-label">{t('platform.diagnostics.stat.healthy')}</div>
          <div className="doctor-stat-value">{summary.ok}</div>
        </div>
        <div className="doctor-stat">
          <div className="doctor-stat-label">{t('platform.diagnostics.stat.attention')}</div>
          <div className="doctor-stat-value">{summary.warn}</div>
        </div>
        <div className="doctor-stat">
          <div className="doctor-stat-label">{t('platform.diagnostics.stat.failing')}</div>
          <div className="doctor-stat-value">{summary.error}</div>
        </div>
      </div>

      <ActionButton tone="primary" onClick={onRun} disabled={running}>
        {running ? t('platform.diagnostics.action.running') : t('platform.diagnostics.action.run')}
      </ActionButton>

      <div style={{ height: 12 }} />

      <MobileCard title={t('platform.diagnostics.panel.latest.title')}>
        <CheckList outcomes={report?.outcomes ?? []} />
      </MobileCard>
    </div>
  );
}
