import type { DoctorCheck } from '../types';

export const browserSupportCheck: DoctorCheck = {
  id: 'browser.capabilities',
  title: 'Browser capabilities',
  description: 'Required Web APIs must exist before the renderer bootstraps.',
  category: 'browser',
  async run() {
    if (typeof window === 'undefined') {
      return { status: 'skipped', summary: 'No browser window is available in this runtime.' };
    }
    const missing: string[] = [];
    if (typeof window.fetch !== 'function') missing.push('fetch');
    if (typeof window.matchMedia !== 'function') missing.push('matchMedia');
    if (typeof Intl === 'undefined') missing.push('Intl');
    if (typeof Promise === 'undefined') missing.push('Promise');
    if (missing.length > 0) {
      return {
        status: 'error',
        summary: 'The browser is missing required capabilities.',
        details: ['missing=' + missing.join(', ')],
        hint: 'Use a current evergreen browser; legacy engines are not supported.',
      };
    }
    return { status: 'ok', summary: 'Required browser capabilities are present.' };
  },
};
