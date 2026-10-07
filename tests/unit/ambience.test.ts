import { describe, expect, it } from 'vitest';
import { ambiencePrompt, ambienceVerdict, placesWithoutAmbience } from '@/worker/handlers/sound';
import { setLocationAmbience } from '@/domain/actions';
import { deriveWorld } from '@/domain/world';
import { buildAudioTimeline } from '@/domain/timeline';
import { seed } from '@/domain/sample';
import type { LocationAmbience } from '@/domain/types';

/** THE PLACES' AMBIENCE (Phase 5 sound design): one bed per place, described from the place and the time and weather its
 *  scenes are written in, kept only when heard and clean, carried by the World Bible to the cut. */

const sc0 = (p: { scenes: Array<{ id: string; locationId?: string }> }, sceneId: string) => p.scenes.find((sc) => sc.id === sceneId)?.locationId;

const lantern = { kind: 'INTERIOR' as const, description: 'The lantern room of a Victorian lighthouse: a circular iron gallery around a great brass lens, curved storm windows.', layout: { materials: ['cast iron', 'brass', 'glass'] } };
const storm = [
  { timeOfDay: 'NIGHT' as const, purpose: 'Marcus climbs to the lamp in the storm', beats: [{ id: 'b1', action: 'Rain lashes the circular windows behind him.', lines: [] }] },
  { timeOfDay: 'NIGHT' as const, purpose: 'The radio', beats: [{ id: 'b2', action: 'The beam cuts through the rain; the harbour below is lost in mist.', lines: [] }] },
];

describe('ambiencePrompt', () => {
  it('says the place, its materials, the one time its scenes play at and the weather they are written in; never voices or music', () => {
    const p = ambiencePrompt(lantern, storm);
    expect(p).toMatch(/^Room tone and ambience inside: The lantern room of a Victorian lighthouse/);
    expect(p).toContain('cast iron, brass, glass');
    expect(p).toContain('at night');
    expect(p).toContain('heavy rain');
    expect(p).toContain('the sea and waves below');
    expect(p).toContain('still, foggy air');
    expect(p).toContain('heard from inside');
    expect(p).toMatch(/no voices, no speech, no music\.$/);
    expect(p.length).toBeLessThanOrEqual(600);
  });
  it('an exterior with no scenes is the place alone; scenes at several times name none; a long description is cut to 600', () => {
    const out = ambiencePrompt({ kind: 'EXTERIOR', description: 'A quiet market street' });
    expect(out).toBe('Outdoor ambience at: A quiet market street. Continuous and steady, no voices, no speech, no music.');
    expect(ambiencePrompt(lantern, [{ ...storm[0] }, { ...storm[1], timeOfDay: 'DAWN' }])).not.toMatch(/at night|at dawn/);
    expect(ambiencePrompt({ kind: 'EXTERIOR', description: 'x '.repeat(400), layout: { materials: Array.from({ length: 4 }, () => 'y'.repeat(100)) } }, storm).length).toBeLessThanOrEqual(600);
  });
});

describe('loopableArgs — a bed that loops without a seam', () => {
  it('cross-fades the head into the tail: the file is d shorter and its end continues into its start', async () => {
    const fsp = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { ffmpeg } = await import('@/server/media/ffmpeg');
    const { ffprobe } = await import('@/server/media');
    const { loopableArgs } = await import('@/worker/handlers/sound');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'loop-'));
    try {
      const src = path.join(dir, 'src.wav'); const out = path.join(dir, 'out.wav');
      await ffmpeg(['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=6:c=pink:r=48000:a=0.1', '-c:a', 'pcm_s16le', src]);
      await ffmpeg(loopableArgs(src, out, 1));
      const probe = await ffprobe(out);
      expect(probe.durationSeconds).toBeCloseTo(5, 1);
      expect(probe.sampleRate).toBe(48000);
    } finally { await fsp.rm(dir, { recursive: true, force: true }); }
  }, 30_000);
});

