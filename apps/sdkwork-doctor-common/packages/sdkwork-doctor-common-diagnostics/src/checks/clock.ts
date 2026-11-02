import type { DoctorCheck } from '../types';

export const clockCheck: DoctorCheck = {
  id: 'environment.clock',
  title: 'Clock and timezone',
  description: 'A sane local clock and usable Intl timezone data keep token expiry and audit timestamps correct.',
  category: 'environment',
  async run(context) {
    const now = context.now();
    if (Number.isNaN(now.getTime())) {
      return { status: 'error', summary: 'The runtime clock returned an invalid date.' };
    }
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (now.getFullYear() < 2020) {
        return {
          status: 'warn',
          summary: 'The device clock looks stale.',
          details: ['Current year=' + String(now.getFullYear())],
          hint: 'Sync the operating-system clock; skewed clocks break token validation and cache freshness.',
        };
      }
      return {
        status: 'ok',
        summary: 'Clock is sane (timezone ' + timeZone + ').',
        details: ['ISO now=' + now.toISOString()],
      };
    } catch (error) {
      return {
        status: 'warn',
        summary: 'Timezone data is unavailable.',
        details: [error instanceof Error ? error.message : String(error)],
      };
    }
  },
};
