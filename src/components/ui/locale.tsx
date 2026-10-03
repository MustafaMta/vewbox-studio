'use client';

import { createContext, useContext, useEffect } from 'react';
import { t, tt, type Key, type Locale } from '@/lib/i18n';
import { useStudio } from '@/studio/store';
import { readPrefs, usePrefs, writePrefs } from '@/components/shell/preferences';

const Ctx = createContext<Locale>('en');

/** The interface language and motion preference come from Settings in the store; this applies them to <html> so the
 *  whole page, fonts and direction included, follows. They are mirrored into this browser's interface preferences
 *  (`vewbox.ui`, merged with contrast, density, previews and keys), so the boot script (src/app/boot.ts) applies
 *  them before the next first paint. */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { state, ready } = useStudio();
  const saved = usePrefs();
  // until the studio's settings arrive, the language this browser last used (the shell is not English for a moment)
  const locale = ready ? state.settings.uiLanguage : (saved.locale ?? state.settings.uiLanguage);
  const motion = state.settings.reducedMotion;
  useEffect(() => {
    // before the first snapshot the settings are the defaults, not the studio's: keep what the boot applied
    if (!ready) return;
    const html = document.documentElement;
    html.lang = locale; html.dir = locale === 'ar' ? 'rtl' : 'ltr';
    if (motion) html.setAttribute('data-motion', 'reduce'); else html.removeAttribute('data-motion');
    const p = readPrefs();
    if (p.locale !== locale || p.motion !== motion) writePrefs({ locale, motion });
  }, [locale, motion, ready]);
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const pluralCache: Partial<Record<Locale, Intl.PluralRules>> = {};
/** Plural forms live in one string separated by `|`: English `one|other`, Arabic `zero|one|two|few|many|other`
 *  (CLDR categories, chosen by Intl.PluralRules). A string without `|` is used for every count. */
function pick(locale: Locale, s: string, n: number): string {
  const parts = s.split('|');
  if (parts.length === 1) return s;
  const cats = parts.length === 6 ? ['zero', 'one', 'two', 'few', 'many', 'other'] : ['one', 'other'];
  const rules = (pluralCache[locale] ??= new Intl.PluralRules(locale === 'ar' ? 'ar' : 'en'));
  const cat = n === 0 && parts.length === 6 ? 'zero' : rules.select(n);
  const i = cats.indexOf(cat);
  return parts[i >= 0 ? i : parts.length - 1];
}

/** `const T = useT(); T('btn.save')` — `T.dyn('stage.STORY')` for keys built at runtime, `T.f(key, { name })` to
 *  fill `{name}` placeholders, and `T.p(key, n, vars)` for a counted phrase (`{n}` is filled with the count). */
export function useT() {
  const locale = useContext(Ctx);
  const fn = (key: Key) => t(locale, key);
  fn.dyn = (key: string, fallback?: string) => tt(locale, key, fallback);
  fn.f = (key: Key, vars: Record<string, string | number>) => fill(t(locale, key), vars);
  fn.p = (key: Key, n: number, vars: Record<string, string | number> = {}) => fill(pick(locale, t(locale, key), n), { n, ...vars });
  fn.locale = locale;
  return fn;
}
export type TFn = ReturnType<typeof useT>;
