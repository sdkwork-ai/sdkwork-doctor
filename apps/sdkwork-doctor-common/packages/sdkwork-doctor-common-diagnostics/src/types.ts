/**
 * Diagnostics vocabulary shared by every SDKWork Doctor surface.
 *
 * A check is a pure async function over an immutable runtime context. It must
 * not read module-level browser state directly; adapters pass facts in through
 * the context so the same catalog runs on PC, H5, and future surfaces.
 */

export type DoctorSeverity = 'ok' | 'warn' | 'error' | 'skipped';

export type DoctorCategory = 'environment' | 'browser' | 'configuration' | 'connectivity';

export interface DoctorRuntimeContext {
  readonly deploymentProfile: 'standalone' | 'cloud';
  readonly environment: string;
  readonly profileId: string;
  readonly appVersion: string;
  readonly apiBaseUrl: string;
  readonly backendApiBaseUrl: string;
  readonly locale: string;
  readonly now: () => Date;
}

export interface DoctorCheckResult {
  readonly status: DoctorSeverity;
  /**
   * English developer fallback used by reports, logs, and non-i18n consumers.
   * User-facing surfaces prefer `messageKey`, which resolves through the
   * package-owned `src/i18n` fragments (I18N_SPEC.md section 1).
   */
  readonly summary: string;
  readonly messageKey?: string;
  readonly messageParams?: Readonly<Record<string, string | number>>;
  readonly details?: readonly string[];
  readonly hint?: string;
  readonly hintKey?: string;
}

export interface DoctorCheck {
  readonly id: string;
  readonly title: string;
  readonly titleKey?: string;
  readonly description: string;
  readonly descriptionKey?: string;
  readonly category: DoctorCategory;
  readonly run: (context: DoctorRuntimeContext) => Promise<DoctorCheckResult>;
}

export interface DoctorCheckOutcome extends DoctorCheckResult {
  readonly checkId: string;
  readonly title: string;
  readonly titleKey?: string;
  readonly category: DoctorCategory;
  readonly durationMs: number;
}

export interface DoctorReportSummary {
  readonly ok: number;
  readonly warn: number;
  readonly error: number;
  readonly skipped: number;
}

export interface DoctorReport {
  readonly profileId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly status: DoctorSeverity;
  readonly outcomes: readonly DoctorCheckOutcome[];
  readonly summary: DoctorReportSummary;
}
