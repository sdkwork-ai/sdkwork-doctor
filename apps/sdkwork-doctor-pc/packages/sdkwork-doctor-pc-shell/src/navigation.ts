export interface DoctorNavItem {
  readonly labelKey: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_PC_HOME_PATH = '/doctor/chat';

export const doctorPcNavigation: readonly DoctorNavItem[] = Object.freeze([
  Object.freeze({ labelKey: 'platform.diagnostics.nav.chat', to: '/doctor/chat' }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.doctor', to: '/doctor/doctor' }),
  Object.freeze({ labelKey: 'platform.diagnostics.nav.me', to: '/doctor/me' }),
]);
