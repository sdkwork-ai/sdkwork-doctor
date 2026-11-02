export interface DoctorPcModuleDescriptor {
  readonly id: string;
  readonly title: string;
  readonly routePath: string;
}

/**
 * Registered PC modules. New capability packages append a descriptor here so
 * the shell can compose navigation without hard-coded route lists.
 */
export const doctorPcModules: readonly DoctorPcModuleDescriptor[] = Object.freeze([
  Object.freeze({ id: 'diagnostics', title: 'Diagnostics', routePath: '/doctor' }),
]);
