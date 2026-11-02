import { useTranslation } from 'react-i18next';

const SUPPORTED = ['en-US', 'zh-CN'] as const;

/**
 * Locale switch for the shell. Locale selection lives in the shell/provider
 * boundary, never in feature pages (I18N_SPEC.md section 7).
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en-US';
  const next = current === 'zh-CN' ? 'en-US' : 'zh-CN';
  return (
    <button
      type="button"
      className="doctor-button"
      style={{ marginBottom: 8, padding: '6px 10px', fontSize: 12 }}
      aria-label={t('platform.diagnostics.language.label')}
      onClick={() => {
        void i18n.changeLanguage(next);
      }}
    >
      {next === 'zh-CN' ? t('platform.diagnostics.language.zhCN') : t('platform.diagnostics.language.enUS')}
    </button>
  );
}

export { SUPPORTED as DOCTOR_SUPPORTED_LOCALES };
