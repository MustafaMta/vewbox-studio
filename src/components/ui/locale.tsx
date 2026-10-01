'use client';

import { createContext, useContext, useEffect } from 'react';
import { t, tt, type Key, type Locale } from '@/lib/i18n';
import { useStudio } from '@/studio/store';

const Ctx = createContext<Locale>('en');

/** The interface language and motion preference come from Settings in the store; this applies them to <html> so the
 *  whole page, fonts and direction included, follows. An inline script in the root layout does the same before paint. */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { state } = useStudio();
  const locale = state.settings.uiLanguage;
  const motion = state.settings.reducedMotion;
  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale; html.dir = locale === 'ar' ? 'rtl' : 'ltr';
    if (motion) html.setAttribute('data-motion', 'reduce'); else html.removeAttribute('data-motion');
    try { localStorage.setItem('vewbox.ui', JSON.stringify({ locale, motion })); } catch { /* fine */ }
  }, [locale, motion]);
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale { return useContext(Ctx); }

/** `const T = useT(); T('btn.save')` — and `T.dyn('stage.STORY')` for keys built at runtime. */
export function useT() {
  const locale = useContext(Ctx);
  const fn = (key: Key) => t(locale, key);
  fn.dyn = (key: string, fallback?: string) => tt(locale, key, fallback);
  fn.locale = locale;
  return fn;
}
