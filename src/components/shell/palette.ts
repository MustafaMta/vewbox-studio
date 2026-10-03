import type { StudioState } from '@/domain/types';
import type { Key, Locale } from '@/lib/i18n';
import { productionHref } from '@/studio/selectors';
import { NAV_ITEMS } from './nav-model';
import type { Decision } from './decisions';

/** THE COMMAND PALETTE'S CONTENT (docs/DESIGN-SYSTEM-V4.md §5.17, §7.6) — pure, so the groups, the kind-first labels
 *  and the matching are unit-tested (tests/unit/f4-palette.test.ts).
 *
 *  Groups, in this order: Go to (every page of the navigation, show, episode, short, music video, character, location
 *  and department) · Create (each start with its method) · Decide (every waiting approval; it opens the card and
 *  never approves) · Settings (contrast, motion, language, single-key shortcuts, the shortcut sheet). Labels are
 *  kind first ("Show · The Last Sip", "Approve · Story of Paper Boats"). A query matches the name in either
 *  language, ignoring case, Latin accents and Arabic diacritics and letter variants (أ/إ/آ/ا, ى/ي, ة/ه). */

export type PaletteGroup = 'goto' | 'create' | 'decide' | 'settings';
export const GROUP_ORDER: PaletteGroup[] = ['goto', 'create', 'decide', 'settings'];

export type PaletteAction =
  | { type: 'go'; href: string }
  | { type: 'contrast'; value: 'more' | 'standard' }
  | { type: 'motion'; value: boolean }
  | { type: 'language'; value: Locale }
  | { type: 'keys'; value: boolean }
  | { type: 'sheet' }
  | { type: 'run'; run: () => void };

export interface PaletteEntry {
  /** stable across sessions (recent items are remembered by it) */
  id: string;
  group: PaletteGroup;
  /** what kind of thing it is, first in the label: "Show", "Character", "Approve", "New show" */
  kind: string;
  /** its name in the interface language */
  name: string;
  /** a quiet second part: the show an episode belongs to, the show a new season goes into */
  detail?: string;
  /** the name in the other language, matched but not shown */
  alt?: string;
  /** more words to match ("dark mode", "arabic") */
  words?: string;
  action: PaletteAction;
}

