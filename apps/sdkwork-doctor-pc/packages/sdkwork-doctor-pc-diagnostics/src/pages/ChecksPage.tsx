import { useTranslation } from 'react-i18next';
import type { DoctorReport } from '@sdkwork/doctor-common-diagnostics';
import { Panel } from '@sdkwork/doctor-pc-commons';

import { CheckList } from '../components/CheckList';

export function ChecksPage({ report }: { report: DoctorReport | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.diagnostics.page.checks.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.diagnostics.page.checks.subtitle')}</p>
        </div>
      </header>
      <Panel
        title={t('platform.diagnostics.panel.results.title')}
        description={t('platform.diagnostics.panel.results.description')}
      >
        <CheckList outcomes={report?.outcomes ?? []} showDetails />
      </Panel>
    </div>
  );
}
