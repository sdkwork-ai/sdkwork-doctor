import { doctorPcModules } from '../modules';
import { createDoctorPcSdkPorts } from '../sdk';

export interface DoctorPcComposition {
  readonly moduleIds: readonly string[];
  readonly sdkClientIds: readonly string[];
}

/**
 * Read-only composition summary for diagnostics and verification. Bootstrap
 * and tests may read it; feature packages must not import this subpath.
 */
export function describeDoctorPcComposition(): DoctorPcComposition {
  return Object.freeze({
    moduleIds: doctorPcModules.map((module) => module.id),
    sdkClientIds: Object.keys(createDoctorPcSdkPorts()),
  });
}