describe('ambienceVerdict', () => {
  it('keeps a heard, limited bed; refuses silence and a peak over −1 dBTP', () => {
    expect(ambienceVerdict({ integratedLufs: -28, truePeakDbtp: -3 })).toEqual({ ok: true });
    expect(ambienceVerdict({ integratedLufs: -70, truePeakDbtp: -40 }).ok).toBe(false);
    expect(ambienceVerdict({ integratedLufs: Number.NEGATIVE_INFINITY, truePeakDbtp: Number.NaN }).reason).toMatch(/silent/);
    expect(ambienceVerdict({ integratedLufs: -20, truePeakDbtp: 0.2 }).reason).toMatch(/0\.20 dBTP/);
  });
});

describe('the place keeps its bed and the World Bible carries it', () => {
  const s = seed();
  const bed: LocationAmbience = { assetId: 'voice-low', description: 'Room tone inside the café at night', seconds: 30, model: 'MOSS-SoundEffect v2', seed: 7, createdAt: '2026-10-08T00:00:00.000Z' };

  it('setLocationAmbience needs an audio recording in the library and a description; null takes it away', () => {
    const withBed = setLocationAmbience(s, 'cafe', bed);
    expect(withBed.locations.find((l) => l.id === 'cafe')?.ambience).toEqual(bed);
    expect(() => setLocationAmbience(s, 'cafe', { ...bed, assetId: 'nope' })).toThrow(/not in the library/);
    expect(() => setLocationAmbience(s, 'cafe', { ...bed, assetId: 'portrait-nour' })).toThrow(/audio recording/);
    expect(() => setLocationAmbience(s, 'cafe', { ...bed, description: ' ' })).toThrow(/description/);
    expect(setLocationAmbience(withBed, 'cafe', null).locations.find((l) => l.id === 'cafe')?.ambience).toBeUndefined();
  });

  it('the bible derives the bed from the place; the cut loops it under the place’s scenes; taking it away removes it', () => {
    const withBed = setLocationAmbience(s, 'cafe', bed);
    const bible = deriveWorld(withBed, { kind: 'SHOW', showId: 'last-sip' }, undefined, '2026-10-08T00:00:00.000Z');
    expect(bible.locations.find((l) => l.locationId === 'cafe')?.ambience).toEqual({ assetId: 'voice-low', description: bed.description });
    // the cut: a production at the café with a chosen take hears the bed, looped (a generated recording, not a sample)
    const p = withBed.productions.find((x) => x.scenes.some((sc) => sc.locationId === 'cafe') && x.shots.some((sh) => sh.selectedTakeId && sc0(x, sh.sceneId) === 'cafe'));
    expect(p).toBeDefined();
    const ambience = Object.fromEntries(bible.locations.filter((l) => l.ambience?.assetId).map((l) => [l.locationId, l.ambience!.assetId!]));
    const assets = withBed.assets.map((a) => (a.id === 'voice-low' ? { ...a, sample: false } : a));
    const cues = buildAudioTimeline(p!, assets, { ambience }).cues.filter((c) => c.lineage.startsWith('ambience:voice-low'));
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((c) => c.kind === 'AMBIENCE' && c.loop && !c.voice)).toBe(true);
    // a sample clip is never a bed
    expect(buildAudioTimeline(p!, withBed.assets, { ambience }).cues.filter((c) => c.lineage.startsWith('ambience:'))).toHaveLength(0);
    const after = deriveWorld(setLocationAmbience(withBed, 'cafe', null), { kind: 'SHOW', showId: 'last-sip' }, bible, '2026-10-08T00:00:01.000Z');
    expect(after.locations.find((l) => l.locationId === 'cafe')?.ambience).toBeUndefined();
  });

  it('placesWithoutAmbience: the production’s places with no bed yet', () => {
    const p = s.productions.find((x) => x.id === 's1e1')!;
    const places = [...new Set(p.scenes.map((sc) => sc.locationId).filter(Boolean))];
    expect(placesWithoutAmbience(p, s.locations)).toEqual(places);
    expect(placesWithoutAmbience(p, setLocationAmbience(s, 'cafe', bed).locations)).toEqual(places.filter((x) => x !== 'cafe'));
  });
});
