import type { Asset, CutNote, Production, StudioState, Take } from '@/domain/types';
import { productionHref, shotHref, shotLabel } from '@/studio/selectors';
import { cutVersionsOf, type CutVersion } from '@/studio/selectors/cuts';
import { posterOf } from '@/studio/selectors/poster';
import { fileSize } from '@/lib/format';
import { KIND_LABEL, nameLang, parseTime, runtime, shortWhen } from '@/components/home/model';

/** THE SCREENING ROOM'S MODEL (docs/DESIGN-SYSTEM-V5.md §8.12; docs/CONTRACTS-REDESIGN-BACKEND.md B2, B3) — pure
 *  functions over the studio's real state: which productions have a cut to screen, each cut version with its picture,
 *  its English caption track and the shots it was assembled from (from the cut's own provenance), the exports with
 *  their subtitle files, and where a note's timecode falls. Nothing here invents a fact: a missing record stays
 *  missing and the page says so. */

type S = Pick<StudioState, 'productions' | 'assets' | 'shows'>;

const usable = (a: Asset | undefined): a is Asset => Boolean(a && !a.unavailable);
const byId = (s: Pick<StudioState, 'assets'>) => { const m = new Map(s.assets.map((a) => [a.id, a])); return (id?: string | null) => (id ? m.get(id) : undefined); };
export const titleOf = (p: Production) => (p.kind === 'MUSIC_VIDEO' ? p.song?.title || p.title : p.title);
export const screeningHref = (productionId: string, version?: number) => `/screening?p=${encodeURIComponent(productionId)}${version ? `&cut=${version}` : ''}`;

/** "3 Oct, 09:29" in the viewer's clock. */
export const when = shortWhen;

/** "0:51" for a note or a shot mark (never negative). */
export const clock = (t: number) => { const s = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0)); const m = Math.floor(s / 60); return `${m}:${String(s - m * 60).padStart(2, '0')}`; };

// ------------------------------------------------------------------------------------------------- the list view

export interface ScreeningCard {
  id: string;
  href: string;
  title: string;
  lang?: 'ar';
  meta: string;
  /** the poster: key art, else the frame poster (B7), else the cut's own poster frame (16:9, shown in the 2:3 card) */
  poster?: { src: string; asset?: Asset; kind: 'KEY_ART' | 'FRAME_POSTER' | 'CUT_FRAME' };
}

/** Every production with a cut that can be played, the most recently updated first. */
export function screeningList(s: S): ScreeningCard[] {
  const get = byId(s);
  return s.productions
    .filter((p) => usable(get(p.cutAssetId)))
    .sort((a, b) => (parseTime(b.updatedAt)?.getTime() ?? 0) - (parseTime(a.updatedAt)?.getTime() ?? 0))
    .map((p) => {
      const cut = get(p.cutAssetId)!;
      const versions = cutVersionsOf(p, s.assets);
      const cur = versions.find((v) => v.current);
      const post = posterOf(p, s.assets);
      const cutFrame = cut.poster ? s.assets.find((a) => a.src === cut.poster) : undefined;
      const poster = post && usable(post.asset)
        ? { src: post.asset.thumb?.src ?? post.asset.src, asset: post.asset, kind: post.kind }
        : cutFrame && usable(cutFrame) ? { src: cutFrame.thumb?.src ?? cutFrame.src, asset: cutFrame, kind: 'CUT_FRAME' as const }
        : cut.poster ? { src: cut.poster, kind: 'CUT_FRAME' as const } : undefined;
      const title = titleOf(p);
      const show = p.kind === 'EPISODE' ? s.shows.find((x) => x.id === p.showId) : undefined;
      const meta = [show ? `${show.title} · episode ${p.episodeNumber ?? '?'}` : KIND_LABEL[p.kind], runtime(cut.durationSeconds), cur ? `Cut ${cur.version}` : null].filter(Boolean).join(' · ');
      return { id: p.id, href: screeningHref(p.id), title, lang: nameLang(title), meta, poster };
    });
}

// ----------------------------------------------------------------------------------------------- one screening

export interface CaptionTrack { src: string; lang: string; label: string }
export interface SubtitleFile { id: string; src: string; lang: string; language: string; format: string; bytes?: number; filename: string }
export interface TimelineShot {
  shotId: string;
  label: string;
  start: number;
  duration: number;
  /** the take the cut was assembled from, its place among the shot's takes, and a still of it */
  take?: Take;
  takeNumber?: number;
  takeCount: number;
  still?: Asset;
  href: string;
}
export interface CutView {
  version: CutVersion;
  of: number;
  src: string;
  poster?: string;
  width: number;
  height: number;
  duration: number;
  captions: CaptionTrack[];
  subtitleFiles: SubtitleFile[];
  timeline: TimelineShot[];
}
export interface ExportView { id: string; assetId: string; href: string; filename: string; words: string[]; subtitles: string; size: string | null; createdAt: string | null; subtitleFiles: SubtitleFile[] }
export interface Screening {
  production: Production;
  title: string;
  lang?: 'ar';
  href: string;
  kindLabel: string;
  logline: string;
  versions: CutVersion[];
  exports: ExportView[];
}

const LANGUAGE: Record<string, string> = { en: 'English', ar: 'Arabic' };
const language = (code: string) => LANGUAGE[code] ?? code.toUpperCase();
const slug = (t: string) => t.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'film';

