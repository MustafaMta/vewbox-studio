import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerProvider, type Track } from '@/components/players/PlayerProvider';
import { InlinePlayer } from '@/components/players/InlinePlayer';
import { CanvasPlayer } from '@/components/players/CanvasPlayer';
import { TheatrePlayer } from '@/components/players/TheatrePlayer';
import { PlayerBar } from '@/components/players/PlayerBar';
import { Waveform, barsOf } from '@/components/players/Waveform';
import { SongTransport } from '@/components/players/music/SongTransport';
import { activeLine } from '@/components/players/music/LyricView';
import { createSyncBus, handOff } from '@/components/players/sync';
import { timecode } from '@/components/players/time';
import { keyName } from '@/components/players/useShortcutScope';
import { FilmStrip } from '@/components/edit/FilmStrip';
import { Timeline } from '@/components/edit/Timeline';
import { DualScaleStrip } from '@/components/edit/DualScaleStrip';
import { StoryboardReel, reelIndexAt } from '@/components/edit/StoryboardReel';
import { CompareAB } from '@/components/edit/CompareAB';
import { stageSegments } from '@/components/media/StageMeter';
import { artStyle, faceBoxOf, faceCrop, initials, objectPosition } from '@/components/media/art';

/** DESIGN-SYSTEM-V4 §5.12–5.14, §2.6, §8.5 F3: media time runs left to right in both languages, the waveform meets its
 *  contrast, and the small pure parts (time, keys, the sync bus, crops) do what the components rely on. The browser
 *  test tests/e2e/v4/f3-ltr.spec.ts checks the same in the Arabic interface, computed. */

const html = (el: ReactElement) => renderToStaticMarkup(h(PlayerProvider, null, el));
const track: Track = { id: 't', src: '/sample/audio/river-lights-sample.m4a', title: 'River Lights', duration: 48 };

