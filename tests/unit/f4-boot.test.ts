import { describe, expect, it } from 'vitest';
import { BOOT } from '@/app/boot';
import { parsePrefs, prefAttributes } from '@/components/shell/preferences';

/** docs/DESIGN-SYSTEM-V4.md §4.9: the preference boot applies language, motion, contrast, density, previews, single
 *  keys and the navigation's shape before the first paint — exactly what the shell applies afterwards. The boot is a
 *  string in <head>; here it runs against a stand-in document. Package F4. */

function runBoot(raw: string | null, wide: boolean) {
  const attrs: Record<string, string> = {};
  const html = { lang: 'en', dir: 'ltr', setAttribute: (n: string, v: string) => { attrs[n] = v; } };
  const g = { document: { documentElement: html }, localStorage: { getItem: () => raw }, window: { matchMedia: () => ({ matches: wide }) } };
  new Function('document', 'localStorage', 'window', BOOT)(g.document, g.localStorage, g.window);
  return { lang: html.lang, dir: html.dir, attrs };
}

const CASES: Array<string | null> = [
  null,
  '{}',
  'not json',
  'null',
  '{"locale":"ar","motion":true}',
  '{"locale":"en","contrast":"more","density":"comfortable","previews":false,"keys":false}',
  '{"contrast":"standard","nav":{"lobby":"rail"}}',
  '{"contrast":"loud","density":"tight","previews":"no","nav":{"lobby":"wide"}}',
  '{"nav":{"lobby":"sidebar","cutting":"sidebar"}}',
];

describe('the preference boot', () => {
  for (const raw of CASES) {
    for (const wide of [true, false]) {
      it(`sets what the shell sets, for ${raw} at ${wide ? '≥' : '<'} 1024`, () => {
        const r = runBoot(raw, wide);
        const p = parsePrefs(raw);
        const want = Object.fromEntries(Object.entries(prefAttributes(p, wide)).filter(([, v]) => v !== null));
        if (p.motion) want['data-motion'] = 'reduce';
        expect(r.attrs).toEqual(want);
        expect(r.dir).toBe(p.locale === 'ar' ? 'rtl' : 'ltr');
        expect(r.lang).toBe(p.locale === 'ar' ? 'ar' : 'en');
      });
    }
  }
  it('throws nothing when storage is unavailable', () => {
    const html = { setAttribute: () => { throw new Error('no'); } };
    expect(() => new Function('document', 'localStorage', 'window', BOOT)({ documentElement: html }, { getItem: () => { throw new Error('denied'); } }, {})).not.toThrow();
  });
});

describe('parsePrefs', () => {
  it('keeps what it knows and drops the rest, field by field', () => {
    expect(parsePrefs('{"locale":"ar","contrast":"more","keys":false,"junk":1}')).toEqual({ locale: 'ar', motion: undefined, contrast: 'more', density: undefined, previews: undefined, keys: false, nav: { lobby: undefined, cutting: undefined } });
    expect(parsePrefs('[1,2]').locale).toBeUndefined();
  });
});
