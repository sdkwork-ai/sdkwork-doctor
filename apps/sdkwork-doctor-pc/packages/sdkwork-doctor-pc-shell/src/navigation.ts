export interface DoctorNavItem {
  readonly label: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_PC_HOME_PATH = '/doctor';

export const doctorPcNavigation: readonly DoctorNavItem[] = Object.freeze([
  Object.freeze({ label: 'Overview', to: '/doctor', end: true }),
  Object.freeze({ label: 'Checks', to: '/doctor/checks' }),
  Object.freeze({ label: 'Environment', to: '/doctor/environment' }),
]);
