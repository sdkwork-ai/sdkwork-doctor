import type { DoctorSeverity } from '@sdkwork/doctor-common-diagnostics';

const LABELS: Record<DoctorSeverity, string> = {
  ok: 'Healthy',
  warn: 'Attention',
  error: 'Failing',
  skipped: 'Skipped',
};

export function StatusBadge({ status }: { status: DoctorSeverity }) {
  return (
    <span className="doctor-badge" data-status={status}>
      {LABELS[status]}
    </span>
  );
}
