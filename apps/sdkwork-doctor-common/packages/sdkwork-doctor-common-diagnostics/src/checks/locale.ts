import type { DoctorCheck } from '../types';

export const localeCheck: DoctorCheck = {
  id: 'configuration.locale',
  title: 'Locale metadata',
  titleKey: 'platform.diagnostics.check.locale.title',
  description: 'Verifies the document language matches the negotiated navigator language.',
  descriptionKey: 'platform.diagnostics.check.locale.description',
  category: 'configuration',
  async run(context) {
    if (typeof document === 'undefined') {
      return {
        status: 'skipped',
        summary: 'No document is available in this runtime.',
        messageKey: 'platform.diagnostics.check.locale.skipped',
      };
    }
    const documentLanguage = (document.documentElement.lang || '').toLowerCase();
    const locale = context.locale.toLowerCase();
    if (!documentLanguage) {
      return {
        status: 'warn',
        summary: 'The document element declares no language.',
        messageKey: 'platform.diagnostics.check.locale.missingDocumentLanguage',
        hint: 'Set <html lang="..."> from the resolved locale before first paint.',
        hintKey: 'platform.diagnostics.hint.locale',
      };
    }
    const matches = documentLanguage === locale
      || locale.startsWith(documentLanguage + '-')
      || documentLanguage.startsWith(locale.split('-')[0] + '-');
    if (!matches) {
      return {
        status: 'warn',
        summary: 'Document language and navigator language disagree.',
        messageKey: 'platform.diagnostics.check.locale.mismatch',
        details: ['document lang=' + documentLanguage, 'navigator language=' + context.locale],
      };
    }
    return {
      status: 'ok',
      summary: 'Locale metadata is consistent (' + documentLanguage + ').',
      messageKey: 'platform.diagnostics.check.locale.ok',
      messageParams: { language: documentLanguage },
    };
  },
};
