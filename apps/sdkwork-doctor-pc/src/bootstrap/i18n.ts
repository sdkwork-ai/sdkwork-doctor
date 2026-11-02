import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { doctorCommonDiagnosticsI18n } from '@sdkwork/doctor-common-diagnostics/i18n';
import { doctorPcDiagnosticsI18n } from '@sdkwork/doctor-pc-diagnostics/i18n';
import { doctorPcShellI18n } from '@sdkwork/doctor-pc-shell/i18n';

const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;
const FALLBACK_LOCALE = 'en-US';
const STORAGE_KEY = 'sdkwork.doctor.locale';

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (!value) return FALLBACK_LOCALE;
  const lower = value.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en-US';
  return FALLBACK_LOCALE;
}

function readInitialLocale(): SupportedLocale {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeLocale(stored);
  }
  if (typeof navigator !== 'undefined') {
    return normalizeLocale(navigator.language);
  }
  return FALLBACK_LOCALE;
}

function localeResources() {
  return {
    'en-US': {
      doctor: {
        ...doctorCommonDiagnosticsI18n['en-US'],
        ...doctorPcShellI18n['en-US'],
        ...doctorPcDiagnosticsI18n['en-US'],
      },
    },
    'zh-CN': {
      doctor: {
        ...doctorCommonDiagnosticsI18n['zh-CN'],
        ...doctorPcShellI18n['zh-CN'],
        ...doctorPcDiagnosticsI18n['zh-CN'],
      },
    },
  };
}

let initialized = false;

/**
 * One runtime i18n provider for the PC application shell (I18N_SPEC.md section 7).
 * Feature packages consume it through react-i18next and never parse the
 * browser language themselves.
 */
export function initDoctorPcI18n() {
  if (initialized) return i18n;
  initialized = true;

  const initialLocale = readInitialLocale();
  void i18n.use(initReactI18next).init({
    lng: initialLocale,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: 'doctor',
    ns: ['doctor'],
    resources: localeResources(),
    interpolation: { escapeValue: false },
    initAsync: false,
  });

  const applyDocumentLanguage = (language: string) => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = normalizeLocale(language);
    }
  };

  applyDocumentLanguage(initialLocale);
  i18n.on('languageChanged', (language) => {
    const normalized = normalizeLocale(language);
    applyDocumentLanguage(normalized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    }
  });

  return i18n;
}

export { SUPPORTED_LOCALES as DOCTOR_SUPPORTED_LOCALES };
