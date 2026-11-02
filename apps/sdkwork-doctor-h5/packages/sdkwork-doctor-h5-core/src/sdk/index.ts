/**
 * H5 SDK port registry. Generated SDK clients are constructed here and exposed
 * as typed ports; UI packages never import generated transport packages.
 */
export interface DoctorH5SdkPorts {
  readonly appApiClient: null;
}

export function createDoctorH5SdkPorts(): DoctorH5SdkPorts {
  return Object.freeze({ appApiClient: null });
}
