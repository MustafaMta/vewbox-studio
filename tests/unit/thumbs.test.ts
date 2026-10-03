import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { THUMB_RULES, backgroundFor, hasAlphaFormat, isFigureLike, jpegArgs, makeFramePoster, makeThumbnail, portraitCrop, posterSize, thumbBudget, thumbPathFor, thumbSize } from '@/server/media/thumbs';
import { keyFrameFor, posterOf } from '@/studio/selectors/poster';
import type { Asset, Production, Shot, Take } from '@/domain/types';
import { seed } from '@/domain/sample';
import { deleteAsset, updateProduction } from '@/domain/actions';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B7: display-size thumbnails and the composed frame poster. The maths is pure;
 *  the two encodes run ffmpeg on a generated picture (as the presentation tests do). */

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('thumbnail rules', () => {
  it('long side at most 960, never upscaled, even sides', () => {
    expect(thumbSize(1344, 768)).toEqual({ width: 960, height: 548 });
    expect(thumbSize(928, 1664)).toEqual({ width: 536, height: 960 });
    expect(thumbSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(thumbSize(1000, 1000)).toEqual({ width: 960, height: 960 });
  });
  it('a figure (tier, a character tag, or portrait orientation) has the 120 KB budget; a still 160 KB', () => {
    expect(isFigureLike({ tier: 'CANONICAL', width: 1344, height: 768 })).toBe(true);
    expect(isFigureLike({ tags: ['take', 'poster'], width: 1344, height: 768 })).toBe(false);
    expect(isFigureLike({ tags: ['character', 'full-body'], width: 1344, height: 768 })).toBe(true);
    expect(isFigureLike({ width: 928, height: 1664 })).toBe(true);
    expect(thumbBudget(true)).toBe(120 * 1024); expect(thumbBudget(false)).toBe(160 * 1024);
    expect(thumbPathFor('image/2026/10/gen-abc.png')).toBe('image/2026/10/gen-abc.thumb.jpg');
    expect(thumbPathFor('image/2026/10/gen.abc.webp')).toBe('image/2026/10/gen.abc.thumb.jpg');
  });
  it('transparency is flattened onto the measured edge colour, else a neutral dark', () => {
    expect(hasAlphaFormat('rgba')).toBe(true); expect(hasAlphaFormat('yuv420p')).toBe(false); expect(hasAlphaFormat('yuvj444p')).toBe(false); expect(hasAlphaFormat('pal8')).toBe(true); expect(hasAlphaFormat('ya8')).toBe(true); expect(hasAlphaFormat('rgb24')).toBe(false); expect(hasAlphaFormat('gray')).toBe(false);
    expect(backgroundFor(undefined)).toBe(THUMB_RULES.fallbackBackground);
    expect(backgroundFor({ edge: 'oklch(1.000 0.000 0.0)' })).toBe('#ffffff');
    expect(jpegArgs('in.png', 'out.jpg', 5, { width: 100, height: 60, maxBytes: 1 })).toEqual(['-v', 'error', '-i', 'in.png', '-frames:v', '1', '-filter_complex', '[0:v]scale=100:60:flags=lanczos,format=yuvj420p', '-q:v', '5', '-update', '1', 'out.jpg']);
    expect(jpegArgs('in.png', 'out.jpg', 5, { width: 100, height: 60, maxBytes: 1, hasAlpha: true, background: '#ffffff', crop: { x: 1, y: 2, w: 50, h: 75 } })[7]).toBe('color=c=0xffffff:s=100x60:d=1[bg];[0:v]crop=50:75:1:2,scale=100:60:flags=lanczos,format=rgba[fg];[bg][fg]overlay=shortest=1,format=yuvj420p');
  });
});

describe('the 2:3 crop around the focal point', () => {
  it('a wide frame keeps its height and slides to the focal point, inside the picture', () => {
    expect(portraitCrop(1344, 768, { x: 0.5, y: 0.4 })).toEqual({ x: 416, y: 0, w: 512, h: 768 });
    expect(portraitCrop(1344, 768, { x: 0.05, y: 0.4 })).toEqual({ x: 0, y: 0, w: 512, h: 768 });
    expect(portraitCrop(1344, 768, { x: 0.98, y: 0.4 })).toEqual({ x: 832, y: 0, w: 512, h: 768 });
  });
  it('a tall picture keeps its width; a 2:3 picture is taken whole', () => {
    expect(portraitCrop(928, 1664, { x: 0.5, y: 0.3 })).toEqual({ x: 0, y: 0, w: 928, h: 1392 });
    expect(portraitCrop(928, 1664, { x: 0.5, y: 0.9 })).toEqual({ x: 0, y: 272, w: 928, h: 1392 });
    expect(portraitCrop(1000, 1500)).toEqual({ x: 0, y: 0, w: 1000, h: 1500 });
  });
  it('the poster is 960×1440 at most and never upscaled', () => {
    expect(posterSize({ w: 512, h: 768 })).toEqual({ width: 512, height: 768 });
    expect(posterSize({ w: 1280, h: 1920 })).toEqual({ width: 960, height: 1440 });
  });
});

describe('the key frame of a production (§5.9)', () => {
  const video = (id: string, over: Partial<Asset> = {}): Asset => ({ id, kind: 'VIDEO', src: `/api/media/${id}`, label: id, tags: ['take'], sample: false, origin: 'GENERATED', fps: 24, durationSeconds: 7, createdAt: '2026-10-03T08:00:00.000Z', ...over });
  const image = (id: string): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'DERIVED', width: 640, height: 366, createdAt: '2026-10-03T08:00:00.000Z' });
  const take = (id: string, assetId: string, over: Partial<Take> = {}): Take => ({ id, label: id, assetId, createdAt: '2026-10-03T08:00:00.000Z', status: 'READY', provider: 'MINIMAX', fps: 24, thumbnailAssetId: `poster-${id}`, ...over });
  const shot = (id: string, sceneId: string, number: number, takes: Take[], selected?: string, opening?: string): Shot => ({ id, sceneId, number, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 7, characterIds: [], dialogue: [], transition: 'CUT', takes, selectedTakeId: selected, openingFrameAssetId: opening });
  const scenes = [{ id: 'sc1', number: 1 }, { id: 'sc2', number: 2 }] as Production['scenes'];
  // shots listed out of storyboard order on purpose: the rule reads scene and shot numbers
  const p = { scenes, shots: [shot('s2-4', 'sc2', 4, [take('t-a', 'v-a', { trimStartFrames: 22 }), take('t-b', 'v-b')], 't-a', 'drawn-24'), shot('s1-1', 'sc1', 1, [take('t-c', 'v-c')], 't-c', 'drawn-11'), shot('s2-1', 'sc2', 1, [take('t-d', 'v-d')], 't-d')] };
  const assets = [video('v-a'), video('v-b'), video('v-c'), video('v-d'), image('poster-t-a'), image('poster-t-b'), image('poster-t-c'), image('poster-t-d'), image('drawn-24'), image('drawn-11')];

  it('default: the LAST shot’s selected take’s opening frame — the first frame the cut shows, after a continuation’s head', () => {
    expect(keyFrameFor(p, assets)).toEqual({ source: 'TAKE_OPENING_FRAME', shotId: 's2-4', sceneNumber: 2, shotNumber: 4, takeId: 't-a', videoAssetId: 'v-a', frameSeconds: 0.9167, imageAssetId: 'poster-t-a', chosen: false, key: 'take:t-a:v-a@0.9167' });
  });
  it('a sample clip, a rejected or unavailable take is not footage: the shot’s drawn opening frame stands in; then earlier shots', () => {
    const sample = { ...p, shots: p.shots.map((s) => (s.id === 's2-4' ? { ...s, takes: s.takes.map((t) => ({ ...t, provider: 'SAMPLE' as const })) } : s)) };
    expect(keyFrameFor(sample, assets)).toMatchObject({ source: 'DRAWN_OPENING_FRAME', shotId: 's2-4', imageAssetId: 'drawn-24', key: 'drawn:s2-4:drawn-24' });
    expect(keyFrameFor(p, assets.map((a) => (a.id === 'v-a' ? { ...a, unavailable: true } : a)))).toMatchObject({ source: 'DRAWN_OPENING_FRAME', shotId: 's2-4' });
    const rated = { ...p, shots: p.shots.map((s) => (s.id === 's2-4' ? { ...s, takes: s.takes.map((t) => ({ ...t, rating: 'REJECTED' as const })), openingFrameAssetId: undefined } : s)) };
    expect(keyFrameFor(rated, assets)).toMatchObject({ source: 'TAKE_OPENING_FRAME', shotId: 's2-1', takeId: 't-d', frameSeconds: 0 });
    expect(keyFrameFor({ scenes: [], shots: [] }, assets)).toBeNull();
  });
  it('the producer’s choice overrides the default; a chosen take that cannot be used is never silently swapped', () => {
    expect(keyFrameFor(p, assets, { shotId: 's1-1' })).toMatchObject({ shotId: 's1-1', takeId: 't-c', chosen: true });
    expect(keyFrameFor(p, assets, { shotId: 's2-4', takeId: 't-b' })).toMatchObject({ takeId: 't-b', videoAssetId: 'v-b', frameSeconds: 0, chosen: true });
    expect(keyFrameFor(p, assets.filter((a) => a.id !== 'v-b'), { shotId: 's2-4', takeId: 't-b' })).toMatchObject({ takeId: 't-a', chosen: false });
  });
  it('the sample studio: its last shot’s take is a bundled clip, so the drawn opening frame; key art wins over the frame poster', () => {
    const s = seed();
    const ep = s.productions.find((x) => x.id === 's1e1')!;
    expect(keyFrameFor(ep, s.assets)).toMatchObject({ source: 'DRAWN_OPENING_FRAME', shotId: 's1e1-7', sceneNumber: 2, shotNumber: 4, imageAssetId: 'frame-07-a' });
    expect(posterOf(ep, s.assets)?.kind).toBe('KEY_ART');
    expect(posterOf({ framePosterAssetId: ep.posterAssetId }, s.assets)?.kind).toBe('FRAME_POSTER');
    expect(posterOf({}, s.assets)).toBeNull();
  });
  it('removing a frame poster’s asset clears the production’s pointer (deleteAsset)', () => {
    const s = seed();
    const withFrame = updateProduction(s, 'paper-boats', { framePosterAssetId: 'frame-15-a' });
    expect(withFrame.productions.find((x) => x.id === 'paper-boats')!.framePosterAssetId).toBe('frame-15-a');
    expect(deleteAsset(withFrame, 'frame-15-a').productions.find((x) => x.id === 'paper-boats')!.framePosterAssetId).toBeUndefined();
  });
});
describe.runIf(hasFfmpeg)('encodes', () => {
  it('a thumbnail fits its budget at display size; a poster is 2:3 around the focal point; originals untouched', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vewbox-thumbs-'));
    const src = path.join(dir, 'frame.png');
    // a busy 1344×768 picture (noise does not compress: the budget loop has to work)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1344x768:rate=1,noise=alls=40:allf=t', '-frames:v', '1', src]);
    const before = fs.statSync(src);
    const t = await makeThumbnail(src, path.join(dir, 'frame.thumb.jpg'), { figure: false });
    expect(t.width).toBe(960); expect(t.height).toBe(548);
    expect(t.bytes).toBeLessThanOrEqual(THUMB_RULES.stillBytes);
    expect(fs.statSync(path.join(dir, 'frame.thumb.jpg')).size).toBe(t.bytes);
    const f = await makeThumbnail(src, path.join(dir, 'frame.fig.jpg'), { figure: true });
    expect(f.bytes).toBeLessThanOrEqual(THUMB_RULES.figureBytes);
    const p = await makeFramePoster(src, path.join(dir, 'poster.jpg'), { focal: { x: 0.2, y: 0.5 } });
    expect(p.crop).toEqual({ x: 13, y: 0, w: 512, h: 768 });
    expect(p.width).toBe(512); expect(p.height).toBe(768);
    expect(p.bytes).toBeLessThanOrEqual(THUMB_RULES.poster.maxBytes);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path.join(dir, 'poster.jpg')]).toString()) as { streams: Array<{ width: number; height: number }> };
    expect(probe.streams[0]).toEqual({ width: 512, height: 768 });
    const after = fs.statSync(src);
    expect(after.size).toBe(before.size); expect(after.mtimeMs).toBe(before.mtimeMs);
    await fsp.rm(dir, { recursive: true, force: true });
  }, 60_000);
});
