import { useTranslation } from 'react-i18next';

/**
 * Locale switch for the mobile shell. Locale selection lives in the shell or
 * provider boundary, never in feature screens (I18N_SPEC.md section 7).
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en-US';
  const next = current === 'zh-CN' ? 'en-US' : 'zh-CN';
  return (
    <button
      type="button"
      className="doctor-button"
      style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}
      aria-label={t('platform.diagnostics.language.label')}
      onClick={() => {
        void i18n.changeLanguage(next);
      }}
    >
      {next === 'zh-CN' ? t('platform.diagnostics.language.zhCN') : t('platform.diagnostics.language.enUS')}
    </button>
  );
}
