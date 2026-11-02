export * from './agent';
export * from './composition';
export * from './host';
export * from './modules';
export * from './records';
export * from './sdk';
export * from './session';

import { getDoctorH5HostAdapter, type DoctorH5HostAdapter } from './host';
import { doctorH5Modules } from './modules';
import { createDoctorH5SdkPorts, type DoctorH5SdkPorts } from './sdk';
import { createAnonymousSessionPort, type DoctorSessionPort } from './session';

export interface DoctorH5Runtime {
  readonly host: DoctorH5HostAdapter;
  readonly modules: typeof doctorH5Modules;
  readonly sdk: DoctorH5SdkPorts;
  readonly session: DoctorSessionPort;
}

export function createDoctorH5Runtime(): DoctorH5Runtime {
  return Object.freeze({
    host: getDoctorH5HostAdapter(),
    modules: doctorH5Modules,
    sdk: createDoctorH5SdkPorts(),
    session: createAnonymousSessionPort(),
  });
}
