import type { DoctorCheck } from '../types';

export const secureContextCheck: DoctorCheck = {
  id: 'browser.secure-context',
  title: 'Secure context',
  description: 'Browser APIs such as clipboard, crypto.subtle, and service workers require a secure context.',
  category: 'browser',
  async run() {
    if (typeof window === 'undefined') {
      return { status: 'skipped', summary: 'No browser window is available in this runtime.' };
    }
    if (window.isSecureContext) {
      return { status: 'ok', summary: 'The page runs in a secure context.' };
    }
    return {
      status: 'warn',
      summary: 'The page is not a secure context.',
      details: ['Served over plain HTTP from a non-loopback host.'],
      hint: 'Serve the surface over HTTPS, or use localhost during development.',
    };
  },
};
