export * from './agent';
export * from './composition';
export * from './doctors';
export * from './host';
export * from './modules';
export * from './patients';
export * from './records';
export * from './sdk';
export * from './session';
export * from './storage';

import { getDoctorPcHostAdapter, type DoctorPcHostAdapter } from './host';
import { doctorPcModules } from './modules';
import { createDoctorPcSdkPorts, type DoctorPcSdkPorts } from './sdk';
import { createAnonymousSessionPort, type DoctorSessionPort } from './session';

export interface DoctorPcRuntime {
  readonly host: DoctorPcHostAdapter;
  readonly modules: typeof doctorPcModules;
  readonly sdk: DoctorPcSdkPorts;
  readonly session: DoctorSessionPort;
}

/**
 * Compose the PC runtime ports. Bootstrap calls this once; feature packages
 * receive the ports through React context.
 */
export function createDoctorPcRuntime(): DoctorPcRuntime {
  return Object.freeze({
    host: getDoctorPcHostAdapter(),
    modules: doctorPcModules,
    sdk: createDoctorPcSdkPorts(),
    session: createAnonymousSessionPort(),
  });
}
