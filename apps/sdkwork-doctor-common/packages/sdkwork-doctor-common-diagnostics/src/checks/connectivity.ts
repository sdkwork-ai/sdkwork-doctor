import type { DoctorCheck } from '../types';

export const connectivityCheck: DoctorCheck = {
  id: 'connectivity.runtime-document',
  title: 'Runtime document reachability',
  description: 'The same-origin runtime-env document must be reachable so base URLs survive deployment.',
  category: 'connectivity',
  async run() {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
      return { status: 'skipped', summary: 'No browser fetch is available in this runtime.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { status: 'warn', summary: 'The browser reports that it is offline.' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await window.fetch('/runtime-env.json', { cache: 'no-store', signal: controller.signal });
      if (response.ok) {
        return { status: 'ok', summary: 'Runtime document responded with HTTP ' + String(response.status) + '.' };
      }
      return {
        status: 'warn',
        summary: 'Runtime document is not served (HTTP ' + String(response.status) + ').',
        hint: 'The Vite runtime-env plugin serves /runtime-env.json during development and emits it on build.',
      };
    } catch (error) {
      return {
        status: 'warn',
        summary: 'Runtime document request failed.',
        details: [error instanceof Error ? error.message : String(error)],
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
