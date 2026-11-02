export interface DoctorH5Tab {
  readonly label: string;
  readonly to: string;
  readonly end?: boolean;
}

export const DOCTOR_H5_HOME_PATH = '/doctor/chat';

export const doctorH5Tabs: readonly DoctorH5Tab[] = Object.freeze([
  Object.freeze({ label: 'Chat', to: '/doctor/chat' }),
  Object.freeze({ label: 'Doctor', to: '/doctor/doctor' }),
  Object.freeze({ label: 'Me', to: '/doctor/me' }),
]);
