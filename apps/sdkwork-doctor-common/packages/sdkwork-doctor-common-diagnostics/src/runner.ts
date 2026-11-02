import type { DoctorCheck, DoctorCheckOutcome, DoctorReport, DoctorReportSummary, DoctorRuntimeContext, DoctorSeverity } from './types';

export interface DoctorRunOptions {
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 4000;

function summarize(outcomes: readonly DoctorCheckOutcome[]): DoctorReportSummary {
  const summary = { ok: 0, warn: 0, error: 0, skipped: 0 };
  for (const outcome of outcomes) {
    summary[outcome.status] += 1;
  }
  return summary;
}

function overallStatus(summary: DoctorReportSummary): DoctorSeverity {
  if (summary.error > 0) return 'error';
  if (summary.warn > 0) return 'warn';
  if (summary.ok === 0) return 'skipped';
  return 'ok';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, checkId: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('check "' + checkId + '" timed out after ' + String(timeoutMs) + 'ms')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * Run checks sequentially so a hanging check cannot starve the whole report.
 */
export async function runDoctorChecks(
  checks: readonly DoctorCheck[],
  context: DoctorRuntimeContext,
  options: DoctorRunOptions = {},
): Promise<DoctorReport> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = new Date();
  const outcomes: DoctorCheckOutcome[] = [];
  for (const check of checks) {
    const checkStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const result = await withTimeout(check.run(context), timeoutMs, check.id);
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - checkStarted;
      outcomes.push({ ...result, checkId: check.id, title: check.title, titleKey: check.titleKey, category: check.category, durationMs });
    } catch (error) {
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - checkStarted;
      outcomes.push({
        checkId: check.id,
        title: check.title,
        titleKey: check.titleKey,
        category: check.category,
        status: 'error',
        summary: 'Check failed to complete.',
        messageKey: 'platform.diagnostics.runner.failed',
        details: [error instanceof Error ? error.message : String(error)],
        durationMs,
      });
    }
  }
  const summary = summarize(outcomes);
  return {
    profileId: context.profileId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    status: overallStatus(summary),
    outcomes,
    summary,
  };
}
