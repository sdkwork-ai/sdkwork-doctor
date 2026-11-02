export interface DoctorH5ModuleDescriptor {
  readonly id: string;
  readonly title: string;
  readonly routePath: string;
}

export const doctorH5Modules: readonly DoctorH5ModuleDescriptor[] = Object.freeze([
  Object.freeze({ id: 'diagnostics', title: 'Diagnostics', routePath: '/doctor' }),
]);