type Tr = (key: Key) => string;
export interface PaletteInput {
  state: Pick<StudioState, 'shows' | 'seasons' | 'productions' | 'characters' | 'locations'>;
  locale: Locale;
  /** the interface language's strings, and the other language's (for matching names of places) */
  tr: Tr;
  other: Tr;
  /** a key built at runtime (`pipeline.STORY`), with readable words when it is unknown */
  dyn: (key: string, fallback: string) => string;
  decisions: Decision[];
  departments: Array<{ id: string; name: string; nameAr?: string }>;
  /** the show the page is in, for "New season" and "New episode" there */
  currentShowId?: string | null;
  prefs: { contrastMore: boolean; reducedMotion: boolean; singleKeys: boolean };
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const pick = (locale: Locale, en: string, ar?: string | null) => (locale === 'ar' && ar ? ar : en);
const other = (locale: Locale, en: string, ar?: string | null) => (locale === 'ar' ? en : (ar ?? undefined));

/** Every entry, in group order. */
export function buildEntries(x: PaletteInput): PaletteEntry[] {
  const { state, locale, tr } = x;
  const out: PaletteEntry[] = [];
  const go = (href: string): PaletteAction => ({ type: 'go', href });

  // ---- Go to ----------------------------------------------------------------------------------------------------
  for (const n of NAV_ITEMS) out.push({ id: `page:${n.href}`, group: 'goto', kind: tr('shell.palette.kind.page'), name: tr(n.key), alt: x.other(n.key), action: go(n.href) });
  for (const s of state.shows) out.push({ id: `show:${s.id}`, group: 'goto', kind: tr('kind.SHOW'), name: pick(locale, s.title, s.titleAr), alt: other(locale, s.title, s.titleAr), action: go(`/shows/${encodeURIComponent(s.id)}`) });
  for (const p of state.productions) {
    const title = p.kind === 'MUSIC_VIDEO' ? (p.song?.title || p.title) : p.title;
    const name = pick(locale, title, p.titleAr);
    const alt = other(locale, title, p.titleAr);
    if (p.kind === 'EPISODE') {
      const show = state.shows.find((s) => s.id === p.showId);
      const detail = [show ? pick(locale, show.title, show.titleAr) : null, p.episodeNumber != null ? fill(tr('shell.title.episode'), { n: p.episodeNumber }) : null].filter(Boolean).join(' · ');
      out.push({ id: `episode:${p.id}`, group: 'goto', kind: tr('kind.EPISODE'), name, detail: detail || undefined, alt, words: show ? `${show.title} ${show.titleAr ?? ''}` : undefined, action: go(productionHref(p)) });
    } else {
      out.push({ id: `${p.kind === 'MUSIC_VIDEO' ? 'music-video' : 'short'}:${p.id}`, group: 'goto', kind: tr(p.kind === 'MUSIC_VIDEO' ? 'kind.MUSIC_VIDEO' : 'kind.SHORT'), name, alt, action: go(productionHref(p)) });
    }
  }
  for (const c of state.characters) out.push({ id: `character:${c.id}`, group: 'goto', kind: tr('shell.palette.kind.character'), name: pick(locale, c.name, c.nameAr), alt: other(locale, c.name, c.nameAr), action: go(`/characters/${encodeURIComponent(c.id)}`) });
  for (const l of state.locations) out.push({ id: `location:${l.id}`, group: 'goto', kind: tr('shell.palette.kind.location'), name: pick(locale, l.name, l.nameAr), alt: other(locale, l.name, l.nameAr), action: go(`/locations/${encodeURIComponent(l.id)}`) });
  for (const d of x.departments) out.push({ id: `department:${d.id}`, group: 'goto', kind: tr('shell.palette.kind.department'), name: pick(locale, d.name, d.nameAr), alt: other(locale, d.name, d.nameAr), action: go(`/studio/departments/${encodeURIComponent(d.id)}`) });

  // ---- Create: each start with its method (§7.6) --------------------------------------------------------------------
  const methods = (id: string, kind: Key, path: string, query: Record<string, string>, detail?: string) => {
    for (const [m, label] of [['auto', 'shell.palette.propose'], ['manual', 'shell.palette.write']] as const) {
      const q = new URLSearchParams({ ...query, method: m }).toString();
      out.push({ id: `new:${id}:${m}`, group: 'create', kind: tr(kind), name: tr(label), detail, words: tr('nav.new'), action: go(`${path}?${q}`) });
    }
  };
  const show = x.currentShowId ? state.shows.find((s) => s.id === x.currentShowId) : undefined;
  const showName = show ? pick(locale, show.title, show.titleAr) : undefined;
  methods('show', 'shell.palette.new.show', '/new/show', {});
  if (show) methods(`season:${show.id}`, 'shell.palette.new.season', '/new/season', { show: show.id }, showName);
  methods(show ? `episode:${show.id}` : 'episode', 'shell.palette.new.episode', '/new/episode', show ? { show: show.id } : {}, showName);
  methods('short', 'shell.palette.new.short', '/new/short', {});
  methods('music-video', 'shell.palette.new.musicVideo', '/new/music-video', {});
  // a character starts from words, a written sheet or a picture (the three real starts of /characters/new)
  for (const s of ['describe', 'sheet', 'picture'] as const) out.push({ id: `new:character:${s}`, group: 'create', kind: tr('shell.palette.new.character'), name: tr(`cast.start.${s}`), words: tr('nav.new'), action: go(`/characters/new?start=${s}`) });
  out.push({ id: 'new:location', group: 'create', kind: tr('shell.palette.new.location'), name: tr('shell.palette.describePlace'), words: tr('nav.new'), action: go('/locations/new') });

  // ---- Decide: it opens the card; nothing is approved from here ------------------------------------------------------
  for (const d of x.decisions) {
    if (d.kind === 'stage') {
      const stage = x.dyn(`pipeline.${d.stage}`, d.stage);
      out.push({ id: `decide:${d.id}`, group: 'decide', kind: tr('shell.palette.kind.approve'), name: fill(tr('shell.palette.decide.stage'), { stage, title: pick(locale, d.title, d.titleAr) }), alt: other(locale, d.title, d.titleAr), action: go(d.href) });
    } else {
      out.push({ id: `decide:${d.id}`, group: 'decide', kind: tr('shell.palette.kind.approve'), name: fill(tr('shell.palette.decide.image'), { name: pick(locale, d.name, d.nameAr) }), alt: other(locale, d.name, d.nameAr), action: go(d.href) });
    }
  }

  // ---- Settings ------------------------------------------------------------------------------------------------------
  const set = tr('shell.palette.kind.setting');
  out.push(x.prefs.contrastMore
    ? { id: 'setting:contrast', group: 'settings', kind: set, name: tr('shell.palette.contrastStandard'), words: x.other('shell.palette.contrastStandard'), action: { type: 'contrast', value: 'standard' } }
    : { id: 'setting:contrast', group: 'settings', kind: set, name: tr('shell.palette.contrastMore'), words: x.other('shell.palette.contrastMore'), action: { type: 'contrast', value: 'more' } });
  out.push({ id: 'setting:motion', group: 'settings', kind: set, name: tr(x.prefs.reducedMotion ? 'shell.palette.motionOff' : 'shell.palette.motionOn'), words: x.other(x.prefs.reducedMotion ? 'shell.palette.motionOff' : 'shell.palette.motionOn'), action: { type: 'motion', value: !x.prefs.reducedMotion } });
  // the language is always offered in its own script: "Language: العربية" / "اللغة: English"
  out.push({ id: 'setting:language', group: 'settings', kind: set, name: tr('shell.palette.language'), words: 'language arabic english لغة عربية انجليزية', action: { type: 'language', value: locale === 'ar' ? 'en' : 'ar' } });
  out.push({ id: 'setting:keys', group: 'settings', kind: set, name: tr(x.prefs.singleKeys ? 'shell.palette.keysOff' : 'shell.palette.keysOn'), words: x.other(x.prefs.singleKeys ? 'shell.palette.keysOff' : 'shell.palette.keysOn'), action: { type: 'keys', value: !x.prefs.singleKeys } });
  out.push({ id: 'setting:sheet', group: 'settings', kind: set, name: tr('shell.help'), words: `${x.other('shell.help')} ? keyboard`, action: { type: 'sheet' } });
  return out;
}

/** Fold a string for matching: case, Latin accents, Arabic diacritics, tatweel and letter variants, quotes. */
export function fold(s: string): string {
  return s.normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[’'`"«»“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const wordStart = (hay: string, token: string) => hay.startsWith(token) || hay.includes(` ${token}`);

/** The entries a query finds, best first within each group, groups in order. Every word of the query must match. */
export function search(entries: PaletteEntry[], query: string, limit = 60): PaletteEntry[] {
  const q = fold(query);
  if (!q) return [];
  const tokens = q.split(' ');
  const scored: Array<{ e: PaletteEntry; score: number; i: number }> = [];
  entries.forEach((e, i) => {
    const name = fold(e.name); const alt = fold(e.alt ?? '');
    // the label as it reads, kind first ("new show let the studio propose")
    const label = `${fold(e.kind)} ${name}`;
    const hay = `${label} ${alt} ${fold(e.detail ?? '')} ${fold(e.words ?? '')}`;
    if (!tokens.every((t) => hay.includes(t))) return;
    let score = 0;
    if (name.startsWith(q) || alt.startsWith(q) || label.startsWith(q)) score += 8;
    for (const t of tokens) score += wordStart(label, t) || wordStart(alt, t) ? 3 : wordStart(hay, t) ? 2 : 1;
    scored.push({ e, score, i });
  });
  scored.sort((a, b) => GROUP_ORDER.indexOf(a.e.group) - GROUP_ORDER.indexOf(b.e.group) || b.score - a.score || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.e);
}

/** What the palette shows before anything is typed: the recent items, then what waits for a decision, then the
 *  pages of the navigation. */
export function emptyView(entries: PaletteEntry[], recent: string[]): { recent: PaletteEntry[]; rest: PaletteEntry[] } {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const rec = recent.map((id) => byId.get(id)).filter((e): e is PaletteEntry => Boolean(e));
  const seen = new Set(rec.map((e) => e.id));
  const rest = [...entries.filter((e) => e.group === 'decide'), ...entries.filter((e) => e.id.startsWith('page:'))].filter((e) => !seen.has(e.id));
  return { recent: rec, rest };
}

/** Put an entry at the front of the recent list (at most `max`; settings are not remembered). */
export function pushRecent(recent: string[], id: string, max = 6): string[] {
  if (id.startsWith('setting:')) return recent;
  return [id, ...recent.filter((x) => x !== id)].slice(0, max);
}
