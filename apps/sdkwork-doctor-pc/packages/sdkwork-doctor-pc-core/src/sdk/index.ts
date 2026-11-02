/**
 * SDK port registry.
 *
 * Generated SDK clients (app API and dependency app SDKs) are constructed in
 * this package and exposed as typed ports; UI/service packages receive the
 * ports and never import generated transport packages directly
 * (APP_SDK_INTEGRATION_SPEC.md section 9).
 *
 * The scaffold has no generated SDK family yet, so the registry is empty and
 * deliberately explicit: adding a client means adding a port here and declaring
 * it in specs/component.spec.json#contracts.sdkDependencies.
 */
export interface DoctorPcSdkPorts {
  readonly appApiClient: null;
}

export function createDoctorPcSdkPorts(): DoctorPcSdkPorts {
  return Object.freeze({ appApiClient: null });
}
