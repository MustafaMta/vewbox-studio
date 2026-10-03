import type { Asset, Character, Location, Production, StudioState } from '@/domain/types';
import type { Presentation } from '@/domain/presentation';
import type { Decision } from '@/studio/selectors/decisions';
import { identityStatus, voiceTrackSource } from '@/components/character/identity';
import { primaryImageOf } from '@/domain/identity';
import { keyFrameFor, posterOf } from '@/studio/selectors/poster';
import { productionHref, progressOf, shotLabel } from '@/studio/selectors';

/** THE HOME PAGE'S READING OF THE STUDIO (docs/design/VISUAL-STANDARD-V5.1.md §7) — pure, so every word and number the
 *  page shows comes from real state and can be tested: the marquee (the latest film, with its crop), the decisions
 *  that wait (the four oldest), the recent work (four equal 16:9 tiles), the characters' line-up, the start actions and
 *  the studio panel's four facts. Nothing here is estimated or invented: a fact that is not in the state is left out,
 *  never filled with a placeholder. */

type S = Pick<StudioState, 'productions' | 'characters' | 'locations' | 'assets' | 'shows'>;

/** The display file of a picture: the derived thumbnail when it exists (B7), else the original. */
export const displaySrc = (a: Asset | undefined | null): string | undefined => (a && !a.unavailable ? a.thumb?.src ?? a.src : undefined);
const byId = (s: S) => { const m = new Map(s.assets.map((a) => [a.id, a])); return (id?: string | null) => (id ? m.get(id) : undefined); };
const titleOf = (p: Production) => (p.kind === 'MUSIC_VIDEO' ? p.song?.title || p.title : p.title);
const usable = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.unavailable && !a.sample);

