export interface DoctorH5Tab {
  readonly labelKey: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_H5_HOME_PATH = '/doctor';

export const doctorH5Tabs: readonly DoctorH5Tab[] = Object.freeze([
  Object.freeze({ labelKey: 'platform.diagnostics.nav.overview', to: '/doctor', end: true }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.checks', to: '/doctor/checks' }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.environment', to: '/doctor/environment' }),
]);
