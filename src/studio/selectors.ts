import type { Asset, Brief, Character, Location, Production, Season, Show, Shot, StudioState } from '@/domain/types';
import type { Stage } from '@/domain/vocabulary';
import { primaryImageOf } from '@/domain/identity';

/** READING THE STUDIO — small pure helpers over the state, so pages ask questions in one line. */

/** An asset as the page can show it. `unavailable` marks a record whose file the server could not find. */
export type AssetView = Asset & { unavailable: boolean };
export function assetById(s: StudioState, id: string | undefined | null): AssetView | undefined {
  const a = id ? s.assets.find((x) => x.id === id) : undefined;
  if (!a) return undefined;
  return { ...a, unavailable: Boolean(a.unavailable) };
}
export const assetSrc = (s: StudioState, id: string | undefined | null): string | undefined => assetById(s, id)?.src || undefined;

/** A character's primary image (the canonical front full-body image; else the legacy portrait; else none) and its
 *  approval state: see src/domain/identity.ts. `primaryImageSrc` is the one-liner for a card, a picker or a hero. */
export { primaryImageOf } from '@/domain/identity';
export const primaryImageSrc = (s: StudioState, c: Pick<Character, 'canonicalImage' | 'portraitAssetId'>): string | undefined => assetSrc(s, primaryImageOf(c));
export const locationById = (s: StudioState, id: string | undefined | null): Location | undefined => (id ? s.locations.find((l) => l.id === id) : undefined);
export const showById = (s: StudioState, id: string | undefined | null): Show | undefined => (id ? s.shows.find((x) => x.id === id) : undefined);
export const seasonById = (s: StudioState, id: string | undefined | null): Season | undefined => (id ? s.seasons.find((x) => x.id === id) : undefined);

export const shorts = (s: StudioState): Production[] => s.productions.filter((p) => p.kind === 'SHORT');
export const musicVideos = (s: StudioState): Production[] => s.productions.filter((p) => p.kind === 'MUSIC_VIDEO');

/** How a production's brief began, as a phrase key: a proposal the story engine wrote (AUTO_IDEA), the written
 *  example the wizard offers instead (`fromSampleProposal`), or by hand. Only the written example says "example". */
export const briefOriginKey = (b: Pick<Brief, 'mode' | 'fromSampleProposal'>): 'story.autoIdea' | 'story.autoIdea.example' | 'story.manual' =>
  b.mode === 'AUTO_IDEA' ? (b.fromSampleProposal ? 'story.autoIdea.example' : 'story.autoIdea') : 'story.manual';

/** Where a production lives in the URL. */
export function productionHref(p: Production): string {
  if (p.kind === 'SHORT') return `/shorts/${p.id}`;
  if (p.kind === 'MUSIC_VIDEO') return `/music-videos/${p.id}`;
  return `/shows/${p.showId}/seasons/${p.seasonId}/episodes/${p.id}`;
}
export const shotHref = (p: Production, shotId: string) => `${productionHref(p)}/shots/${shotId}`;

/** The cast a production can draw on: its own choices plus everything its show has. */
export function castOf(s: StudioState, p: Production): Character[] {
  const show = showById(s, p.showId);
  const ids = new Set([...(show?.castIds ?? []), ...p.castIds]);
  return s.characters.filter((c) => ids.has(c.id));
}
export function worldOf(s: StudioState, p: Production): Location[] {
  const show = showById(s, p.showId);
  const ids = new Set([...(show?.locationIds ?? []), ...p.locationIds]);
  return s.locations.filter((l) => ids.has(l.id));
}

export const shotLabel = (p: Production, sh: Shot): string => {
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  return `${scene?.number ?? '?'}.${sh.number}`;
};

export const readyTakes = (sh: Shot) => sh.takes.filter((t) => t.status !== 'REJECTED');
/** A shot still needs a real take when nothing is chosen, or the chosen take is only a bundled sample clip. */
export const needsTake = (sh: Shot) => { const t = sh.takes.find((x) => x.id === sh.selectedTakeId); return !t || t.provider === 'SAMPLE'; };
/** A shot whose chosen take is a stale continuation (its predecessor's choice changed): it has a take, but the
 *  cut's join into it is no longer the one it was generated for (src/domain/continuation.ts). */
export { continuationStale, staleContinuations } from '@/domain/continuation';

/** How far along a production is, counted from what it has rather than from a flag. */
export function progressOf(p: Production) {
  const shots = p.shots.length;
  const framed = p.shots.filter((sh) => sh.openingFrameAssetId).length;
  const withTake = p.shots.filter((sh) => readyTakes(sh).length > 0).length;
  const chosen = p.shots.filter((sh) => sh.selectedTakeId).length;
  const runtime = p.shots.reduce((a, sh) => a + sh.durationSeconds, 0);
  const lines = p.scenes.reduce((a, sc) => a + sc.beats.reduce((b, bt) => b + bt.lines.length, 0), 0);
  const voiced = p.shots.reduce((a, sh) => a + sh.dialogue.filter((d) => d.audioAssetId).length, 0);
  const dialogue = p.shots.reduce((a, sh) => a + sh.dialogue.length, 0);
  return { scenes: p.scenes.length, shots, framed, withTake, chosen, runtime, lines, voiced, dialogue, hasScript: p.scenes.some((sc) => sc.beats.length > 0), hasSynopsis: Boolean(p.synopsis.trim()), hasCut: Boolean(p.cutAssetId), exports: p.exports?.length ?? 0 };
}

export const STAGE_ORDER: Stage[] = ['STORY', 'CAST_AND_WORLD', 'STORYBOARD', 'PRODUCE', 'FINAL_CUT', 'COMPLETE'];
export const stageIndex = (st: Stage) => STAGE_ORDER.indexOf(st);

/** What the producer should do next on a production, as a tab and a phrase key. */
export function nextStep(p: Production): { tab: 'story' | 'cast' | 'storyboard' | 'produce' | 'final'; key: string } {
  const pr = progressOf(p);
  if (!pr.hasSynopsis) return { tab: 'story', key: 'next.writeStory' };
  if (p.castIds.length === 0 && p.kind !== 'EPISODE') return { tab: 'cast', key: 'next.chooseCast' };
  if (pr.scenes === 0 || !pr.hasScript) return { tab: 'story', key: 'next.writeScript' };
  if (pr.shots === 0) return { tab: 'storyboard', key: 'next.planShots' };
  if (pr.chosen < pr.shots) return { tab: 'produce', key: 'next.chooseTakes' };
  if (!pr.hasCut) return { tab: 'final', key: 'next.assemble' };
  return { tab: 'final', key: 'next.reviewCut' };
}

/** Where a character is cast without (yet) being in a video: shows and productions whose cast includes them. */
export function assignmentsOf(s: StudioState, characterId: string): { shows: Show[]; productions: Production[] } {
  const shows = s.shows.filter((x) => x.castIds.includes(characterId));
  const productions = s.productions.filter((p) => p.castIds.includes(characterId) || p.scenes.some((sc) => sc.characterIds.includes(characterId)) || p.shots.some((sh) => sh.characterIds.includes(characterId)) || shows.some((x) => x.id === p.showId));
  return { shows, productions };
}

export function search<T extends { title?: string; titleAr?: string; name?: string; nameAr?: string; logline?: string; role?: string; description?: string }>(items: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((x) => [x.title, x.titleAr, x.name, x.nameAr, x.logline, x.role, x.description].some((v) => v?.toLowerCase().includes(needle)));
}
