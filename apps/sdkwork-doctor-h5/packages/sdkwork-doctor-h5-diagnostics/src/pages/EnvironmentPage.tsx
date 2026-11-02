import { useTranslation } from 'react-i18next';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import { MobileCard } from '@sdkwork/doctor-h5-commons';

export function EnvironmentPage({ context, hostPlatform }: { context: DoctorRuntimeContext; hostPlatform: string }) {
  const { t } = useTranslation();
  const unset = t('platform.diagnostics.value.unset');
  const rows: Array<[string, string]> = [
    [t('platform.diagnostics.fact.deploymentProfile'), context.deploymentProfile],
    [t('platform.diagnostics.fact.environment'), context.environment],
    [t('platform.diagnostics.fact.profileId'), context.profileId],
    [t('platform.diagnostics.fact.appVersion'), context.appVersion],
    [t('platform.diagnostics.fact.apiBaseUrl'), context.apiBaseUrl || unset],
    [t('platform.diagnostics.fact.backendApiBaseUrl'), context.backendApiBaseUrl || unset],
    [t('platform.diagnostics.fact.locale'), context.locale],
    [t('platform.diagnostics.fact.host'), hostPlatform],
  ];
  return (
    <div>
      <h1 className="doctor-page-title">{t('platform.diagnostics.page.environment.title')}</h1>
      <p className="doctor-page-subtitle">{t('platform.diagnostics.page.environment.subtitle')}</p>
      <MobileCard title={t('platform.diagnostics.panel.environment.title')}>
        <table className="doctor-facts">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
            ))}
          </tbody>
        </table>
      </MobileCard>
    </div>
  );
}
