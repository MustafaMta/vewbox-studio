import type { Asset, Production, StudioState } from '@/domain/types';
import { primaryImageOf } from '@/domain/identity';
import { keyFrameFor, posterOf } from '@/studio/selectors/poster';
import { currentCutVersion, cutVersionsOf } from '@/studio/selectors/cuts';
import { productionHref, shotLabel } from '@/studio/selectors';
import { displaySrc, KIND_LABEL, LANGUAGE_LABEL, nameLang, parseTime, plural, runtime, stageWords, STYLE_LABEL } from '@/components/home/model';

/** THE FILM PAGES' READING OF THE STUDIO (docs/DESIGN-SYSTEM-V5.md §8.4–8.5 under docs/design/VISUAL-STANDARD-V5.1.md)
 *  — pure, so every word and number the Shorts catalogue and a Short's title page show comes from real records and can
 *  be tested: the poster (key art, else the composed frame poster), the runtime (from the cut), the cut with its
 *  caption tracks, the shots of the cut in order with their scene, the exports with their subtitle files, the cast with
 *  the lines each speaks, the locations, and the credits (the departments that handed work over, each with what it
 *  made). A fact that is not in the records is left out, never estimated. */

type S = Pick<StudioState, 'productions' | 'characters' | 'locations' | 'assets'>;

const usable = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.unavailable && !a.sample);
const byId = (s: Pick<S, 'assets'>) => { const m = new Map(s.assets.map((a) => [a.id, a])); return (id?: string | null) => (id ? m.get(id) : undefined); };
const updated = (p: Production) => parseTime(p.updatedAt)?.getTime() ?? 0;

/** The production workspace (owned by the Production package): `/shorts/<id>/production?tab=<tab>`. */
export type ProductionTab = 'overview' | 'story' | 'characters' | 'locations' | 'storyboard' | 'produce' | 'final';
export const productionTabHref = (p: Pick<Production, 'id' | 'kind' | 'showId' | 'seasonId'>, tab?: ProductionTab) =>
  `${productionHref(p as Production)}/production${tab ? `?tab=${tab}` : ''}`;
export const screeningHref = (p: Pick<Production, 'id'>) => `/screening?p=${encodeURIComponent(p.id)}`;
/** The two ways to start a short (the split button's halves). */
export const NEW_SHORT = { auto: '/new/short?mode=auto', manual: '/new/short?mode=manual' } as const;

/** "Finished" once the film is complete with a cut; else the stage it is in. */
export function statusOf(p: Production, hasCut: boolean): { words: string; tone: 'ok' | 'neutral' } {
  return p.stage === 'COMPLETE' && hasCut ? { words: 'Finished', tone: 'ok' } : { words: stageWords(p.stage), tone: 'neutral' };
}

// ------------------------------------------------------------------------------------------------- the catalogue

export interface PosterCard {
  id: string;
  href: string;
  title: string;
  lang?: 'ar';
  /** the poster picture (key art, else the composed frame poster) */
  asset?: Asset;
  src?: string;
  posterKind?: 'KEY_ART' | 'FRAME_POSTER';
  /** runtime from the cut ("0:56"), null without a cut */
  runtime: string | null;
  status: { words: string; tone: 'ok' | 'neutral' };
  /** "0:56 · Finished" */
  meta: string;
  /** a finished film opens in the Screening Room in one click */
  screenHref?: string;
}

/** Every short, newest first, as a 2:3 poster card. */
export function shortsCatalogue(s: S): PosterCard[] {
  const get = byId(s);
  return s.productions.filter((p) => p.kind === 'SHORT').sort((a, b) => updated(b) - updated(a)).map((p) => {
    const poster = posterOf(p, s.assets);
    const pic = poster && usable(poster.asset) ? poster.asset : undefined;
    const cut = get(p.cutAssetId);
    const rt = runtime(cut?.durationSeconds);
    const status = statusOf(p, Boolean(cut));
    return {
      id: p.id, href: productionHref(p), title: p.title, lang: nameLang(p.title), asset: pic, src: displaySrc(pic), posterKind: pic ? poster!.kind : undefined,
      runtime: rt, status, meta: [rt, status.words].filter(Boolean).join(' · '), screenHref: cut && !cut.unavailable ? screeningHref(p) : undefined,
    };
  });
}

// ------------------------------------------------------------------------------------------------- the film page

