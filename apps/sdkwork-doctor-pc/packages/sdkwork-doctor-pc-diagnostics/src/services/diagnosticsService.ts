import { createDoctorRegistry, runDoctorChecks, type DoctorReport, type DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

export const doctorPcRegistry = createDoctorRegistry();

/**
 * Run the full catalog for a resolved PC runtime context.
 */
export async function runPcDiagnostics(context: DoctorRuntimeContext): Promise<DoctorReport> {
  return runDoctorChecks(doctorPcRegistry.checks, context);
}
