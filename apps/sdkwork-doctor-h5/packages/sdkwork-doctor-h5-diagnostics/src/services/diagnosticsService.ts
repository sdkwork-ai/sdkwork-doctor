import { createDoctorRegistry, runDoctorChecks, type DoctorReport, type DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

export const doctorH5Registry = createDoctorRegistry();

export async function runH5Diagnostics(context: DoctorRuntimeContext): Promise<DoctorReport> {
  return runDoctorChecks(doctorH5Registry.checks, context);
}
