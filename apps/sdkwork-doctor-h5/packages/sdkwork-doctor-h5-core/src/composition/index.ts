import { doctorH5Modules } from '../modules';
import { createDoctorH5SdkPorts } from '../sdk';

export interface DoctorH5Composition {
  readonly moduleIds: readonly string[];
  readonly sdkClientIds: readonly string[];
}

export function describeDoctorH5Composition(): DoctorH5Composition {
  return Object.freeze({
    moduleIds: doctorH5Modules.map((module) => module.id),
    sdkClientIds: Object.keys(createDoctorH5SdkPorts()),
  });
}
