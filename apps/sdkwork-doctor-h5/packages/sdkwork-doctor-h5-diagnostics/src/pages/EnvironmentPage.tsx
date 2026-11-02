import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import { MobileCard } from '@sdkwork/doctor-h5-commons';

export function EnvironmentPage({ context, hostPlatform }: { context: DoctorRuntimeContext; hostPlatform: string }) {
  const rows: Array<[string, string]> = [
    ['Deployment profile', context.deploymentProfile],
    ['Environment', context.environment],
    ['Profile id', context.profileId],
    ['App version', context.appVersion],
    ['App API base URL', context.apiBaseUrl || '(unset)'],
    ['Backend API base URL', context.backendApiBaseUrl || '(unset)'],
    ['Locale', context.locale],
    ['Host', hostPlatform],
  ];
  return (
    <div>
      <h1 className="doctor-page-title">Runtime environment</h1>
      <p className="doctor-page-subtitle">Facts resolved before renderer bootstrap.</p>
      <MobileCard title="Resolved values">
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
