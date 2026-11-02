import type { DoctorCheck } from '../types';

const PROBE_KEY = 'sdkwork.doctor.probe';

export const storageCheck: DoctorCheck = {
  id: 'browser.storage',
  title: 'Local persistence',
  titleKey: 'platform.diagnostics.check.storage.title',
  description: 'Checks that localStorage can round-trip a value; session and cache wiring depends on it.',
  descriptionKey: 'platform.diagnostics.check.storage.description',
  category: 'browser',
  async run() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        status: 'skipped',
        summary: 'localStorage is not available in this runtime.',
        messageKey: 'platform.diagnostics.check.storage.skipped',
      };
    }
    try {
      window.localStorage.setItem(PROBE_KEY, '1');
      const value = window.localStorage.getItem(PROBE_KEY);
      window.localStorage.removeItem(PROBE_KEY);
      if (value !== '1') {
        return {
          status: 'warn',
          summary: 'localStorage accepted a write but returned a different value.',
          messageKey: 'platform.diagnostics.check.storage.roundTripMismatch',
        };
      }
      return {
        status: 'ok',
        summary: 'localStorage round-trip succeeded.',
        messageKey: 'platform.diagnostics.check.storage.ok',
      };
    } catch (error) {
      return {
        status: 'warn',
        summary: 'localStorage is blocked or full.',
        messageKey: 'platform.diagnostics.check.storage.blocked',
        messageParams: { reason: error instanceof Error ? error.message : String(error) },
        details: [error instanceof Error ? error.message : String(error)],
        hint: 'Leave private browsing mode or allow site data for this origin.',
        hintKey: 'platform.diagnostics.hint.storage',
      };
    }
  },
};
