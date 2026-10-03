import { describe, expect, it } from 'vitest';
import type { Asset, Character, Location, Production, Scene, Shot, StudioState } from '@/domain/types';
import { creditsOf, filmPage, megabytes, NEW_SHORT, productionTabHref, screeningHref, shortsCatalogue, stripOf } from '@/components/film/model';

/** The film pages' reading of the studio (src/components/film/model.ts; docs/DESIGN-SYSTEM-V5.md §8.4–8.5): posters
 *  come from key art, else the frame poster; runtime only from the cut; the strip follows the cut's own record; every
 *  download, caption track, cast line and credit comes from a record; "work on it" links go to the workspace. */

const T = '2026-10-03T09:00:00.000Z';
const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', width: 640, height: 360, createdAt: T, ...extra });
const shot = (id: string, sceneId: string, number: number, seconds: number, extra: Partial<Shot> = {}): Shot => ({
  id, sceneId, number, purpose: '', action: '', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: seconds, characterIds: [], dialogue: [], transition: 'CUT',
  takes: [{ id: `take-${id}`, label: 'Take 1', assetId: `vid-${id}`, createdAt: T, status: 'READY', provider: 'MINIMAX', thumbnailAssetId: `th-${id}` }], selectedTakeId: `take-${id}`, ...extra,
} as Shot);
const scene = (id: string, number: number, title: string): Scene => ({ id, number, title, locationId: 'loc-1', timeOfDay: 'NIGHT', characterIds: ['char-a', 'char-b'], beats: [] } as unknown as Scene);

function studio(over: Partial<Production> = {}): Pick<StudioState, 'productions' | 'characters' | 'locations' | 'assets'> {
  const p: Production = {
    id: 'short-1', kind: 'SHORT', title: 'The Static Sky', logline: 'Two men repair a radio.', synopsis: 'A longer story.', style: 'CARTOON', language: 'EN', aspect: 'WIDE_16_9',
    targetSeconds: 60, stage: 'COMPLETE', brief: { mode: 'MANUAL', text: '' }, castIds: ['char-a', 'char-b'], locationIds: ['loc-1'], genre: 'Sci-Fi Drama',
    scenes: [scene('sc-2', 2, 'Static Echoes'), scene('sc-1', 1, 'The Broken Signal')],
    shots: [
      shot('s21', 'sc-2', 1, 6, { dialogue: [{ id: 'd1', characterId: 'char-b', text: 'It vanished.' }] }),
      shot('s11', 'sc-1', 1, 8, { dialogue: [{ id: 'd2', characterId: 'char-a', text: 'Static.' }, { id: 'd3', characterId: 'char-a', text: 'Again.' }] }),
      shot('s12', 'sc-1', 2, 6),
    ],
    cutAssetId: 'cut-1', framePosterAssetId: 'fp-1',
    exports: [{ id: 'ex-1', assetId: 'exp-1', format: 'mp4-h264', resolution: '1080', subtitles: 'en', createdAt: T, durationSeconds: 20, bytes: 59052444 }],
    createdAt: '2026-10-03 06:38:18.483+00', updatedAt: '2026-10-03 21:04:11.181+00', ...over,
  } as Production;
  const assets: Asset[] = [
    asset('fp-1', { width: 512, height: 768, provenance: { kind: 'FRAME_POSTER', sceneNumber: 2, shotNumber: 1 } }),
    asset('cut-1', { kind: 'VIDEO', width: 1920, height: 1080, durationSeconds: 20, poster: '/api/media/still', tags: ['cut'], origin: 'DERIVED', provenance: { probe: { fps: 24 }, loudness: { integrated: -22.92 }, shots: [{ shotId: 's11', start: 0, duration: 8 }, { shotId: 's12', start: 8, duration: 6 }, { shotId: 's21', start: 14, duration: 6 }] } }),
    asset('exp-1', { kind: 'VIDEO', durationSeconds: 20, bytes: 59052444, tags: ['export'], origin: 'DERIVED' }),
    asset('sub-en-vtt', { kind: 'SUBTITLE', bytes: 391, provenance: { for: 'cut-1', lang: 'en', format: 'vtt' } }),
    asset('sub-ar-vtt', { kind: 'SUBTITLE', bytes: 413, provenance: { for: 'cut-1', lang: 'ar', format: 'vtt' } }),
    asset('sub-ar-srt', { kind: 'SUBTITLE', bytes: 413, provenance: { for: 'cut-1', lang: 'ar', format: 'srt' } }),
    asset('exsub-en-srt', { kind: 'SUBTITLE', bytes: 400, provenance: { for: 'exp-1', lang: 'en', format: 'srt' } }),
    asset('exsub-en-vtt', { kind: 'SUBTITLE', bytes: 391, provenance: { for: 'exp-1', lang: 'en', format: 'vtt' } }),
    ...['s11', 's12', 's21'].map((id) => asset(`th-${id}`)),
    asset('fig-a', { width: 928, height: 1664 }), asset('plate-1', { width: 1344, height: 768 }),
  ];
  const characters = [
    { id: 'char-a', name: 'Elias Moore', canonicalImage: { assetId: 'fig-a', status: 'APPROVED', version: 1, generatedAt: T } },
    { id: 'char-b', name: 'نجم' },
  ] as unknown as Character[];
  const locations = [{ id: 'loc-1', name: 'Elias’s Workshop', kind: 'INTERIOR', masterAssetId: 'plate-1' }] as unknown as Location[];
  return { productions: [p], characters, locations, assets };
}