export interface StripShot {
  id: string;
  /** "2.4" */
  label: string;
  sceneId: string;
  /** seconds into the cut where the shot starts, and how long it runs there */
  start: number;
  duration: number;
  asset?: Asset;
  src?: string;
}
export interface StripScene { id: string; number: number; title: string; start: number; duration: number; shots: number }
export interface CaptionFile { src: string; lang: string; label: string }
export interface DownloadFile { id: string; href: string; label: string; detail: string }
export interface ExportItem { id: string; title: string; detail: string; href?: string; subtitles: DownloadFile[] }
export interface CastCard { id: string; name: string; lang?: 'ar'; href: string; asset?: Asset; src?: string; line: string }
export interface PlateCard { id: string; name: string; lang?: 'ar'; href: string; asset?: Asset; src?: string; line: string }
export interface Fact { label: string; value: string; sub?: string | undefined }

export interface FilmPage {
  p: Production;
  title: string;
  lang?: 'ar';
  /** a title longer than 28 characters steps down one role (§4.3) */
  long: boolean;
  status: { words: string; tone: 'ok' | 'neutral' };
  slate: string[];
  logline: string;
  synopsis: string;
  poster?: { asset: Asset; src: string; kind: 'KEY_ART' | 'FRAME_POSTER'; label: string };
  cut?: { asset: Asset; src: string; poster?: string; duration: number; width?: number; height?: number; version: string | null; captions: CaptionFile[] };
  /** without a cut: the key frame of the film (a still, never presented as the cut) */
  still?: { asset: Asset; src: string; label: string };
  strip: StripShot[];
  scenes: StripScene[];
  exports: ExportItem[];
  facts: Fact[];
  cast: CastCard[];
  places: PlateCard[];
  primary: { label: string; href: string; play: boolean };
  secondary: { label: string; href: string };
}

