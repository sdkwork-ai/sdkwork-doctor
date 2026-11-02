import type { DoctorCheck, DoctorCheckResult } from '../types';

export const clockCheck: DoctorCheck = {
  id: 'environment.clock',
  title: 'Clock and timezone',
  titleKey: 'platform.diagnostics.check.clock.title',
  description: 'A sane local clock and usable Intl timezone data keep token expiry and audit timestamps correct.',
  descriptionKey: 'platform.diagnostics.check.clock.description',
  category: 'environment',
  async run(context): Promise<DoctorCheckResult> {
    const now = context.now();
    if (Number.isNaN(now.getTime())) {
      return {
        status: 'error',
        summary: 'The runtime clock returned an invalid date.',
        messageKey: 'platform.diagnostics.check.clock.invalid',
      };
    }
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (now.getFullYear() < 2020) {
        return {
          status: 'warn',
          summary: 'The device clock looks stale.',
          messageKey: 'platform.diagnostics.check.clock.stale',
          messageParams: { year: now.getFullYear() },
          details: ['Current year=' + String(now.getFullYear())],
          hint: 'Sync the operating-system clock; skewed clocks break token validation and cache freshness.',
          hintKey: 'platform.diagnostics.hint.clock',
        };
      }
      return {
        status: 'ok',
        summary: 'Clock is sane (timezone ' + timeZone + ').',
        messageKey: 'platform.diagnostics.check.clock.ok',
        messageParams: { timeZone },
        details: ['ISO now=' + now.toISOString()],
      };
    } catch (error) {
      return {
        status: 'warn',
        summary: 'Timezone data is unavailable.',
        messageKey: 'platform.diagnostics.check.clock.timeZoneUnavailable',
        details: [error instanceof Error ? error.message : String(error)],
      };
    }
  },
};
