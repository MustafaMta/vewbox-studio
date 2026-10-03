import type { Asset, Character, Location, Production, StudioState } from '@/domain/types';
import type { Decision } from '@/studio/selectors/decisions';
import { identityStatus, voiceTrackSource } from '@/components/character/identity';
import { primaryImageOf } from '@/domain/identity';
import { keyFrameFor, posterOf } from '@/studio/selectors/poster';
import { productionHref, progressOf, shotLabel } from '@/studio/selectors';

/** THE HOME PAGE'S READING OF THE STUDIO (docs/DESIGN-SYSTEM-V5.md §8.1) — pure, so every line the page shows comes
 *  from real state and can be tested: the marquee (the latest film), one card per waiting decision, the contact sheet
 *  of recent work, and the characters' line-up. Nothing here is estimated or invented: a fact that is not in the state
 *  is left out, never filled with a placeholder. */

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
/** 00:00:56:00 at the cut's frame rate */
export function timecode(seconds: number, fps = 24): string {
  const total = Math.round(seconds * fps), f = total % fps, s = Math.floor(total / fps);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}:${p(f)}`;
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

// ---------------------------------------------------------------------------------------------------- the marquee

export interface Marquee {
  production: Production;
  href: string;
  title: string;
  /** finished with a cut, or still being made */
  finished: boolean;
  kick: string;
  slate: string[];
  status: { tone: 'ok' | 'wait' | 'neutral'; words: string };
  lead: string;
  /** the wide picture (desktop) and the portrait poster (phone); either may be absent */
  wide?: { src: string; asset: Asset };
  poster?: { src: string; asset: Asset; kind: 'KEY_ART' | 'FRAME_POSTER' };
  credit: string[];
  creditMono?: string;
  screenHref?: string;
}

const updated = (p: Production) => parseTime(p.updatedAt)?.getTime() ?? 0;

/** The latest film the studio made: the most recently updated production with a cut, else the most recently updated
 *  one at all (work in progress: the marquee says Continue). Null in an empty studio. */
export function pickMarquee(s: S): Marquee | null {
  if (s.productions.length === 0) return null;
  const recent = [...s.productions].sort((a, b) => updated(b) - updated(a));
  const p = recent.find((x) => x.cutAssetId) ?? recent[0];
  const get = byId(s);
  const cut = get(p.cutAssetId);
  const finished = Boolean(cut && p.stage === 'COMPLETE');
  const exp = [...(p.exports ?? [])].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  const pr = progressOf(p);
  // the wide picture: the cover, else the cut's own poster frame, else the key frame (a still of the last good shot)
  const cover = get(p.coverAssetId);
  const cutPoster = cut?.poster ? s.assets.find((a) => a.src === cut.poster || `/api/media/${a.id}` === cut.poster) : undefined;
  const kf = keyFrameFor(p, s.assets);
  const kfImage = get(kf?.imageAssetId);
  const wideAsset = [cover, cutPoster, kfImage].find(usable);
  const posterPick = posterOf(p, s.assets);
  const runtimeSec = cut?.durationSeconds ?? (pr.runtime || undefined);
  const year = parseTime(p.createdAt)?.getFullYear();
  const words = (() => {
    if (finished && exp) return { tone: 'ok' as const, words: 'Finished · exported' };
    if (finished) return { tone: 'ok' as const, words: 'Finished' };
    return { tone: 'neutral' as const, words: stageWords(p.stage) };
  })();
  const subs = exp?.subtitles ? `${LANGUAGE_LABEL[exp.subtitles.toUpperCase()] ?? exp.subtitles} subtitles, burned in` : null;
  const credit = [
    pr.scenes ? `${pr.scenes} ${plural(pr.scenes, 'scene')}` : null,
    pr.shots ? `${pr.shots} ${plural(pr.shots, 'shot')}` : null,
    subs,
  ].filter((x): x is string => Boolean(x));
  const href = productionHref(p);
  return {
    production: p,
    href,
    title: titleOf(p),
    finished,
    kick: finished ? (exp ? 'The final cut is ready' : 'The cut is ready') : `Continue · ${stageWords(p.stage).toLowerCase()}`,
    slate: [KIND_LABEL[p.kind], year ? String(year) : null, runtime(runtimeSec), STYLE_LABEL[p.style] ?? null, LANGUAGE_LABEL[p.language] ?? null].filter((x): x is string => Boolean(x)),
    status: words,
    lead: p.logline || p.synopsis,
    wide: wideAsset ? { src: wideAsset.src, asset: wideAsset } : undefined,
    poster: posterPick && usable(posterPick.asset) ? { src: displaySrc(posterPick.asset)!, asset: posterPick.asset, kind: posterPick.kind } : undefined,
    credit,
    creditMono: cut ? [cut.width && cut.height ? `${cut.width}×${cut.height}` : null, cut.durationSeconds ? timecode(cut.durationSeconds, cut.fps ?? 24) : null].filter(Boolean).join(' · ') || undefined : undefined,
    screenHref: cut ? `/screening?p=${encodeURIComponent(p.id)}` : undefined,
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
  picture?: { src: string; asset: Asset; figure: boolean; alt: string };
  chip?: string;
}

/** One card per decision, in the order the shared selector gives them; its words come from the decision's facts. */
export function decisionCard(d: Decision, s: S): DecisionCard {
  const get = byId(s);
  const p = d.subject.productionId ? s.productions.find((x) => x.id === d.subject.productionId) : undefined;
  const c = d.subject.characterId ? s.characters.find((x) => x.id === d.subject.characterId) : undefined;
  const figureOf = (ch: Character | undefined) => { const a = ch ? get(primaryImageOf(ch)) : undefined; return usable(a) ? { src: displaySrc(a)!, asset: a, figure: true, alt: `${ch!.name}, canonical image${ch!.canonicalImage ? `, version ${ch!.canonicalImage.version}` : ''}` } : undefined; };
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

/** The sentence under the marquee: what waits and whether anything is being filmed. */
export function introLine(decisions: number, running: number, paused: boolean): string {
  const wait = decisions === 0 ? 'Nothing waits for you' : `${countWord(decisions, true)} ${plural(decisions, 'decision')} ${decisions === 1 ? 'waits' : 'wait'} for you`;
  const filming = running > 0 ? `${countWord(running)} ${plural(running, 'job')} ${running === 1 ? 'is' : 'are'} running now` : paused ? 'the studio is paused' : 'nothing is being made right now';
  return `${wait}; ${filming}.`;
}

// ---------------------------------------------------------------------------------------------- the contact sheet

export interface RecentItem {
  key: string;
  shape: '16x9' | 'fig' | '239';
  href: string;
  kindLabel: string;
  title: string;
  what: string;
  src?: string;
  asset?: Asset;
  chip?: string;
  at: number;
}

const charHref = (c: Character) => `/characters/${encodeURIComponent(c.id)}`;
const locHref = (l: Location) => `/locations/${encodeURIComponent(l.id)}`;

/** What was touched last, each in its own shape: productions (16:9 frame), characters (the figure), locations (the
 *  2.39 plate), newest first. */
export function recentWork(s: S, limit = 6): RecentItem[] {
  const get = byId(s);
  const items: RecentItem[] = [];
  for (const p of s.productions) {
    const cut = get(p.cutAssetId);
    const exp = [...(p.exports ?? [])].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
    const cutPoster = cut?.poster ? s.assets.find((a) => a.src === cut.poster) : undefined;
    const kf = get(keyFrameFor(p, s.assets)?.imageAssetId);
    const pic = [get(p.coverAssetId), kf, cutPoster].find(usable);
    const when = shortWhen(exp?.createdAt ?? p.updatedAt);
    const what = exp ? `Exported ${exp.resolution ? `${exp.resolution}p` : ''}${when ? ` · ${when}` : ''}`.replace('Exported  ·', 'Exported ·') : `${stageWords(p.stage)}${when ? ` · ${when}` : ''}`;
    items.push({ key: p.id, shape: '16x9', href: productionHref(p), kindLabel: `${KIND_SHORT[p.kind]} · ${p.stage === 'COMPLETE' ? 'Final cut' : stageWords(p.stage)}`, title: titleOf(p), what, src: displaySrc(pic), asset: pic, chip: runtime(cut?.durationSeconds) ?? undefined, at: updated(p) });
  }
  for (const c of s.characters) {
    const st = identityStatus(c);
    const a = get(primaryImageOf(c));
    const what = st.kind === 'LOCKED' ? 'Approved · locked' : st.kind === 'APPROVED' ? 'Approved' : st.kind === 'DRAFT' ? `Version ${st.version ?? 1} · awaiting you` : 'No image yet';
    items.push({ key: c.id, shape: 'fig', href: charHref(c), kindLabel: 'Character', title: c.name, what, src: usable(a) ? displaySrc(a) : undefined, asset: usable(a) ? a : undefined, at: parseTime(c.updatedAt)?.getTime() ?? 0 });
  }
  for (const l of s.locations) {
    const a = [get(l.masterAssetId), ...l.refs.map((r) => get(r.assetId))].find(usable);
    const films = s.productions.filter((p) => p.locationIds.includes(l.id)).length;
    const lighting = l.lighting.map((t) => t.charAt(0) + t.slice(1).toLowerCase()).join(', ');
    const what = [l.refs.length ? `${l.refs.length} ${plural(l.refs.length, 'plate')}` : null, lighting || null, films ? `in ${films} ${plural(films, 'film')}` : null].filter(Boolean).join(' · ');
    items.push({ key: l.id, shape: '239', href: locHref(l), kindLabel: 'Location', title: l.name, what: what || (l.kind === 'INTERIOR' ? 'Interior' : 'Exterior'), src: displaySrc(a), asset: a, at: parseTime(l.updatedAt)?.getTime() ?? 0 });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------- the line-up

export interface CastTile { id: string; name: string; href: string; src?: string; asset?: Asset; state: { tone: 'ok' | 'wait' | 'neutral'; words: string } }

export function lineup(s: S, limit = 5): CastTile[] {
  const get = byId(s);
  return s.characters.slice(0, limit).map((c) => {
    const st = identityStatus(c);
    const a = get(primaryImageOf(c));
    const state = st.kind === 'LOCKED' ? { tone: 'neutral' as const, words: `Locked · in ${st.videos} ${plural(st.videos, 'film')}` }
      : st.kind === 'APPROVED' ? { tone: 'ok' as const, words: 'Approved' }
        : st.kind === 'DRAFT' ? { tone: 'wait' as const, words: 'Draft · awaiting you' }
          : { tone: 'neutral' as const, words: 'Not drawn yet' };
    return { id: c.id, name: c.name, href: charHref(c), src: usable(a) ? displaySrc(a) : undefined, asset: usable(a) ? a : undefined, state };
  });
}

/** Department initials for the handoff mark: "Post-Production" → PP, "Quality Assurance" → QA. */
export const deptMark = (name: string): string => name.split(/[\s-&]+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2).toUpperCase();

const HANDOFF_WORDS: Record<string, string> = { EXPORT: 'Export made and validated', EDIT: 'Cut handed over and validated', QA: 'Every shot passed inspection', PRODUCE: 'Takes handed over', STORYBOARD: 'Storyboard handed over', STORY: 'Story handed over', CAST_AND_WORLD: 'Cast and world handed over' };
export const handoffWords = (stage: string, ok: boolean) => `${HANDOFF_WORDS[stage] ?? `${stageWords(stage)} handed over`}${ok ? '' : ' · not validated'}`.replace(' and validated · not validated', ' · not validated');
