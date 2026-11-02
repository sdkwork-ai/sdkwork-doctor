export interface DoctorNavItem {
  readonly label: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_PC_HOME_PATH = '/doctor/chat';

export const doctorPcNavigation: readonly DoctorNavItem[] = Object.freeze([
  Object.freeze({ label: 'Chat', to: '/doctor/chat' }),
  Object.freeze({ label: 'Doctor', to: '/doctor/doctor' }),
  Object.freeze({ label: 'Me', to: '/doctor/me' }),
]);
