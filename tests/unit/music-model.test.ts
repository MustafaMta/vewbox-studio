import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import type { StudioState } from '@/domain/types';
import { catalogue, continueAction, filterItems, lyricsOf, performersLine, songTrack, titlePage } from '@/components/music/model';

/** The music video pages read only the studio's real state (src/components/music/model.ts). */
const studio = (): StudioState => structuredClone(seed());
const mv = (s: StudioState, id: string) => s.productions.find((p) => p.id === id)!;

describe('the catalogue', () => {
  it('lists every music video, most recently worked on first, with its song, performers, length and status', () => {
    const items = catalogue(studio());
    expect(items.map((x) => x.id)).toEqual(['rooftop-radio', 'river-lights']);
    expect(items[0]).toMatchObject({ title: 'Rooftop Radio', performers: 'Layla & Karim', duration: '0:36', status: { words: 'Story', tone: 'idle' }, href: '/music-videos/rooftop-radio' });
    expect(items[1]).toMatchObject({ title: 'River Lights', performers: 'Nour', duration: '0:48', status: { words: 'Cast and world', tone: 'idle' } });
    expect(items[1].src).toBe('/sample/covers/river-lights-square.svg');
  });

  it('previews the real song only when its file exists', () => {
    const s = studio();
    expect(catalogue(s)[1].track).toMatchObject({ id: 'song-river-lights', src: '/sample/audio/river-lights-sample.m4a', duration: 48 });
    s.assets.find((a) => a.id === 'song-river-lights')!.unavailable = true;
    expect(songTrack(s, mv(s, 'river-lights'))).toBeNull();
    expect(catalogue(s)[1].track).toBeNull();
    delete mv(s, 'rooftop-radio').song;
    expect(catalogue(s)[0].track).toBeNull();
  });

  it('filters by status', () => {
    const s = studio();
    mv(s, 'river-lights').stage = 'COMPLETE';
    const items = catalogue(s);
    expect(filterItems(items, 'finished').map((x) => x.id)).toEqual(['river-lights']);
    expect(filterItems(items, 'working').map((x) => x.id)).toEqual(['rooftop-radio']);
    expect(filterItems(items, 'all')).toHaveLength(2);
  });

  it('names the performers from the singers when no artist is written', () => {
    const s = studio();
    delete mv(s, 'rooftop-radio').artist;
    expect(performersLine(s, mv(s, 'rooftop-radio'))).toBe('Layla & Karim');
  });
});

describe('the lyrics', () => {
  it('are read section by section in the language they are sung, with the translation and each section’s singers', () => {
    const s = studio();
    const secs = lyricsOf(s, mv(s, 'river-lights'));
    expect(secs.map((x) => x.label)).toEqual(['Intro', 'Verse', 'Chorus', 'Outro']);
    expect(secs[0]).toMatchObject({ instrumental: true, lines: [], at: '0:00' });
    expect(secs[1].lines.map((l) => l.lang)).toEqual(['ar', 'ar']);
    expect(secs[1].lines[0].text).toBe('النهر يحفظ الأضواء التي يستعيرها');
    expect(secs[1].translation.map((l) => l.text)).toEqual(['The river keeps the lights it borrows,', 'returns them one by one at dawn.']);
    expect(secs[1].singers.map((p) => p.name)).toEqual(['Nour']);
    expect(secs[2].at).toBe('0:24');
  });

  it('number a kind that repeats, keep English songs in English and give alternating lines their singer', () => {
    const s = studio();
    const p = mv(s, 'rooftop-radio');
    p.language = 'EN';
    p.song!.sections.splice(2, 0, { id: 'rr2b', kind: 'VERSE', text: 'Second verse', singerIds: ['karim'], from: 18, to: 18, lines: [{ singerId: 'layla', text: 'One line' }, { singerId: 'karim', text: 'Another line' }] });
    const secs = lyricsOf(s, p);
    expect(secs.map((x) => x.label)).toEqual(['Intro', 'Verse 1', 'Verse 2', 'Chorus', 'Outro']);
    expect(secs[1].lines[0]).toMatchObject({ text: 'Turn the dial, the city’s talking,', lang: undefined });
    expect(secs[2].lines.map((l) => [l.text, l.singer?.name])).toEqual([['One line', 'Layla'], ['Another line', 'Karim']]);
    expect(secs[3].singers.map((x) => x.name)).toEqual(['Layla', 'Karim']);
  });
});

describe('the title page', () => {
  it('continues in the production, at the tab of the next step', () => {
    const s = studio();
    expect(continueAction(mv(s, 'river-lights'))).toEqual({ label: 'Continue: filming', href: '/music-videos/river-lights/production?tab=produce' });
    expect(continueAction(mv(s, 'rooftop-radio')).href).toMatch(/^\/music-videos\/rooftop-radio\/production\?tab=/);
    const done = mv(s, 'river-lights'); done.stage = 'COMPLETE';
    expect(continueAction(done)).toEqual({ label: 'Open the production', href: '/music-videos/river-lights/production?tab=final' });
    delete done.song;
    expect(continueAction(done)).toEqual({ label: 'Write the song', href: '/music-videos/river-lights/production?tab=song' });
  });

  it('shows only the facts the studio has: genre, mood and tempo when known, the cast with what each sings', () => {
    const s = studio();
    const m = titlePage(s, mv(s, 'river-lights'));
    expect(m.title).toBe('River Lights');
    expect(m.altTitle).toBe('أضواء النهر');
    expect(m.facts.map((f) => f.label)).toEqual(['Genre', 'Mood', 'Treatment', 'Sung in', 'Song']);
    expect(m.cast).toEqual([expect.objectContaining({ name: 'Nour', role: 'Sings the verse and chorus' })]);
    expect(m.performers.map((p) => p.name)).toEqual(['Nour']);
    expect(m.slate).toEqual(['Music video', '2026', '0:48', '2 sections', 'Realistic']);
    expect(m.video).toBeUndefined();
    mv(s, 'river-lights').song!.bpm = 92;
    expect(titlePage(s, mv(s, 'river-lights')).facts).toContainEqual({ label: 'Tempo', value: '92 BPM' });
  });

  it('says when the song has no file instead of drawing a dead transport', () => {
    const s = studio();
    s.assets.find((a) => a.id === 'song-river-lights')!.unavailable = true;
    const m = titlePage(s, mv(s, 'river-lights'));
    expect(m.track).toBeNull();
    expect(m.noFile).toBe(true);
  });
});
