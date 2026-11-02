import type { DoctorSeverity } from '@sdkwork/doctor-common-diagnostics';

/**
 * Severity chip. The label is supplied by the owning feature package so this
 * primitive stays free of user-facing copy and locale ownership.
 */
export function StatusBadge({ status, label }: { status: DoctorSeverity; label: string }) {
  return (
    <span className="doctor-badge" data-status={status}>
      {label}
    </span>
  );
}