describe('the catalogue', () => {
  it('a finished short: the frame poster, runtime from the cut, "Finished", and one click to the Screening Room', () => {
    const [c] = shortsCatalogue(studio());
    expect(c.href).toBe('/shorts/short-1');
    expect(c.posterKind).toBe('FRAME_POSTER');
    expect(c.src).toBe('/api/media/fp-1');
    expect(c.meta).toBe('0:20 · Finished');
    expect(c.screenHref).toBe('/screening?p=short-1');
  });
  it('key art wins over the frame poster; no cut means no runtime and no screening', () => {
    const s = studio({ posterAssetId: 'key-1', cutAssetId: undefined, stage: 'PRODUCE' });
    s.assets.push(asset('key-1', { width: 800, height: 1200 }));
    const [c] = shortsCatalogue(s);
    expect(c.posterKind).toBe('KEY_ART');
    expect(c.runtime).toBeNull();
    expect(c.meta).toBe('Filming');
    expect(c.screenHref).toBeUndefined();
  });
  it('only shorts, newest first; the start links carry the mode', () => {
    const s = studio();
    s.productions.push({ ...s.productions[0], id: 'mv-1', kind: 'MUSIC_VIDEO' }, { ...s.productions[0], id: 'short-0', updatedAt: '2026-10-01 10:00:00+00' });
    expect(shortsCatalogue(s).map((c) => c.id)).toEqual(['short-1', 'short-0']);
    expect(NEW_SHORT).toEqual({ auto: '/new/short?mode=auto', manual: '/new/short?mode=manual' });
  });
});

describe('the film page', () => {
  const s = studio();
  const f = filmPage(s.productions[0], s);
  it('the head: badge, slate, links to the Screening Room and the workspace', () => {
    expect(f.status).toEqual({ words: 'Finished', tone: 'ok' });
    expect(f.slate).toEqual(['Short film', '2026', '0:20', 'Cartoon', 'Sci-Fi Drama', 'English']);
    expect(f.primary).toEqual({ label: 'Screen it', href: screeningHref(s.productions[0]), play: true });
    expect(f.secondary.href).toBe('/shorts/short-1/production');
    expect(productionTabHref(s.productions[0], 'story')).toBe('/shorts/short-1/production?tab=story');
  });
  it('the poster is named after the shot it was cut from; the player gets the cut and its VTT captions, the film language first', () => {
    expect(f.poster?.label).toBe('Frame poster · shot 2.1');
    expect(f.cut?.src).toBe('/api/media/cut-1');
    expect(f.cut?.captions.map((c) => c.label)).toEqual(['English', 'Arabic']);
  });
  it('the strip follows the cut’s record, grouped by scene', () => {
    expect(f.strip.map((x) => [x.label, x.start, x.duration])).toEqual([['1.1', 0, 8], ['1.2', 8, 6], ['2.1', 14, 6]]);
    expect(f.scenes.map((x) => [x.number, x.title, x.start, x.duration, x.shots])).toEqual([[1, 'The Broken Signal', 0, 14, 2], [2, 'Static Echoes', 14, 6, 1]]);
  });
  it('without a cut record the strip is the storyboard order with planned durations', () => {
    const { strip } = stripOf(s.productions[0], { assets: s.assets.filter((a) => a.id !== 'cut-1') });
    expect(strip.map((x) => [x.label, x.start])).toEqual([['1.1', 0], ['1.2', 8], ['2.1', 14]]);
  });
  it('downloads: the export with its subtitle files', () => {
    expect(f.exports).toHaveLength(1);
    expect(f.exports[0].title).toBe('1080p film');
    expect(f.exports[0].detail).toBe('MP4 · H.264 · 0:20 · 56.3 MB · English subtitles');
    expect(f.exports[0].href).toBe('/api/media/exp-1?download=1');
    expect(f.exports[0].subtitles.map((x) => x.detail)).toEqual(['SRT · 1 KB', 'VTT · 1 KB']);
    expect(megabytes(undefined)).toBeNull();
  });
  it('cast with the lines each speaks; places with their scenes; Arabic names marked', () => {
    expect(f.cast.map((c) => [c.name, c.line, c.lang])).toEqual([['Elias Moore', '2 lines', undefined], ['نجم', '1 line', 'ar']]);
    expect(f.places.map((l) => [l.name, l.line])).toEqual([['Elias’s Workshop', 'Interior · Scenes 1 and 2']]);
  });
  it('a film without a cut: no player, the stage as the primary into the workspace', () => {
    const t = studio({ cutAssetId: undefined, stage: 'STORYBOARD', exports: [] });
    const g = filmPage(t.productions[0], t);
    expect(g.cut).toBeUndefined();
    expect(g.primary).toEqual({ label: 'Continue: storyboard', href: '/shorts/short-1/production?tab=storyboard', play: false });
    expect(g.status.words).toBe('Storyboard');
  });
});

describe('the credits', () => {
  it('only the departments that worked on the film, each with what it made', () => {
    const s = studio();
    const credits = creditsOf(s.productions[0], s, {
      handoffs: [{ stage: 'SCRIPT', producerDepartment: 'STORY', createdAt: T }, { stage: 'EDIT', producerDepartment: 'POST', createdAt: T }],
      runs: [{ departmentId: 'VIDEO', outcome: 'COMPLETED', jobType: 'GENERATE_TAKE' }, { departmentId: 'SOUND', outcome: 'FAILED', jobType: 'X' }],
    }, [{ id: 'STORY', name: 'Story Development' }, { id: 'POST', name: 'Post-Production' }, { id: 'VIDEO', name: 'Video Production' }]);
    expect(credits.map((c) => [c.role, c.name, c.made])).toEqual([
      ['Written by', 'Story Development', '2 scenes · 3 lines of dialogue'],
      ['Filmed by', 'Video Production', '3 takes for 3 shots'],
      ['Cut by', 'Post-Production', '1 cut · exported 1080p'],
    ]);
    expect(credits[0].href).toBe('/studio/departments/STORY');
  });
});
