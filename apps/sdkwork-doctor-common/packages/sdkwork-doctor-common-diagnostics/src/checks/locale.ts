import type { DoctorCheck } from '../types';

export const localeCheck: DoctorCheck = {
  id: 'configuration.locale',
  title: 'Locale metadata',
  description: 'Verifies the document language matches the negotiated navigator language.',
  category: 'configuration',
  async run(context) {
    if (typeof document === 'undefined') {
      return { status: 'skipped', summary: 'No document is available in this runtime.' };
    }
    const documentLanguage = (document.documentElement.lang || '').toLowerCase();
    const locale = context.locale.toLowerCase();
    if (!documentLanguage) {
      return {
        status: 'warn',
        summary: 'The document element declares no language.',
        hint: 'Set <html lang="..."> from the resolved locale before first paint.',
      };
    }
    const matches = documentLanguage === locale
      || locale.startsWith(documentLanguage + '-')
      || documentLanguage.startsWith(locale.split('-')[0] + '-');
    if (!matches) {
      return {
        status: 'warn',
        summary: 'Document language and navigator language disagree.',
        details: ['document lang=' + documentLanguage, 'navigator language=' + context.locale],
      };
    }
    return { status: 'ok', summary: 'Locale metadata is consistent (' + documentLanguage + ').' };
  },
};