/** Server timestamps arrive as `2026-10-03 09:33:34.579+00` from Postgres or ISO from JSON; both become a Date. */
export function parseTime(t: string | null | undefined): Date | null {
  if (!t) return null;
  const iso = t.includes('T') ? t : t.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** "3 Oct, 09:33" — the studio's short date and time, Western digits, 24-hour. */
export function shortWhen(t: string | null | undefined): string | null {
  const d = parseTime(t);
  if (!d) return null;
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${day}, ${time}`;
}
export const shortDay = (t: string | null | undefined): string | null => { const d = parseTime(t); return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d) : null; };

/** 0:56, 12:04, 1:02:09 */
export function runtime(seconds: number | undefined | null): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** A count in words up to twelve (prose), digits above: "Four decisions", "15 takes". */
export const countWord = (n: number, capital = false): string => { const w = n >= 0 && n < WORDS.length ? WORDS[n] : String(n); return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w; };
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export const KIND_LABEL: Record<Production['kind'], string> = { SHORT: 'Short film', MUSIC_VIDEO: 'Music video', EPISODE: 'Episode' };
const KIND_SHORT: Record<Production['kind'], string> = { SHORT: 'Short', MUSIC_VIDEO: 'Music video', EPISODE: 'Episode' };
export const STYLE_LABEL: Record<string, string> = { CARTOON: 'Cartoon', ANIME: 'Anime', REALISTIC: 'Realistic' };
export const LANGUAGE_LABEL: Record<string, string> = { EN: 'English', AR: 'Arabic' };
const STAGE_WORDS: Record<string, string> = { STORY: 'Story', CAST_AND_WORLD: 'Cast and world', STORYBOARD: 'Storyboard', PRODUCE: 'Filming', FINAL_CUT: 'Final cut', COMPLETE: 'Finished' };
export const stageWords = (st: string) => STAGE_WORDS[st] ?? st.charAt(0) + st.slice(1).toLowerCase().replace(/_/g, ' ');
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A content name's language when its script says so (§4.4: `lang` when known, omitted otherwise). */
export const nameLang = (name: string): 'ar' | undefined => (/[؀-ۿݐ-ݿࢠ-ࣿ]/.test(name) ? 'ar' : undefined);

// ------------------------------------------------------------------------------------------------------ the crops

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number) => `${+(clamp01(n) * 100).toFixed(2)}%`;

/** `object-position` for a picture drawn with `object-fit: cover` in a box (§7.1 crop rule, §5.7).
 *
 *  Horizontal: when the box is narrower than the picture (a side crop) the face centre — else `portraitFocal`, else
 *  `focal` — is centred in the visible window: x = (cx − w/2) / (1 − w), w = the visible share of the width (§7.1's
 *  `portraitFocal.x`). When nothing is cropped from the sides, x = `focal.x` (the standard's desktop rule).
 *  Vertical: when the box is wider than the picture (a crop of the top or bottom) and the top of `faceBox` is in the top
 *  20 %, the picture is anchored at the top (0 %; never crop above a head); with a lower face its centre sits at
 *  `faceAt` (35 % by default) of the visible height; with no face box known, the top anchor (the safe choice). */
export function coverPosition(p: Presentation | null | undefined, picture: { width?: number; height?: number }, boxRatio: number, faceAt = 0.35): string {
  const ratio = picture.width && picture.height ? picture.width / picture.height : 16 / 9;
  const face = p?.faceBox && p.faceBox.w > 0 && p.faceBox.h > 0 ? p.faceBox : undefined;
  const focalX = p?.focal?.x ?? 0.5;
  let x = focalX;
  if (boxRatio < ratio - 1e-6) {
    const w = boxRatio / ratio;
    const cx = face ? face.x + face.w / 2 : p?.portraitFocal?.x ?? focalX;
    x = (cx - w / 2) / (1 - w);
  }
  let y = 0;
  if (boxRatio > ratio + 1e-6 && face && face.y > 0.2) {
    const v = ratio / boxRatio; // the visible share of the height
    y = (face.y + face.h / 2 - faceAt * v) / (1 - v);
  }
  return `${pct(x)} ${pct(y)}`;
}

/** A standing figure (928:1664) cropped to a 16:9 card or tile (§5.7): the face centre at 38 % of the visible height
 *  from `presentation.faceBox`; without a face box, `50% 8%` (head and shoulders of a full-figure image). */
export function figureCrop(p: Presentation | null | undefined, picture: { width?: number; height?: number }, boxRatio = 16 / 9): string {
  const face = p?.faceBox && p.faceBox.w > 0 && p.faceBox.h > 0 ? p.faceBox : undefined;
  if (!face) return '50% 8%';
  const ratio = picture.width && picture.height ? picture.width / picture.height : 928 / 1664;
  const v = ratio / boxRatio; // visible share of the height when the width fills the box
  const y = v >= 1 ? 0.5 : (face.y + face.h / 2 - 0.38 * v) / (1 - v);
  return `${pct(face.x + face.w / 2)} ${pct(y)}`;
}

// ---------------------------------------------------------------------------------------------------- the marquee

export interface MarqueeAction { label: string; href: string; play?: boolean }

export interface Marquee {
  production: Production;
  href: string;
  title: string;
  /** a title longer than 28 characters steps down one role (§4.3) */
  long: boolean;
  /** finished with a cut, or still being made */
  finished: boolean;
  /** the status badge (§5.13) */
  badge: { tone: 'ok' | 'neutral'; words: string };
  slate: string[];
  lead: string;
  /** the production's wide frame: desktop at the box's own ratio, phones a 4:5 window of the same frame */
  wide?: { src: string; asset: Asset; width: number; height: number };
  secondary: MarqueeAction;
  primary: MarqueeAction;
}

const updated = (p: Production) => parseTime(p.updatedAt)?.getTime() ?? 0;

/** The latest film the studio made: the most recently updated production with a cut, else the most recently updated
 *  one at all (work in progress: the primary says "Continue: <stage>"). Null in an empty studio. */
export function pickMarquee(s: S): Marquee | null {
  if (s.productions.length === 0) return null;
  const recent = [...s.productions].sort((a, b) => updated(b) - updated(a));
  const p = recent.find((x) => x.cutAssetId) ?? recent[0];
  const get = byId(s);
  const cut = get(p.cutAssetId);
  const finished = Boolean(cut && p.stage === 'COMPLETE');
  const pr = progressOf(p);
  // the wide picture: the cover, else the cut's own poster frame, else the key frame (a still of the last good shot)
  const cover = get(p.coverAssetId);
  const cutPoster = cut?.poster ? s.assets.find((a) => a.src === cut.poster || `/api/media/${a.id}` === cut.poster) : undefined;
  const kfImage = get(keyFrameFor(p, s.assets)?.imageAssetId);
  const wideAsset = [cover, cutPoster, kfImage].find(usable);
  const runtimeSec = cut?.durationSeconds ?? (pr.runtime || undefined);
  const year = parseTime(p.createdAt)?.getFullYear();
  const href = productionHref(p);
  const title = titleOf(p);
  const stage = stageWords(p.stage);
  return {
    production: p,
    href,
    title,
    long: title.length > 28,
    finished,
    badge: finished ? { tone: 'ok', words: 'Finished' } : { tone: 'neutral', words: stage },
    slate: [KIND_LABEL[p.kind], year ? String(year) : null, runtime(runtimeSec), STYLE_LABEL[p.style] ?? null, LANGUAGE_LABEL[p.language] ?? null].filter((x): x is string => Boolean(x)),
    lead: p.logline || p.synopsis || '',
    wide: wideAsset ? { src: wideAsset.src, asset: wideAsset, width: wideAsset.width ?? 1280, height: wideAsset.height ?? 720 } : undefined,
    secondary: { label: 'Open the film', href },
    primary: cut ? { label: 'Screen it', href: `/screening?p=${encodeURIComponent(p.id)}`, play: true } : { label: `Continue: ${lower(stage)}`, href: `${href}/production` },
  };
}

// ---------------------------------------------------------------------------------------------- the decision cards

export interface DecisionCard {
  id: string;
  kindLabel: string;
  heading: string;
  /** the heading is a name or title from the content (rendered as content text) */
  headingIsContent: boolean;
  body: string;
  action: string;
  href: string;
  picture?: { src: string; asset: Asset; figure: boolean; alt: string; position?: string };
  chip?: string;
}

/** One card per decision; its words come from the decision's facts. A character's image is portrait-cropped from its
 *  face (§5.7); scene stills keep their focal point. */
export function decisionCard(d: Decision, s: S): DecisionCard {
  const get = byId(s);
  const p = d.subject.productionId ? s.productions.find((x) => x.id === d.subject.productionId) : undefined;
  const c = d.subject.characterId ? s.characters.find((x) => x.id === d.subject.characterId) : undefined;
  const figureOf = (ch: Character | undefined) => { const a = ch ? get(primaryImageOf(ch)) : undefined; return usable(a) ? { src: displaySrc(a)!, asset: a, figure: true, alt: `${ch!.name}, canonical image${ch!.canonicalImage ? `, version ${ch!.canonicalImage.version}` : ''}`, position: figureCrop(a.presentation, a) } : undefined; };
  const shotStill = (shotId?: string) => {
    const sh = p?.shots.find((x) => x.id === shotId);
    if (!p || !sh) return undefined;
    const take = sh.takes.find((t) => t.id === sh.selectedTakeId);
    const a = [get(take?.thumbnailAssetId), get(sh.openingFrameAssetId)].find(usable);
    return a ? { src: displaySrc(a)!, asset: a, figure: false, alt: `Shot ${shotLabel(p, sh)} of ${titleOf(p)}` } : undefined;
  };
  const productionStill = () => {
    if (!p) return undefined;
    const kf = keyFrameFor(p, s.assets);
    const a = get(kf?.imageAssetId);
    if (usable(a)) return { src: displaySrc(a)!, asset: a, figure: false, alt: `A frame from ${titleOf(p)}` };
    const post = posterOf(p, s.assets);
    return post && usable(post.asset) ? { src: displaySrc(post.asset)!, asset: post.asset, figure: false, alt: `Poster of ${titleOf(p)}` } : undefined;
  };

  switch (d.kind) {
    case 'image': {
      const img = c?.canonicalImage;
      const why = img?.referenceAssetId ? 'Drawn from the reference picture you uploaded.' : img && img.version > 1 ? `Drawn again: this is version ${img.version}.` : 'Drawn from the written description.';
      const voice = c && voiceTrackSource(c).kind === 'NONE' ? ' No voice yet.' : '';
      const check = img?.check && !img.check.ok ? ' The automatic check raised a concern; look closely.' : '';
      return { id: d.id, kindLabel: `Character image${img ? ` · version ${img.version}` : ''}`, heading: d.title, headingIsContent: true, body: `${why}${voice}${check} Approve it to fix the look before filming.`, action: 'Review and approve', href: d.href, picture: figureOf(c) };
    }
    case 'character':
      return { id: d.id, kindLabel: 'Character · casting run', heading: d.title, headingIsContent: true, body: 'The casting run stopped and waits for your review before it goes on.', action: 'Review', href: d.href, picture: figureOf(c) };
    case 'lines': {
      const lines = d.lines ?? [];
      const n = lines.length;
      const notHeard = lines.filter((l) => l.reason === 'NOT_HEARD').length;
      const shots = [...new Set(lines.map((l) => l.shotId))];
      const labels = p ? shots.map((id) => { const sh = p.shots.find((x) => x.id === id); return sh ? shotLabel(p, sh) : null; }).filter(Boolean) : [];
      const body = n === 0 ? 'Their recordings were replaced since; settle the review to clear it.'
        : notHeard === n ? `The automatic check could not hear ${n === 1 ? 'it' : 'them'} back. Listen and confirm ${n === 1 ? 'it is' : 'they are'} fine.`
          : notHeard === 0 ? `${n === 1 ? 'It' : 'They'} drifted from the script. Listen and decide.`
            : 'Some could not be heard back and some drifted from the script. Listen and decide.';
      return { id: d.id, kindLabel: `Dialogue · ${d.title}`, heading: n ? `${countWord(n, true)} ${plural(n, 'line')} to hear again` : 'Lines to hear again', headingIsContent: false, body, action: 'Listen', href: d.href, picture: shotStill(shots[0] ?? d.subject.shotId), chip: labels.length ? labels.join(' · ') : undefined };
    }
    case 'take': {
      const sh = p?.shots.find((x) => x.id === d.subject.shotId);
      return { id: d.id, kindLabel: `Take review · ${d.title}`, heading: sh && p ? `Shot ${shotLabel(p, sh)}, a new take` : 'A new take', headingIsContent: false, body: 'Its speech could not be verified automatically. Watch it and decide.', action: 'Watch', href: d.href, picture: shotStill(d.subject.shotId) };
    }
    case 'pass': {
      const shots = p?.shots.length ?? 0;
      const takes = p?.shots.reduce((a, sh) => a + sh.takes.length, 0) ?? 0;
      const since = shortDay(d.since);
      const what = [shots ? `${countWord(shots, true)} ${plural(shots, 'shot')}` : null, takes ? `${takes} ${plural(takes, 'take')}` : null].filter(Boolean).join(' and ');
      return { id: d.id, kindLabel: `Production review · ${d.title}`, heading: 'The production pass', headingIsContent: false, body: what ? `${what} ${shots + takes === 1 ? 'has' : 'have'} waited for your look${since ? ` since ${since}` : ''}.` : `The pass waits for your look${since ? ` since ${since}` : ''}.`, action: 'Review', href: d.href, picture: productionStill(), chip: takes ? `${takes} ${plural(takes, 'take')}` : undefined };
    }
    case 'stage':
    default:
      return { id: d.id, kindLabel: `Approval · ${d.title}`, heading: `${stageWords(d.subject.stage ?? '')} waits for your approval`, headingIsContent: false, body: 'Nothing moves past this stage until you approve it.', action: 'Open', href: d.href, picture: productionStill() };
  }
}

/** The Needs-you section (§7.2): the four oldest decisions as cards, the count, and the link's words ("All decisions";
 *  "All 6 decisions" when more wait than are shown). Null when nothing waits (the section is omitted). */
export function needsYou(items: Decision[], s: S, shown = 4): { count: number; cards: DecisionCard[]; link: string } | null {
  if (items.length === 0) return null;
  const at = (d: Decision) => parseTime(d.since)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const oldest = items.map((d, i) => ({ d, i })).sort((a, b) => at(a.d) - at(b.d) || a.i - b.i).slice(0, shown).map((x) => x.d);
  return { count: items.length, cards: oldest.map((d) => decisionCard(d, s)), link: items.length > shown ? `All ${items.length} decisions` : 'All decisions' };
}

// ------------------------------------------------------------------------------------------------ recent work

export interface RecentItem {
  key: string;
  kind: 'production' | 'character' | 'location';
  href: string;
  title: string;
  lang?: 'ar';
  /** "Short · Final cut · 3 Oct", "Character · approved, locked", "Location · interior · 1 plate" */
  meta: string;
  src?: string;
  asset?: Asset;
  /** `object-position` in the 16:9 frame: figures portrait-cropped from the face, plates and frames on their focal point */
  position?: string;
  at: number;
}

const charHref = (c: Character) => `/characters/${encodeURIComponent(c.id)}`;
const locHref = (l: Location) => `/locations/${encodeURIComponent(l.id)}`;

/** What was touched last, newest first, every item a 16:9 tile (§7.3): productions their key frame, characters their
 *  figure cropped from the face, locations their plate. */
export function recentWork(s: S, limit = 6): RecentItem[] {
  const get = byId(s);
  const items: RecentItem[] = [];
  for (const p of s.productions) {
    const cut = get(p.cutAssetId);
    const cutPoster = cut?.poster ? s.assets.find((a) => a.src === cut.poster || `/api/media/${a.id}` === cut.poster) : undefined;
    const kf = get(keyFrameFor(p, s.assets)?.imageAssetId);
    const pic = [get(p.coverAssetId), cutPoster, kf].find(usable);
    const day = shortDay(p.updatedAt);
    const title = titleOf(p);
    items.push({ key: p.id, kind: 'production', href: productionHref(p), title, lang: nameLang(title), meta: [KIND_SHORT[p.kind], p.stage === 'COMPLETE' ? 'Final cut' : stageWords(p.stage), day].filter(Boolean).join(' · '), src: displaySrc(pic), asset: pic, at: updated(p) });
  }
  for (const c of s.characters) {
    const st = identityStatus(c);
    const a = get(primaryImageOf(c));
    const what = st.kind === 'LOCKED' ? 'approved, locked' : st.kind === 'APPROVED' ? 'approved' : st.kind === 'DRAFT' ? `version ${st.version ?? 1}, awaiting you` : 'no image yet';
    const ok = usable(a);
    items.push({ key: c.id, kind: 'character', href: charHref(c), title: c.name, lang: nameLang(c.name), meta: `Character · ${what}`, src: ok ? displaySrc(a) : undefined, asset: ok ? a : undefined, position: ok ? figureCrop(a.presentation, a) : undefined, at: parseTime(c.updatedAt)?.getTime() ?? 0 });
  }
  for (const l of s.locations) {
    const a = [get(l.masterAssetId), ...l.refs.map((r) => get(r.assetId))].find(usable);
    const plates = l.refs.length || (l.masterAssetId ? 1 : 0);
    items.push({ key: l.id, kind: 'location', href: locHref(l), title: l.name, lang: nameLang(l.name), meta: ['Location', l.kind === 'INTERIOR' ? 'interior' : 'exterior', plates ? `${plates} ${plural(plates, 'plate')}` : null].filter(Boolean).join(' · '), src: displaySrc(a), asset: a, at: parseTime(l.updatedAt)?.getTime() ?? 0 });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------- the line-up

export interface CastTile { id: string; name: string; lang?: 'ar'; href: string; src?: string; asset?: Asset; waiting: boolean }

/** The characters in the studio's order (§7.4); `waiting` marks those whose image waits for the producer (the shared
 *  decision selector's `image:` items), the only state a tile shows. */
export function lineup(s: S, waiting: ReadonlySet<string>, limit = 15): CastTile[] {
  const get = byId(s);
  return s.characters.slice(0, limit).map((c) => {
    const a = get(primaryImageOf(c));
    const ok = usable(a);
    return { id: c.id, name: c.name, lang: nameLang(c.name), href: charHref(c), src: ok ? displaySrc(a) : undefined, asset: ok ? a : undefined, waiting: waiting.has(c.id) };
  });
}

/** The character ids an `image` or `character` decision waits on. */
export const waitingCharacters = (items: Decision[]): Set<string> => new Set(items.filter((d) => (d.kind === 'image' || d.kind === 'character') && d.subject.characterId).map((d) => d.subject.characterId!));

// ------------------------------------------------------------------------------------------------- start actions

export type StartShape = 'show' | 'short' | 'music' | 'character';
export interface StartAction { href: string; title: string; line: string; shape: StartShape }

/** The four ways to start (§7.5); each opens its own page, where the Auto/Manual choice happens. */
export const START_ACTIONS: readonly StartAction[] = [
  { href: '/new/show', title: 'New show', line: 'Seasons that share one cast', shape: 'show' },
  { href: '/new/short', title: 'New short', line: 'One film; a line is enough to start', shape: 'short' },
  { href: '/new/music-video', title: 'New music video', line: 'It starts with its song', shape: 'music' },
  { href: '/characters/new', title: 'New character', line: 'One image, one voice', shape: 'character' },
];

// ------------------------------------------------------------------------------------------------ the studio panel

export interface Health { intake?: { paused: boolean; since?: string | null; reason?: string | null } | null; queue?: { queued: number; running: number; failed24h: number; completed24h: number } | null }
export interface Engines { video?: { ok: boolean }; images?: { ok: boolean }; voice?: { ok: boolean } }
export interface OrgSummary { departments: Array<{ id: string; name: string }>; agents: number; handoffs: Array<{ id: string; productionId: string; stage: string; producerDepartment: string; receiverDepartment: string | null; qualityStatus: string; createdAt: string }> }

export type FactTone = 'idle' | 'running' | 'ok' | 'bad';
/** One cell of the studio panel: a label, a value (null while it loads), an optional second line. */
export interface StudioFact { key: 'state' | 'company' | 'engines' | 'handoff'; label: string; value: string | null; second?: string | null; tone?: FactTone }

const HANDOFF_WORDS: Record<string, string> = { EXPORT: 'Export made and validated', EDIT: 'Cut handed over and validated', QA: 'Every shot passed inspection', PRODUCE: 'Takes handed over', STORYBOARD: 'Storyboard handed over', STORY: 'Story handed over', CAST_AND_WORLD: 'Cast and world handed over' };
export const handoffWords = (stage: string, ok: boolean) => `${HANDOFF_WORDS[stage] ?? `${stageWords(stage)} handed over`}${ok ? '' : ' · not validated'}`.replace(' and validated · not validated', ' · not validated');

const engineWords = (name: string, ok: boolean | undefined) => `${name} ${ok ? 'ready' : 'offline'}`;

/** The four facts of the studio panel (§7.6) from /api/health, /api/status and /api/studio/org?view=summary. A source
 *  that has not answered yet gives `value: null` (the cell shows its skeleton); one that failed says so in words. */
export function studioFacts(x: { health: Health | null; engines: Engines | null; org: OrgSummary | null; running: number; failed?: { health?: boolean; engines?: boolean; org?: boolean } }): StudioFact[] {
  const { health, engines, org, running, failed = {} } = x;
  const unknown = 'Not available';
  const state: StudioFact = health
    ? health.intake?.paused
      ? { key: 'state', label: 'State', value: 'Paused', second: shortWhen(health.intake.since) ? `since ${shortWhen(health.intake.since)}` : null, tone: 'idle' }
      : running > 0
        ? { key: 'state', label: 'State', value: `Making · ${running} ${plural(running, 'job')}`, second: null, tone: 'running' }
        : { key: 'state', label: 'State', value: 'Ready', second: null, tone: 'ok' }
    : { key: 'state', label: 'State', value: failed.health ? 'Server unreachable' : null, tone: failed.health ? 'bad' : undefined };
  const company: StudioFact = org
    ? { key: 'company', label: 'Company', value: `${org.departments.length} ${plural(org.departments.length, 'department')} · ${org.agents} ${plural(org.agents, 'agent')}` }
    : { key: 'company', label: 'Company', value: failed.org ? unknown : null };
  const pictures = engines ? Boolean(engines.images?.ok && engines.video?.ok) : undefined;
  const voices = Boolean(engines?.voice?.ok);
  const enginesFact: StudioFact = engines
    ? { key: 'engines', label: 'Engines', value: pictures === voices ? `Picture, video and voices ${voices ? 'ready' : 'offline'}` : `${engineWords('Picture and video', pictures)} · ${engineWords('Voices', voices)}` }
    : { key: 'engines', label: 'Engines', value: failed.engines ? unknown : null };
  const h = org?.handoffs[0];
  const dept = (id: string) => org?.departments.find((d) => d.id === id)?.name ?? id;
  const handoff: StudioFact = org
    ? h
      ? { key: 'handoff', label: 'Last handoff', value: `${dept(h.producerDepartment)} · ${lower(handoffWords(h.stage, h.qualityStatus === 'VALIDATED'))}`, second: shortWhen(h.createdAt) }
      : { key: 'handoff', label: 'Last handoff', value: 'None yet' }
    : { key: 'handoff', label: 'Last handoff', value: failed.org ? unknown : null };
  return [state, company, enginesFact, handoff];
}

/** Jobs being made now (queued or in any working phase); a job parked for review is a decision, not work. */
export const RUNNING_STATUSES = ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'] as const;
