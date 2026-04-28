/**
 * i18n bootstrap (Phase 1 scaffolding).
 *
 * Initializes `i18next` + `react-i18next` with an English baseline and the
 * `common` namespace. Translations are registered as JS resources (no
 * filesystem loader) so the existing Vite build doesn't need an extra
 * plugin. Additional locales/namespaces can be added later via
 * `i18n.addResourceBundle(lng, ns, resources)` or by switching to
 * `i18next-http-backend`.
 *
 * Language is persisted to `localStorage` under the `app.language` key so
 * the user's choice survives reloads. The default is English.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en/common.json';

const LS_LANG_KEY = 'app.language';
export const SUPPORTED_LANGUAGES = ['en'];
export const DEFAULT_LANGUAGE = 'en';

function readSavedLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const saved = window.localStorage.getItem(LS_LANG_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved;
  } catch {
    // localStorage may be disabled (privacy mode / SSR); fall through.
  }
  return DEFAULT_LANGUAGE;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
    },
    lng: readSavedLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      // React already escapes; double-escaping breaks displayed copy.
      escapeValue: false,
    },
    returnNull: false,
  });

i18n.on('languageChanged', (lng) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_LANG_KEY, lng);
  } catch {
    // ignore
  }
});

export default i18n;
