import { describe, expect, it } from 'vitest';
import type { Asset, CutNote, Production, StudioState } from '@/domain/types';
import { cutView, notesOfCut, screeningList, screeningOf, shotAt, slateOf } from '@/components/screening/model';

/** The Screening Room's reading of the studio (src/components/screening/model.ts): which films have a cut, the cut
 *  versions with their caption track and shot timeline, the exports with their subtitle files, and which notes belong
 *  to which cut. Nothing is invented: a missing record stays missing. */

const asset = (a: Partial<Asset> & Pick<Asset, 'id' | 'kind'>): Asset => ({ src: `/api/media/${a.id}`, label: a.id, tags: [], sample: false, origin: 'DERIVED', createdAt: '2026-10-03T09:00:00Z', ...a });
const shots = [{ shotId: 'sh1', start: 0, duration: 8, takeAssetId: 'v1' }, { shotId: 'sh2', start: 8, duration: 6, takeAssetId: 'v2b' }];
const cut = (id: string, at: string) => asset({ id, kind: 'VIDEO', tags: ['cut'], createdAt: at, width: 1920, height: 1080, durationSeconds: 14, provenance: { shots } });
const sub = (id: string, forId: string, lang: string, format: string) => asset({ id, kind: 'SUBTITLE', tags: ['subtitles', lang, format], provenance: { for: forId, lang, format } });

function studio(): Pick<StudioState, 'productions' | 'assets' | 'shows'> {
  const p = {
    id: 'film', kind: 'SHORT', title: 'The Static Sky', logline: 'A radio.', synopsis: '', aspect: 'WIDE_16_9', updatedAt: '2026-10-03T10:00:00Z', createdAt: '2026-10-01T10:00:00Z',
    scenes: [{ id: 'sc1', number: 1 }, { id: 'sc2', number: 2 }],
    shots: [
      { id: 'sh1', sceneId: 'sc1', number: 1, takes: [{ id: 't1', assetId: 'v1', status: 'READY' }] },
      { id: 'sh2', sceneId: 'sc2', number: 4, takes: [{ id: 't2a', assetId: 'v2a', status: 'READY' }, { id: 't2b', assetId: 'v2b', status: 'READY' }] },
    ],
    cutAssetId: 'cut2', exports: [{ id: 'e1', assetId: 'exp', format: 'mp4-h264', resolution: '1080', subtitles: 'en', createdAt: '2026-10-03T11:00:00Z', bytes: 59052444, durationSeconds: 56 }],
  } as unknown as Production;
  const draft = { ...p, id: 'draft', title: 'No cut yet', cutAssetId: undefined, exports: [], scenes: [], shots: [] } as unknown as Production;
  return {
    shows: [],
    productions: [draft, p],
    assets: [cut('cut1', '2026-10-03T08:00:00Z'), cut('cut2', '2026-10-03T09:00:00Z'), sub('s-en-vtt', 'cut2', 'en', 'vtt'), sub('s-ar-srt', 'cut2', 'ar', 'srt'), sub('s-en-srt', 'cut2', 'en', 'srt'),
      asset({ id: 'exp', kind: 'VIDEO', tags: ['export'] }), sub('x-en-srt', 'exp', 'en', 'srt')],
  };
}

describe('the Screening Room model', () => {
  it('lists only the films with a playable cut, as poster cards that open the theatre', () => {
    const cards = screeningList(studio());
    expect(cards.map((c) => c.id)).toEqual(['film']);
    expect(cards[0].href).toBe('/screening?p=film');
    expect(cards[0].meta).toBe('Short film · 0:14 · Cut 2');
  });

  it('reads the cut versions oldest first, the English caption track and the shot timeline from the cut itself', () => {
    const s = studio();
    const sc = screeningOf(s, 'film')!;
    expect(sc.versions.map((v) => [v.version, v.assetId, v.current])).toEqual([[1, 'cut1', false], [2, 'cut2', true]]);
    const c = cutView(s, sc, null)!;
    expect(c.version.version).toBe(2);
    expect(c.captions).toEqual([{ src: '/api/media/s-en-vtt', lang: 'en', label: 'English' }]);
    expect(c.subtitleFiles.map((f) => `${f.language} ${f.format}`)).toEqual(['English SRT', 'English VTT', 'Arabic SRT']);
    expect(c.timeline.map((t) => [t.label, t.start, t.takeNumber, t.takeCount, t.href])).toEqual([['1.1', 0, 1, 1, '/shorts/film/shots/sh1'], ['2.4', 8, 2, 2, '/shorts/film/shots/sh2']]);
    expect(cutView(s, sc, 1)!.version.assetId).toBe('cut1');
    expect(cutView(s, sc, 9)!.version.assetId).toBe('cut2');
    expect(slateOf(sc, c)).toContain('Cut 2 of 2');
  });

  it('says what an export is in words, with its own subtitle files', () => {
    const sc = screeningOf(studio(), 'film')!;
    expect(sc.exports).toHaveLength(1);
    expect(sc.exports[0]).toMatchObject({ words: ['MP4', '1080p', '56 s'], subtitles: 'English subtitles, burned in', size: '56.3 MB' });
    expect(sc.exports[0].subtitleFiles.map((f) => f.id)).toEqual(['x-en-srt']);
  });

  it('finds the shot at a time, and keeps each note on its own cut', () => {
    const s = studio();
    const sc = screeningOf(s, 'film')!;
    const c2 = cutView(s, sc, 2)!; const c1 = cutView(s, sc, 1)!;
    expect(shotAt(c2.timeline, 9.5)?.label).toBe('2.4');
    expect(shotAt(c2.timeline, 14)?.label).toBe('2.4');
    const n = (id: string, cutAssetId: string | undefined, timecode: number) => ({ id, productionId: 'film', cutAssetId, timecode, text: id, author: 'producer', status: 'open', createdAt: '2026-10-03T12:00:00Z', updatedAt: '2026-10-03T12:00:00Z' }) as CutNote;
    const notes = [n('b', 'cut2', 9), n('a', 'cut1', 3), n('c', undefined, 1)];
    expect(notesOfCut(notes, c2).map((x) => x.id)).toEqual(['c', 'b']);
    expect(notesOfCut(notes, c1).map((x) => x.id)).toEqual(['a']);
  });

  it('has nothing to screen for an unknown production', () => {
    expect(screeningOf(studio(), 'nope')).toBeNull();
    const s = studio();
    expect(cutView(s, screeningOf(s, 'draft')!, null)).toBeNull();
  });
});