function subtitleFilesFor(s: Pick<StudioState, 'assets'>, forAssetId: string, title: string, tag: string): SubtitleFile[] {
  return s.assets
    .filter((a) => a.kind === 'SUBTITLE' && a.provenance?.for === forAssetId && usable(a))
    .map((a) => {
      const lang = String(a.provenance?.lang ?? a.tags.find((t) => t.length === 2) ?? 'xx');
      const format = String(a.provenance?.format ?? (a.tags.includes('vtt') ? 'vtt' : 'srt'));
      return { id: a.id, src: a.src, lang, language: language(lang), format: format.toUpperCase(), bytes: a.bytes, filename: `${slug(title)}-${tag}-${lang}.${format}` };
    })
    .sort((a, b) => (a.lang === 'en' ? -1 : b.lang === 'en' ? 1 : a.lang.localeCompare(b.lang)) || a.format.localeCompare(b.format));
}

interface CutShotProv { shotId?: string; start?: number; duration?: number; takeAssetId?: string }

/** The shots a cut was assembled from, in order, from its provenance (where each starts and how long it runs, and
 *  which take's video it used). A shot the production no longer has keeps its place without a label link. */
export function timelineOf(p: Production, cut: Asset, assets: Asset[]): TimelineShot[] {
  const get = byId({ assets });
  const rows = ((cut.provenance as { shots?: CutShotProv[] } | undefined)?.shots ?? []).filter((r) => r.shotId && Number.isFinite(r.start) && Number.isFinite(r.duration));
  return rows.map((r) => {
    const sh = p.shots.find((x) => x.id === r.shotId);
    const take = sh?.takes.find((t) => t.assetId === r.takeAssetId);
    const still = [get(take?.thumbnailAssetId), get(sh?.openingFrameAssetId)].find((a) => usable(a) && a.kind === 'IMAGE');
    return {
      shotId: r.shotId!, label: sh ? shotLabel(p, sh) : '?', start: r.start!, duration: r.duration!,
      take, takeNumber: take && sh ? sh.takes.indexOf(take) + 1 : undefined, takeCount: sh?.takes.length ?? 0,
      still, href: sh ? shotHref(p, sh.id) : productionHref(p),
    };
  });
}

/** The shot playing at `t` (seconds) in a timeline, or the last one when `t` is the very end. */
export function shotAt(timeline: TimelineShot[], t: number): TimelineShot | undefined {
  return timeline.find((x) => t >= x.start && t < x.start + x.duration) ?? (timeline.length && t >= timeline[timeline.length - 1].start ? timeline[timeline.length - 1] : undefined);
}

/** Everything the room shows for one production, or null when it has nothing to screen. */
export function screeningOf(s: S, productionId: string | null | undefined): Screening | null {
  const p = productionId ? s.productions.find((x) => x.id === productionId) : undefined;
  if (!p) return null;
  const get = byId(s);
  const versions = cutVersionsOf(p, s.assets).filter((v) => usable(v.asset));
  const title = titleOf(p);
  const exports: ExportView[] = (p.exports ?? []).map((e) => ({ e, a: get(e.assetId) })).filter((x): x is { e: typeof x.e; a: Asset } => usable(x.a))
    .sort((x, y) => y.e.createdAt.localeCompare(x.e.createdAt))
    .map(({ e, a }) => {
      const format = e.format.split('-')[0].toUpperCase();
      const res = /^\d+$/.test(e.resolution) ? `${e.resolution}p` : e.resolution;
      const secs = e.durationSeconds ?? a.durationSeconds;
      const subs = e.subtitles && e.subtitles !== 'none' ? `${language(e.subtitles)} subtitles, burned in` : 'No subtitles in the picture';
      return {
        id: e.id, assetId: a.id, href: a.src, filename: `${slug(title)}-${res}.${format.toLowerCase()}`,
        words: [format, res, secs ? `${Math.round(secs)} s` : null].filter((x): x is string => Boolean(x)),
        subtitles: subs, size: e.bytes ?? a.bytes ? fileSize((e.bytes ?? a.bytes)!) : null, createdAt: e.createdAt,
        subtitleFiles: subtitleFilesFor(s, a.id, title, res),
      };
    });
  return { production: p, title, lang: nameLang(title), href: productionHref(p), kindLabel: KIND_LABEL[p.kind], logline: p.logline || '', versions, exports };
}

/** One cut version as the theatre plays it. `version` is 1-based; an unknown number falls back to the current cut. */
export function cutView(s: Pick<StudioState, 'assets'>, sc: Screening, version?: number | null): CutView | null {
  const v = sc.versions.find((x) => x.version === version) ?? sc.versions.find((x) => x.current) ?? sc.versions[sc.versions.length - 1];
  if (!v) return null;
  const subtitleFiles = subtitleFilesFor(s, v.assetId, sc.title, `cut-${v.version}`);
  const captions = subtitleFiles.filter((f) => f.format === 'VTT' && f.lang === 'en').map((f) => ({ src: f.src, lang: f.lang, label: f.language }));
  return {
    version: v, of: sc.versions.length, src: v.asset.src, poster: v.poster,
    width: v.width ?? 1920, height: v.height ?? 1080, duration: v.durationSeconds ?? 0,
    captions, subtitleFiles, timeline: timelineOf(sc.production, v.asset, s.assets as Asset[]),
  };
}

/** The slate under the title: kind · runtime · "Cut 3 of 3" · when it was assembled · the captions it has. */
export function slateOf(sc: Screening, cut: CutView): string[] {
  return [sc.kindLabel, runtime(cut.duration), `Cut ${cut.version.version} of ${cut.of}`, when(cut.version.createdAt), cut.captions.length ? 'English subtitles' : null].filter((x): x is string => Boolean(x));
}

/** A cut's notes: the ones made on it (a note without a cut belongs to the production's current cut). */
export function notesOfCut(notes: CutNote[], cut: CutView): CutNote[] {
  return notes.filter((n) => (n.cutAssetId ? n.cutAssetId === cut.version.assetId : cut.version.current)).sort((a, b) => a.timecode - b.timecode || a.createdAt.localeCompare(b.createdAt));
}
