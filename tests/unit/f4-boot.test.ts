import { describe, expect, it } from 'vitest';
import { BOOT } from '@/app/boot';
import { parsePrefs, parseSidebar, prefAttributes } from '@/components/shell/preferences';

/** docs/DESIGN-SYSTEM-V4.md §4.9: the preference boot applies motion, contrast, density, previews, single keys and the
 *  navigation's shape before the first paint — exactly what the shell applies afterwards. It never touches the
 *  document's language or direction: the website is English-only and left to right (docs/DESIGN-SYSTEM-V5.md §9), even
 *  for a browser that still holds an old `locale` preference. The boot is a string in <head>; here it runs against a
 *  stand-in document. Package F4. */

function runBoot(raw: string | null, wide: boolean, sidebar: string | null = null) {
  const attrs: Record<string, string> = {};
  const html = { lang: 'en', dir: 'ltr', setAttribute: (n: string, v: string) => { attrs[n] = v; } };
  const g = { document: { documentElement: html }, localStorage: { getItem: (k: string) => (k === 'vb.sidebar' ? sidebar : raw) }, window: { matchMedia: () => ({ matches: wide }) } };
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
  '{"contrast":"standard"}',
  '{"contrast":"loud","density":"tight","previews":"no"}',
];

describe('the preference boot', () => {
  for (const raw of CASES) {
    for (const wide of [true, false]) for (const sidebar of [null, 'expanded', 'collapsed', 'junk']) {
      it(`sets what the shell sets, for ${raw} at ${wide ? '≥' : '<'} 1280, sidebar ${sidebar}`, () => {
        const r = runBoot(raw, wide, sidebar);
        const p = parsePrefs(raw);
        const want = Object.fromEntries(Object.entries(prefAttributes(p, wide, parseSidebar(sidebar))).filter(([, v]) => v !== null));
        if (p.motion) want['data-motion'] = 'reduce';
        expect(r.attrs).toEqual(want);
        expect(r.dir).toBe('ltr');
        expect(r.lang).toBe('en');
      });
    }
  }
  it('starts collapsed on a cutting-room route (a production workspace, a shot) unless the producer chose', () => {
    const run = (path: string, sidebar: string | null) => { const attrs: Record<string, string> = {}; new Function('document', 'localStorage', 'window', BOOT)({ documentElement: { setAttribute: (n: string, v: string) => { attrs[n] = v; } } }, { getItem: (k: string) => (k === 'vb.sidebar' ? sidebar : null) }, { matchMedia: () => ({ matches: true }), location: { pathname: path } }); return attrs['data-sidebar']; };
    expect(run('/shorts/abc/production', null)).toBe('collapsed');
    expect(run('/music-videos/abc/shots/s1', null)).toBe('collapsed');
    expect(run('/shows/a/seasons/b/episodes/c/production/', null)).toBe('collapsed');
    expect(run('/shorts/abc', null)).toBe('expanded');
    expect(run('/production', null)).toBe('expanded');
    expect(run('/shorts/abc/production', 'expanded')).toBe('expanded');
  });
  it('marks a cutting-room route on <html> from the first frame (data-route="cutting"), and nothing else', () => {
    const run = (path: string) => { const attrs: Record<string, string> = {}; new Function('document', 'localStorage', 'window', BOOT)({ documentElement: { setAttribute: (n: string, v: string) => { attrs[n] = v; } } }, { getItem: () => null }, { matchMedia: () => ({ matches: true }), location: { pathname: path } }); return attrs['data-route']; };
    expect(run('/shorts/abc/production')).toBe('cutting');
    expect(run('/music-videos/abc/shots/s1')).toBe('cutting');
    expect(run('/shows/a/seasons/b/episodes/c/shots/x')).toBe('cutting');
    expect(run('/shorts/abc')).toBeUndefined();
    expect(run('/production')).toBeUndefined();
    expect(run('/')).toBeUndefined();
  });
  it('throws nothing when storage is unavailable', () => {
    const html = { setAttribute: () => { throw new Error('no'); } };
    expect(() => new Function('document', 'localStorage', 'window', BOOT)({ documentElement: html }, { getItem: () => { throw new Error('denied'); } }, {})).not.toThrow();
  });
});

describe('parsePrefs', () => {
  it('keeps what it knows and drops the rest, field by field', () => {
    expect(parsePrefs('{"locale":"ar","contrast":"more","keys":false,"junk":1}')).toEqual({ motion: undefined, contrast: 'more', density: undefined, previews: undefined, keys: false });
    expect(parsePrefs('[1,2]')).toEqual({ motion: undefined, contrast: undefined, density: undefined, previews: undefined, keys: undefined });
  });
});