const LANG_WORD: Record<string, string> = { en: 'English', ar: 'Arabic', both: 'Arabic and English' };
const langWord = (code: string | undefined) => (code ? LANG_WORD[code.toLowerCase()] ?? code.toUpperCase() : '');
const FORMAT: Record<string, string> = { 'mp4-h264': 'MP4 · H.264', 'mp4-h265': 'MP4 · H.265', 'mov-prores': 'MOV · ProRes' };
const download = (a: Asset) => `${a.src}${a.src.includes('?') ? '&' : '?'}download=1`;
/** "56.3 MB" */
export function megabytes(bytes: number | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

interface CutShotRecord { shotId?: string; start?: number; duration?: number }
interface SubtitleProvenance { for?: string; lang?: string; format?: string }

/** The subtitle sidecars written for a video (SUBTITLE assets whose provenance names it), language then format. */
function subtitlesFor(s: Pick<S, 'assets'>, videoId: string) {
  return s.assets.filter((a) => a.kind === 'SUBTITLE' && !a.unavailable && (a.provenance as SubtitleProvenance | undefined)?.for === videoId)
    .map((a) => ({ a, pv: a.provenance as SubtitleProvenance }))
    .sort((x, y) => (x.pv.lang ?? '').localeCompare(y.pv.lang ?? '') || (x.pv.format ?? '').localeCompare(y.pv.format ?? ''));
}

/** The shots of the film in the order the cut plays them: the cut's own record of where each shot starts (ASSEMBLE
 *  writes it) when there is one, else the storyboard order with the planned durations. */
export function stripOf(p: Production, s: Pick<S, 'assets'>, cut?: Asset): { strip: StripShot[]; scenes: StripScene[] } {
  const get = byId(s);
  const sceneNo = new Map(p.scenes.map((sc) => [sc.id, sc.number]));
  const ordered = p.shots.map((sh, i) => ({ sh, i })).sort((a, b) => (sceneNo.get(a.sh.sceneId) ?? 0) - (sceneNo.get(b.sh.sceneId) ?? 0) || a.sh.number - b.sh.number || a.i - b.i).map((x) => x.sh);
  const recorded = ((cut?.provenance as { shots?: CutShotRecord[] } | undefined)?.shots ?? []).filter((r) => r.shotId && typeof r.start === 'number' && typeof r.duration === 'number');
  const fromCut = recorded.length > 0 && recorded.every((r) => p.shots.some((sh) => sh.id === r.shotId));
  let t = 0;
  const timed = fromCut
    ? recorded.map((r) => ({ sh: p.shots.find((x) => x.id === r.shotId)!, start: r.start!, duration: r.duration! }))
    : ordered.map((sh) => { const x = { sh, start: t, duration: sh.durationSeconds }; t += sh.durationSeconds; return x; });
  const strip: StripShot[] = timed.map(({ sh, start, duration }) => {
    const take = sh.takes.find((x) => x.id === sh.selectedTakeId);
    const pic = [get(take?.thumbnailAssetId), get(sh.openingFrameAssetId)].find(usable);
    return { id: sh.id, label: shotLabel(p, sh), sceneId: sh.sceneId, start, duration, asset: pic, src: displaySrc(pic) };
  });
  const scenes: StripScene[] = [];
  for (const x of strip) {
    const last = scenes[scenes.length - 1];
    if (last && last.id === x.sceneId) { last.duration = x.start + x.duration - last.start; last.shots += 1; continue; }
    const sc = p.scenes.find((y) => y.id === x.sceneId);
    scenes.push({ id: x.sceneId, number: sc?.number ?? scenes.length + 1, title: sc?.title ?? '', start: x.start, duration: x.duration, shots: 1 });
  }
  return { strip, scenes };
}

/** Everything a Short's title page shows. */
export function filmPage(p: Production, s: S): FilmPage {
  const get = byId(s);
  const cutAsset = get(p.cutAssetId);
  const cut = cutAsset && cutAsset.kind === 'VIDEO' && !cutAsset.unavailable ? cutAsset : undefined;
  const status = statusOf(p, Boolean(cut));
  const year = parseTime(p.createdAt)?.getFullYear();
  const rt = runtime(cut?.durationSeconds);

  // the poster: key art, else the composed frame poster (named after the shot it was cut from)
  const post = posterOf(p, s.assets);
  const fp = post?.asset.provenance as { sceneNumber?: number; shotNumber?: number } | undefined;
  const poster = post && usable(post.asset)
    ? { asset: post.asset, src: displaySrc(post.asset)!, kind: post.kind, label: post.kind === 'KEY_ART' ? 'Key art' : fp?.sceneNumber && fp?.shotNumber ? `Frame poster · shot ${fp.sceneNumber}.${fp.shotNumber}` : 'Frame poster' }
    : undefined;

  const version = cut ? currentCutVersion(p, s.assets) : null;
  const captions: CaptionFile[] = cut ? subtitlesFor(s, cut.id).filter((x) => x.pv.format === 'vtt').map((x) => ({ src: x.a.src, lang: x.pv.lang ?? 'en', label: langWord(x.pv.lang) || 'Subtitles' })) : [];
  // English first: the film's own language leads
  captions.sort((a, b) => (a.lang === p.language.toLowerCase() ? -1 : b.lang === p.language.toLowerCase() ? 1 : 0));

  // no cut: the key frame stands in, labelled as a still
  const kf = cut ? null : keyFrameFor(p, s.assets);
  const kfImage = get(kf?.imageAssetId);
  const still = !cut && usable(kfImage) ? { asset: kfImage, src: displaySrc(kfImage)!, label: kf ? `A still from shot ${kf.sceneNumber ?? '?'}.${kf.shotNumber}` : 'A still' } : undefined;

  const { strip, scenes } = stripOf(p, s, cut);

  // the exports, newest first, each with its subtitle files
  const exports: ExportItem[] = [...(p.exports ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((ex) => {
    const a = get(ex.assetId);
    const ok = a && !a.unavailable ? a : undefined;
    const subs = langWord(ex.subtitles === 'none' ? undefined : ex.subtitles);
    const detail = [FORMAT[ex.format] ?? ex.format.toUpperCase(), runtime(ex.durationSeconds ?? a?.durationSeconds), megabytes(ex.bytes ?? a?.bytes), subs ? `${subs} subtitles` : null].filter(Boolean).join(' · ');
    const files = ok ? subtitlesFor(s, ok.id).map(({ a: f, pv }) => ({ id: f.id, href: download(f), label: `${langWord(pv.lang) || 'Subtitles'} subtitles`, detail: [(pv.format ?? '').toUpperCase(), megabytes(f.bytes)].filter(Boolean).join(' · ') })) : [];
    return { id: ex.id, title: `${/^\d+$/.test(ex.resolution) ? `${ex.resolution}p` : ex.resolution} film`, detail, href: ok ? download(ok) : undefined, subtitles: files };
  });

  // the facts beside the synopsis
  const takes = p.shots.reduce((n, sh) => n + sh.takes.length, 0);
  const lines = p.shots.reduce((n, sh) => n + sh.dialogue.length, 0);
  const probe = (cut?.provenance as { probe?: { fps?: number } } | undefined)?.probe;
  const facts: Fact[] = ([
    rt ? { label: 'Runtime', value: rt, sub: p.targetSeconds ? `Written for ${runtime(p.targetSeconds)}` : undefined } : null,
    p.scenes.length ? { label: 'Scenes', value: String(p.scenes.length), sub: p.scenes.map((sc) => sc.title).filter(Boolean).join(' · ') || undefined } : null,
    p.shots.length ? { label: 'Shots', value: String(p.shots.length), sub: takes ? `${takes} ${plural(takes, 'take')} filmed` : undefined } : null,
    lines ? { label: 'Dialogue', value: `${lines} ${plural(lines, 'line')}`, sub: LANGUAGE_LABEL[p.language] } : null,
    cut?.width && cut.height ? { label: 'Picture', value: `${cut.width}×${cut.height}`, sub: probe?.fps ? `${probe.fps} fps` : undefined } : null,
    version ? { label: 'Cut', value: `Cut ${version.version}`, sub: version.of > 1 ? `of ${version.of} assembled` : 'the first assembly' } : null,
  ] as Array<Fact | null>).filter((x): x is Fact => Boolean(x));

  // the cast, with the lines each one speaks in the film
  const said = new Map<string, number>();
  for (const sh of p.shots) for (const d of sh.dialogue) said.set(d.characterId, (said.get(d.characterId) ?? 0) + 1);
  const castIds = [...new Set([...p.castIds, ...p.scenes.flatMap((sc) => sc.characterIds)])];
  const cast: CastCard[] = castIds.map((id) => s.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c)).map((c) => {
    const a = get(primaryImageOf(c));
    const n = said.get(c.id) ?? 0;
    return { id: c.id, name: c.name, lang: nameLang(c.name), href: `/characters/${encodeURIComponent(c.id)}`, asset: usable(a) ? a : undefined, src: usable(a) ? displaySrc(a) : undefined, line: n ? `${n} ${plural(n, 'line')}` : 'No lines' };
  });
  const placeIds = [...new Set([...p.locationIds, ...p.scenes.map((sc) => sc.locationId).filter((x): x is string => Boolean(x))])];
  const places: PlateCard[] = placeIds.map((id) => s.locations.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => {
    const a = get(l.masterAssetId);
    const inScenes = p.scenes.filter((sc) => sc.locationId === l.id).map((sc) => sc.number).sort((a, b) => a - b);
    const kind = l.kind === 'INTERIOR' ? 'Interior' : l.kind === 'EXTERIOR' ? 'Exterior' : 'Location';
    return { id: l.id, name: l.name, lang: nameLang(l.name), href: `/locations/${encodeURIComponent(l.id)}`, asset: usable(a) ? a : undefined, src: usable(a) ? displaySrc(a) : undefined, line: [kind, inScenes.length ? `${plural(inScenes.length, 'Scene', 'Scenes')} ${inScenes.join(' and ')}` : null].filter(Boolean).join(' · ') };
  });

  const stage = stageWords(p.stage);
  return {
    p, title: p.title, lang: nameLang(p.title), long: p.title.length > 28, status,
    slate: [KIND_LABEL[p.kind], year ? String(year) : null, rt, STYLE_LABEL[p.style] ?? null, p.genre || null, LANGUAGE_LABEL[p.language] ?? null].filter((x): x is string => Boolean(x)),
    logline: p.logline || '', synopsis: p.synopsis || '',
    poster, cut: cut ? { asset: cut, src: cut.src, poster: cut.poster, duration: cut.durationSeconds ?? 0, width: cut.width, height: cut.height, version: version ? `Cut ${version.version}` : null, captions } : undefined,
    still, strip, scenes, exports, facts, cast, places,
    primary: cut ? { label: 'Screen it', href: screeningHref(p), play: true } : { label: `Continue: ${stage.charAt(0).toLowerCase()}${stage.slice(1)}`, href: productionTabHref(p, tabForStage(p.stage)), play: false },
    secondary: { label: 'Open production', href: productionTabHref(p) },
  };
}

/** The workspace tab where a stage's work happens. */
export function tabForStage(stage: Production['stage']): ProductionTab {
  switch (stage) {
    case 'STORY': return 'story';
    case 'CAST_AND_WORLD': return 'characters';
    case 'STORYBOARD': return 'storyboard';
    case 'PRODUCE': return 'produce';
    default: return 'final';
  }
}

// ---------------------------------------------------------------------------------------------------- the credits

export interface PipelineRecord {
  handoffs: Array<{ stage: string; producerDepartment: string; createdAt: string }>;
  runs: Array<{ departmentId: string; outcome: string | null; jobType: string }>;
  qa?: Array<{ decision?: string }>;
}
export interface Credit { department: string; role: string; name: string; made: string; href: string }

/** The order and the role of each department in a film's credits. */
const ROLES: Array<{ id: string; role: string }> = [
  { id: 'STORY', role: 'Written by' }, { id: 'CASTING', role: 'Cast by' }, { id: 'WORLD', role: 'Designed by' },
  { id: 'PREPRODUCTION', role: 'Storyboard by' }, { id: 'VIDEO', role: 'Filmed by' }, { id: 'SOUND', role: 'Sound by' },
  { id: 'POST', role: 'Cut by' }, { id: 'QA', role: 'Inspected by' }, { id: 'EXECUTIVE', role: 'Supervised by' },
];

const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The departments that worked on the film — those that handed work over or finished a task for it — each with what
 *  it made, read from the film's own records (the script, the cast, the frames, the takes, the cut, the inspections). */
export function creditsOf(p: Production, s: S, rec: PipelineRecord, departments: Array<{ id: string; name: string }>): Credit[] {
  const worked = new Set([...rec.handoffs.map((h) => h.producerDepartment), ...rec.runs.filter((r) => r.outcome === 'COMPLETED').map((r) => r.departmentId)]);
  const get = byId(s);
  const lines = p.shots.reduce((n, sh) => n + sh.dialogue.length, 0);
  const framed = p.shots.filter((sh) => sh.openingFrameAssetId).length;
  const takes = p.shots.reduce((n, sh) => n + sh.takes.length, 0);
  const cast = [...new Set([...p.castIds, ...p.scenes.flatMap((sc) => sc.characterIds)])].map((id) => s.characters.find((c) => c.id === id)?.name).filter((x): x is string => Boolean(x));
  const places = [...new Set([...p.locationIds, ...p.scenes.map((sc) => sc.locationId).filter(Boolean)])].map((id) => s.locations.find((l) => l.id === id)?.name).filter((x): x is string => Boolean(x));
  const cuts = cutVersionsOf(p, s.assets).length;
  const cut = get(p.cutAssetId);
  const loud = (cut?.provenance as { loudness?: { integrated?: number } } | undefined)?.loudness?.integrated;
  const exported = [...new Set((p.exports ?? []).map((e) => (/^\d+$/.test(e.resolution) ? `${e.resolution}p` : e.resolution)))];
  const inspections = rec.qa?.length ?? rec.runs.filter((r) => r.departmentId === 'QA' && r.outcome === 'COMPLETED').length;
  const tasks = (id: string) => rec.runs.filter((r) => r.departmentId === id && r.outcome === 'COMPLETED').length;
  const made: Record<string, string> = {
    STORY: [p.scenes.length ? `${p.scenes.length} ${plural(p.scenes.length, 'scene')}` : null, lines ? `${lines} ${plural(lines, 'line')} of dialogue` : null].filter(Boolean).join(' · ') || 'The story',
    CASTING: cast.length ? joinAnd(cast) : 'The cast',
    WORLD: places.length ? joinAnd(places) : 'The world',
    PREPRODUCTION: p.shots.length ? `${p.shots.length} ${plural(p.shots.length, 'shot')} planned · ${framed} opening ${plural(framed, 'frame')}` : 'The shot plan',
    VIDEO: takes ? `${takes} ${plural(takes, 'take')} for ${p.shots.length} ${plural(p.shots.length, 'shot')}` : 'The takes',
    SOUND: typeof loud === 'number' ? `Mixed to ${loud.toFixed(1)} LUFS` : lines ? `${lines} ${plural(lines, 'line')} voiced` : 'The sound',
    POST: [cuts ? `${cuts} ${plural(cuts, 'cut')}` : null, exported.length ? `exported ${exported.join(' and ')}` : null].filter(Boolean).join(' · ') || 'The cut',
    QA: inspections ? `${inspections} ${plural(inspections, 'inspection')}` : 'The checks',
  };
  return ROLES.filter((r) => worked.has(r.id)).map((r) => {
    const n = tasks(r.id);
    return { department: r.id, role: r.role, name: departments.find((d) => d.id === r.id)?.name ?? r.id, made: made[r.id] ?? `${n} ${plural(n, 'task')}`, href: `/studio/departments/${encodeURIComponent(r.id)}` };
  });
}
