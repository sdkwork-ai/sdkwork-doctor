export interface DoctorNavItem {
  readonly labelKey: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_PC_HOME_PATH = '/doctor';

export const doctorPcNavigation: readonly DoctorNavItem[] = Object.freeze([
  Object.freeze({ labelKey: 'platform.diagnostics.nav.overview', to: '/doctor', end: true }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.checks', to: '/doctor/checks' }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.environment', to: '/doctor/environment' }),
]);
