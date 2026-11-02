import type { DoctorCheck } from '../types';

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export const apiSurfaceCheck: DoctorCheck = {
  id: 'configuration.api-surface',
  title: 'API base URLs',
  titleKey: 'platform.diagnostics.check.apiSurface.title',
  description: 'The browser must resolve same-origin or cloud API base URLs before any SDK client is constructed.',
  descriptionKey: 'platform.diagnostics.check.apiSurface.description',
  category: 'configuration',
  async run(context) {
    const details = ['appApiBaseUrl=' + (context.apiBaseUrl || '(empty)'), 'backendApiBaseUrl=' + (context.backendApiBaseUrl || '(empty)')];
    if (!context.apiBaseUrl || !context.backendApiBaseUrl) {
      return {
        status: 'warn',
        summary: 'No API base URL is configured for this surface.',
        messageKey: 'platform.diagnostics.check.apiSurface.notConfigured',
        details,
        hint: 'Deploy the runtime-env document or configure the Vite environment for this profile. The scaffold UI is usable without it.',
        hintKey: 'platform.diagnostics.hint.apiSurface',
      };
    }
    for (const value of [context.apiBaseUrl, context.backendApiBaseUrl]) {
      if (value.startsWith('http://')) {
        const hostname = new URL(value).hostname;
        if (!isLoopbackHost(hostname)) {
          return {
            status: 'warn',
            summary: 'An API base URL uses plain HTTP outside loopback.',
            messageKey: 'platform.diagnostics.check.apiSurface.plainHttp',
            details,
            hint: 'Use HTTPS for every non-loopback API origin.',
            hintKey: 'platform.diagnostics.hint.apiSurfacePlainHttp',
          };
        }
      }
    }
    return {
      status: 'ok',
      summary: 'API base URLs are configured.',
      messageKey: 'platform.diagnostics.check.apiSurface.ok',
      details,
    };
  },
};
