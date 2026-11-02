import { defaultDoctorChecks } from './checks';
import type { DoctorCheck } from './types';

export interface DoctorRegistry {
  readonly checks: readonly DoctorCheck[];
  get(id: string): DoctorCheck | undefined;
}

/**
 * Build an immutable catalog. Callers may append surface-specific checks.
 */
export function createDoctorRegistry(extraChecks: readonly DoctorCheck[] = []): DoctorRegistry {
  const checks = Object.freeze([...defaultDoctorChecks, ...extraChecks]);
  const byId = new Map(checks.map((check) => [check.id, check]));
  return Object.freeze({
    checks,
    get: (id: string) => byId.get(id),
  });
}
