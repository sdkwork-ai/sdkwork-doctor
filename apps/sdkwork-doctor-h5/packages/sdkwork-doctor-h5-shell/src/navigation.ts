export interface DoctorH5Tab {
  readonly label: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_H5_HOME_PATH = '/doctor';

export const doctorH5Tabs: readonly DoctorH5Tab[] = Object.freeze([
  Object.freeze({ label: 'Overview', to: '/doctor', end: true }),
  Object.freeze({ label: 'Checks', to: '/doctor/checks' }),
  Object.freeze({ label: 'Env', to: '/doctor/environment' }),
]);