describe('every transport, seek bar, waveform, strip and timeline is laid out left to right', () => {
  const cases: Array<[string, ReactElement, RegExp]> = [
    ['inline player', h(InlinePlayer, { src: '/v.mp4' }), /class="ptransport" dir="ltr"/],
    ['canvas player', h(CanvasPlayer, { src: '/v.mp4' }), /class="cplayer-bar" dir="ltr"/],
    ['theatre player', h(TheatrePlayer, { src: '/v.mp4' }), /class="tplayer-transport"[^>]*dir="ltr"/],
    ['song transport', h(SongTransport, { track, title: 'River Lights' }), /class="stransport" dir="ltr"/],
    ['player bar', h(PlayerBar, { track, persistent: true }), /class="playerbar-transport" dir="ltr"/],
    ['waveform', h(Waveform, { src: '/a.m4a', progress: 0.5, label: 'Waveform', unavailableText: 'x' }), /class="wave" dir="ltr"/],
    ['film strip', h(FilmStrip, { frames: [{ id: 'a', number: 1, src: '/f.svg' }] }), /class="fstrip" [^>]*dir="ltr"/],
    ['timeline', h(Timeline, { duration: 10, time: 0, onSeek: () => undefined, clips: [{ id: 'a', number: 1, from: 0, to: 5 }] }), /class="tl" dir="ltr"/],
    ['dual-scale strip', h(DualScaleStrip, { duration: 600, start: 0, length: 60, onStart: () => undefined }), /class="dstrip" dir="ltr"/],
    ['storyboard reel', h(StoryboardReel, { shots: [{ id: 'a', number: 1, src: '/f.svg', duration: 2 }] }), /class="reel-bar" dir="ltr"/],
    ['compare A/B', h(CompareAB, { a: { src: '/a.mp4', label: 'Take 2' }, b: { src: '/b.mp4', label: 'Take 3' } }), /class="cmp-bar" dir="ltr"/],
  ];
  for (const [name, el, re] of cases) it(name, () => { const m = html(el); expect(m).toMatch(re); expect(m).toMatch(/class="seekwrap[^"]*"[^>]*dir="ltr"|class="wave" dir="ltr"|class="fstrip"|class="tl"|class="dstrip"/); });
  it('the play glyph carries no mirroring class', () => {
    for (const [, el] of cases) expect(html(el)).not.toMatch(/<svg[^>]*class="[^"]*rtl:(rotate|-scale)/);
  });
});

describe('waveform contrast (§2.6)', () => {
  const tokens = fs.readFileSync(path.resolve('src/app/styles/tokens.css'), 'utf8');
  const players = fs.readFileSync(path.resolve('src/app/styles/players.css'), 'utf8');
  // DS-1: the v4 names are aliases of the v5 values (var() chains), so resolve them as the browser does
  const hex = (name: string): string => { const v = new RegExp(`${name}:\\s*([^;]+);`, 'i').exec(tokens)![1].trim(); const m = /^var\((--[\w-]+)\)$/.exec(v); return m ? hex(m[1]) : v; };
  const lum = (x: string) => { const c = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  it('unplayed bars are the control boundary (--line-control, v4 --ink-550) and played bars --text-1', () => {
    expect(players).toMatch(/--wave-rest:\s*var\(--line-control\)/);
    expect(players).toMatch(/\.wave-rest rect \{ fill: var\(--wave-rest\); \}/);
    expect(players).toMatch(/\.wave-played rect \{ fill: var\(--text-1\); \}/);
  });
  it('unplayed on the ground and on a surface ≥ 3:1; played against unplayed ≥ 3:1', () => {
    expect(ratio(hex('--ink-550'), hex('--ink-950'))).toBeGreaterThanOrEqual(3);
    expect(ratio(hex('--ink-550'), hex('--ink-900'))).toBeGreaterThanOrEqual(3);
    expect(ratio(hex('--ink-100'), hex('--ink-550'))).toBeGreaterThanOrEqual(3);
    // v3's --ink-600 failed, which is why it changed
    expect(ratio(hex('--ink-600'), hex('--ink-950'))).toBeLessThan(3);
  });
  it('bars are drawn only from real peaks, never invented', () => {
    expect(barsOf([])).toEqual([]);
    const b = barsOf([0, 0.5, 1]);
    expect(b.map((x) => x.x)).toEqual([0, 3, 6]);
    expect(b[2].h).toBe(96);
    expect(b[0].h).toBe(6);
  });
});

describe('time, keys and the sync bus', () => {
  it('timecodes are hh:mm:ss:ff', () => {
    expect(timecode(0)).toBe('00:00:00:00');
    expect(timecode(72 + 8 / 24, 24)).toBe('00:01:12:08');
    expect(timecode(3600.48, 25)).toBe('01:00:00:12');
  });
  it('key names', () => {
    const k = (key: string, o: Partial<KeyboardEvent> = {}) => keyName({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...o });
    expect(k(' ')).toBe('Space');
    expect(k('K')).toBe('k');
    expect(k('ArrowLeft', { shiftKey: true })).toBe('Shift+ArrowLeft');
    expect(k('?', { shiftKey: true })).toBe('?');
    expect(k('z', { ctrlKey: true })).toBe('Mod+z');
  });
  it('the bus passes events to the other members and remembers the playhead', () => {
    const bus = createSyncBus();
    const seen: string[] = [];
    const off = bus.on((e) => seen.push(`${e.type}@${e.time}`));
    bus.emit({ type: 'seek', time: 12, from: 'song' });
    off();
    bus.emit({ type: 'play', time: 13, from: 'song' });
    expect(seen).toEqual(['seek@12']);
    expect(bus.last()).toEqual({ type: 'play', time: 13, from: 'song' });
  });
  it('Song ⇄ Video keeps the playhead (handOff)', () => {
    const calls: string[] = [];
    const t = handOff({ time: 42.5, playing: true, pause: () => calls.push('pause song') }, { seek: (x) => calls.push(`seek video ${x}`), play: () => calls.push('play video') });
    expect(t).toBe(42.5);
    expect(calls).toEqual(['pause song', 'seek video 42.5', 'play video']);
    const quiet: string[] = [];
    handOff({ time: 3, playing: false, pause: () => quiet.push('pause') }, { seek: (x) => quiet.push(`seek ${x}`), play: () => quiet.push('play') });
    expect(quiet).toEqual(['pause', 'seek 3']);
  });
  it('the reel finds the shot for a time; the lyric view the line', () => {
    const shots = [{ id: 'a', number: 1, duration: 2 }, { id: 'b', number: 2, duration: 3 }];
    expect(reelIndexAt(shots, 0)).toEqual({ index: 0, start: 0 });
    expect(reelIndexAt(shots, 2.5)).toEqual({ index: 1, start: 2 });
    expect(reelIndexAt(shots, 99).index).toBe(1);
    const lines = [{ id: '1', text: 'a', from: 8, to: 16 }, { id: '2', text: 'b', from: 16, to: 24 }];
    expect(activeLine(lines, 4)).toBe(-1);
    expect(activeLine(lines, 16)).toBe(1);
    expect(activeLine(lines, 30)).toBe(-1);
  });
});

describe('art helpers render nothing without data', () => {
  it('artStyle keeps only the keys an element may take', () => {
    expect(artStyle(undefined)).toEqual({});
    expect(artStyle({ '--art': 'x', '--art-edge': 'y' }, ['--art-edge'])).toEqual({ '--art-edge': 'y' });
    expect(artStyle({ '--art': ' ' })).toEqual({});
  });
  it('focal crops default to 50 % 40 % and clamp', () => {
    expect(objectPosition()).toBe('50% 40%');
    expect(objectPosition({ focal: { x: 2, y: -1 } })).toBe('100% 0%');
  });
  it('face crops come from the face box, else the framing box, else nothing', () => {
    expect(faceBoxOf({})).toBeNull();
    expect(faceBoxOf({ presentation: { faceBox: { x: 0.4, y: 0.1, w: 0.2, h: 0.1 } } })).toEqual({ x: 0.4, y: 0.1, w: 0.2, h: 0.1 });
    const f = faceBoxOf({ width: 928, height: 1664, provenance: { framing: { box: { x: 0.3, y: 0.05, w: 0.4, h: 0.9 } } } })!;
    expect(f.y).toBe(0.05);
    expect(f.w * 928).toBeCloseTo(f.h * 1664, 3);
    const c = faceCrop({ x: 0.4, y: 0.1, w: 0.2, h: 0.2 });
    expect(c.size).toBe(500);
  });
  it('initials and stage segments', () => {
    expect(initials('Um Hassan')).toBe('UH');
    expect(initials('أم حسن')).toBe('أح');
    expect(stageSegments(2, 'running')).toEqual(['done', 'done', 'running', 'upcoming', 'upcoming', 'upcoming']);
    expect(stageSegments(0, 'current', 6, true).every((s) => s === 'done')).toBe(true);
  });
});

vi.restoreAllMocks();
