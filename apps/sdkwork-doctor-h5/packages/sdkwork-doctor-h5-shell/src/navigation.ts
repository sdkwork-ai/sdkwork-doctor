export interface DoctorH5Tab {
  readonly labelKey: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_H5_HOME_PATH = '/doctor/chat';

export const doctorH5Tabs: readonly DoctorH5Tab[] = Object.freeze([
  Object.freeze({ labelKey: 'platform.diagnostics.nav.chat', to: '/doctor/chat' }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.doctor', to: '/doctor/doctor' }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.records', to: '/doctor/records' }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.me', to: '/doctor/me' }),
]);
