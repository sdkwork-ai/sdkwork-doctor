import { useTranslation } from 'react-i18next';
import type { DoctorReport } from '@sdkwork/doctor-common-diagnostics';
import { MobileCard } from '@sdkwork/doctor-h5-commons';

import { CheckList } from '../components/CheckList';

export function ChecksPage({ report }: { report: DoctorReport | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="doctor-page-title">{t('platform.diagnostics.page.checks.title')}</h1>
      <p className="doctor-page-subtitle">{t('platform.diagnostics.page.checks.subtitle')}</p>
      <MobileCard title={t('platform.diagnostics.panel.results.title')}>
        <CheckList outcomes={report?.outcomes ?? []} showDetails />
      </MobileCard>
    </div>
  );
}
